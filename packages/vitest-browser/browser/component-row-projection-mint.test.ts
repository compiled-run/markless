import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/component-row-projection-mint.tsrx';
import Served from './fixtures/component-row-projection-mint-served.tsrx';

const keys = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-toast]')).map(
		(row) => row.getAttribute('data-toast') ?? '',
	);
const title = (container: Element, key: string): string =>
	container.querySelector(`[data-toast="${key}"] span.title`)?.textContent ?? '';
const detail = (container: Element, key: string): string =>
	container.querySelector(`[data-toast="${key}"] span.detail`)?.textContent ?? '';
const detailTag = (container: Element, key: string): string =>
	(
		container.querySelector(`[data-toast="${key}"] span.detail`)?.firstElementChild?.tagName ?? ''
	).toLowerCase();
const click = (container: Element, selector: string): void => {
	(container.querySelector(selector) as HTMLElement).click();
};
const rowSpan = (container: Element): string[] =>
	Array.from(container.querySelector('.toasts')!.children).map((child) =>
		child.getAttribute('data-toast') ?? child.tagName.toLowerCase(),
	);

test('a minted row paints the parts the page projected into it', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	expect(keys(container)).toEqual(['north', 'south']);
	expect(title(container, 'north')).toBe('North');

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	// The projected part rendered inside the minted row, with the row's own value.
	expect(title(container, 'east')).toBe('East');
	expect(container.querySelector('[data-toast="east"] button.close')).not.toBeNull();
	expect(rowSpan(container)).toEqual(['h2', 'north', 'south', 'east']);
	await cleanup();
});

test("a projected part's own handler dispatches from a minted row", async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);

	click(container, '[data-toast="east"] button.close');
	await expect.poll(() => keys(container)).toEqual(['north', 'south']);
	// The served rows' own close buttons still speak for their own keys.
	click(container, '[data-toast="north"] button.close');
	await expect.poll(() => keys(container)).toEqual(['south']);
	await cleanup();
});

test("a minted row's own arm flips and refreshes beside its projected parts", async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	expect(detailTag(container, 'east')).toBe('i');

	click(container, '[data-toggle="east"]');
	await expect.poll(() => detailTag(container, 'east')).toBe('b');
	expect(detailTag(container, 'north')).toBe('i');

	click(container, '[data-note]');
	await expect.poll(() => detail(container, 'east')).toBe('second');
	expect(detail(container, 'north')).toBe('second');
	await cleanup();
});

test('two minted projecting rows stay independent', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	click(container, '[data-add-west]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east', 'west']);

	expect(title(container, 'east')).toBe('East');
	expect(title(container, 'west')).toBe('West');

	click(container, '[data-toggle="east"]');
	await expect.poll(() => detailTag(container, 'east')).toBe('b');
	expect(detailTag(container, 'west')).toBe('i');

	click(container, '[data-toast="west"] button.close');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	expect(detailTag(container, 'east')).toBe('b');
	await cleanup();
});

test('a removed key re-added carries its projected parts once', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-drop]');
	await expect.poll(() => keys(container)).toEqual(['north']);

	click(container, '[data-restore]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south']);
	expect(container.querySelectorAll('[data-toast="south"]').length).toBe(1);
	expect(container.querySelectorAll('[data-toast="south"] span.title').length).toBe(1);
	expect(title(container, 'south')).toBe('South');

	click(container, '[data-toggle="south"]');
	await expect.poll(() => detailTag(container, 'south')).toBe('b');
	expect(container.querySelectorAll('[data-toast="south"] span.detail > *').length).toBe(1);
	await cleanup();
});

test('N served rows plus one client mint match N+1 served rows, projection included', async () => {
	const grown = await renderSSR(App);
	click(grown.container, '[data-add]');
	await expect.poll(() => keys(grown.container)).toEqual(['north', 'south', 'east']);
	const grownRows = normalize(grown.container);
	await cleanup();

	const served = await renderSSR(Served);
	expect(keys(served.container)).toEqual(['north', 'south', 'east']);
	const servedRows = normalize(served.container);
	await cleanup();

	expect(grownRows).toEqual(servedRows);
});

// Served markup carries resume bookkeeping attributes the client mint has no
// reason to reproduce, so the comparison is over the authored shape - the branch
// anchor comments stay in, because a minted row has to place those too.
function normalize(container: Element): string {
	const rows = container.querySelector('.toasts')!.cloneNode(true) as Element;
	for (const element of [rows, ...Array.from(rows.querySelectorAll('*'))])
		for (const name of element.getAttributeNames())
			if (name.startsWith('data-markless') || name.startsWith('markless'))
				element.removeAttribute(name);
	return rows.innerHTML;
}
