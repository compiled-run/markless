import { afterEach, expect, test } from 'vitest';
import { cleanup, renderCsrIslands, renderSSRIslands } from '../src/index.ts';
import { App } from './fixtures/component-row-mint.tsrx';

// A component row minted after resume renders off the page's render-data
// surface, and a composed page's only such surface is the one its resume entry
// hands over: the router's emitted route threads `renderData` into
// resumeFromPayloadDocument, so the harness's composed-island mounts must too,
// under both the served page and the browser-composed one.

const keysOf = (island: Element): string[] =>
	Array.from(island.querySelectorAll('.cards [data-card]')).map(
		(row) => row.getAttribute('data-card') ?? '',
	);
const islands = (container: Element): Element[] =>
	Array.from(container.querySelectorAll('main:has(> [data-add])'));

afterEach(() => cleanup());

for (const [mode, mount] of [
	['ssr', () => renderSSRIslands([App, App])],
	['csr', () => renderCsrIslands([App, App])],
] as const) {
	test(`${mode}: a row added in one island is minted there and the other island keeps its rows`, async () => {
		const { container } = await mount();
		const [first, second] = islands(container);
		expect(keysOf(first!)).toEqual(['north', 'south']);
		expect(keysOf(second!)).toEqual(['north', 'south']);

		(first!.querySelector('[data-add]') as HTMLElement).click();

		await expect.poll(() => keysOf(first!)).toEqual(['north', 'south', 'east']);
		expect(first!.querySelector('[data-card="east"] em.tag')?.textContent).toBe('East');
		expect(keysOf(second!)).toEqual(['north', 'south']);
	});

	// A row's callback prop is spelled in the island module's own symbol space;
	// the page loader answers it only once the island segment is put back.
	test(`${mode}: a served island row dispatches its callback inside its island`, async () => {
		const { container } = await mount();
		const [first, second] = islands(container);

		(second!.querySelector('[data-card="south"]') as HTMLElement).click();

		await expect
			.poll(() => second!.querySelector('[data-chosen]')?.textContent)
			.toBe('south');
		expect(first!.querySelector('[data-chosen]')?.textContent).toBe('none');
	});

	test(`${mode}: a minted island row dispatches its own handler inside its island`, async () => {
		const { container } = await mount();
		const [first, second] = islands(container);

		(second!.querySelector('[data-add]') as HTMLElement).click();
		await expect.poll(() => keysOf(second!)).toEqual(['north', 'south', 'east']);

		(second!.querySelector('[data-card="east"]') as HTMLElement).click();

		await expect
			.poll(() => second!.querySelector('[data-chosen]')?.textContent)
			.toBe('east');
		expect(first!.querySelector('[data-chosen]')?.textContent).toBe('none');
		expect(keysOf(first!)).toEqual(['north', 'south']);
	});
}
