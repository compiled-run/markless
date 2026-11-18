import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Deep from './deep.tsrx';
import RelayPage from './relay-page.tsrx';

afterEach(cleanup);

// The served cells whose id is a component's own prop bag.
const servedPropBags = () =>
	[...document.querySelectorAll('script[type="markless/state"]')].flatMap((script) =>
		(JSON.parse(script.textContent ?? '{}').cells ?? []).flatMap((cell: { graphNodeId: string }) =>
			cell.graphNodeId.endsWith('prop:props') ? [cell.graphNodeId] : [],
		),
	);

// Every component between the page and the child only hands the route on, and every read of it follows the route,
// so none of them is served a copy of what it hands on.
test('components that only forward routed props are served no copy of them', async () => {
	await renderSSR(Deep);
	await expect.poll(() => document.querySelector('[data-note]')?.textContent ?? '').toContain('abc');
	expect(servedPropBags()).toEqual([]);
});

const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// The relay's arm test and its handler read the prop through the page's route, so each sees every write the page makes.
for (const [name, mount] of [
	['client-rendered', () => render(RelayPage)],
	['server-rendered', () => renderSSR(RelayPage)],
] as const) {
	test(`a component that hands a prop on flips its own arm and reads it in a handler as the parent writes it, ${name}`, async () => {
		await mount();
		await expect.poll(() => text('[data-empty]')).toBe('empty');
		expect(document.querySelector('[data-arm]')).toBeNull();
		expect(text('[data-badge]')).toBe('none 0');
		// Served, the relay holds no copy of the prop: every read below goes through the page's route.
		if (name === 'server-rendered') expect(servedPropBags()).toEqual([]);

		click('[data-set]');
		await expect.poll(() => text('[data-arm]')).toBe('shown ready');
		expect(document.querySelector('[data-empty]')).toBeNull();
		await expect.poll(() => text('[data-badge]')).toBe('ready 0');
		click('[data-read]');
		await expect.poll(() => text('[data-seen]')).toBe('ready');

		click('[data-clear]');
		await expect.poll(() => text('[data-empty]')).toBe('empty');
		expect(document.querySelector('[data-arm]')).toBeNull();
		await expect.poll(() => text('[data-badge]')).toBe('none 0');
		click('[data-read]');
		await expect.poll(() => text('[data-seen]')).toBe('blank');

		click('[data-set]');
		await expect.poll(() => text('[data-arm]')).toBe('shown ready');
	});
}
