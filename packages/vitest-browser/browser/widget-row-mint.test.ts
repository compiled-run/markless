import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App, { Served } from './fixtures/widget-row-mint.tsrx';

// The row component here IS a widget root: each rendered row gets its own
// widget-scoped shared() graph, and a row minted on the client has to bring one.

const keys = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-row]')).map(
		(row) => row.getAttribute('data-row') ?? '',
	);
const marks = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-row]')).map(
		(row) => row.getAttribute('data-mark') ?? '',
	);
const labels = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-row]')).map((row) =>
		(row.textContent ?? '').trim(),
	);
const click = (container: Element, selector: string): void => {
	(container.querySelector(selector) as HTMLElement).click();
};

test('a minted row brings its own widget graph, seeded from its own prop', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	expect(keys(container)).toEqual(['north', 'south']);

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	// The seed the row's own body wrote reached the row's own widget graph, and
	// the widget's computed rendered off it.
	expect(labels(container)).toEqual(['North', 'South', 'East']);
	expect(marks(container)).toEqual(['off', 'off', 'off']);
	await cleanup();
});

test('N served rows plus one client mint match N+1 served rows', async () => {
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

test('a minted row is removed and re-added without leaving a second row behind', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);

	click(container, '[data-drop]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south']);

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	expect(container.querySelectorAll('[data-row="east"]').length).toBe(1);
	expect(labels(container)).toEqual(['North', 'South', 'East']);
	await cleanup();
});

// Each rendered row toggles its own widget graph and nothing else: a served row,
// and a row the client minted after boot, both write only their own instance,
// and both reach the owner through the row's callback prop.

test('a served row of this shape runs its own click handler', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-row="north"]');
	await expect.poll(() => container.querySelector('[data-tapped]')?.textContent).toBe('north');
	expect(marks(container)).toEqual(['on', 'off']);
	await cleanup();
});

test('the minted row toggles its own widget state and the served rows do not move', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);

	click(container, '[data-row="east"]');
	await expect.poll(() => marks(container)).toEqual(['off', 'off', 'on']);
	// The row's callback prop writes page state the row does not own, so this is
	// the other half of the proof: the gesture reached the owner too.
	expect(container.querySelector('[data-tapped]')?.textContent).toBe('east');

	click(container, '[data-row="north"]');
	await expect.poll(() => marks(container)).toEqual(['on', 'off', 'on']);
	await expect.poll(() => container.querySelector('[data-tapped]')?.textContent).toBe('north');
	await cleanup();
});

// The row below pins a wall this shape still stands behind, and it is not the
// row's shape at all: a component exported under a name that is not the module's
// root is published as a bare render part, with no resume module beside it. A
// page rendered from such an export is served complete and inert - no client
// runtime is ever fetched, so no gesture on it can dispatch. Unmark it the day a
// non-root export carries its module's resume wiring.

test.fails('a page rendered from a non-root export dispatches at all', async () => {
	const screen = await renderSSR(Served);
	const container = screen.container;

	click(container, '[data-row="north"]');
	await expect.poll(() => container.querySelector('[data-tapped]')?.textContent).toBe('north');
	await cleanup();
});

// Served markup carries resume bookkeeping attributes the client mint has no
// reason to reproduce, so the comparison is over the authored shape.
function normalize(container: Element): string {
	const rows = container.querySelector('.rows')!.cloneNode(true) as Element;
	for (const element of [rows, ...Array.from(rows.querySelectorAll('*'))])
		for (const name of element.getAttributeNames())
			if (name.startsWith('data-markless') || name.startsWith('markless'))
				element.removeAttribute(name);
	return rows.outerHTML;
}
