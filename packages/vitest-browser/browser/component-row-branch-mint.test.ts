import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/component-row-branch-mint.tsrx';
import Served from './fixtures/component-row-branch-mint-served.tsrx';

const keys = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-toast]')).map(
		(row) => row.getAttribute('data-toast') ?? '',
	);
// Both arms of the `children` guard, in row order: the self-closed part takes the
// fallback arm and the one with children takes the projected arm.
const bodies = (container: Element, key: string): string[] =>
	Array.from(container.querySelectorAll(`[data-toast="${key}"] span.body`)).map(
		(body) => body.textContent ?? '',
	);
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

test('a minted row carries the guard arms its served siblings carry', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	expect(keys(container)).toEqual(['north', 'south']);
	expect(bodies(container, 'north')).toEqual(['North', 'North']);

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	// The minted row painted both arms: the self-closed part served its fallback,
	// the one with children served the children.
	expect(bodies(container, 'east')).toEqual(['East', 'East']);
	// Mixed page: the minted row lands behind the static sibling, not in front.
	expect(rowSpan(container)).toEqual(['h2', 'north', 'south', 'east']);
	await cleanup();
});

test("a minted row's branch flips on a write from inside that row", async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	expect(detailTag(container, 'east')).toBe('i');

	click(container, '[data-toggle="east"]');
	await expect.poll(() => detailTag(container, 'east')).toBe('b');
	// Independence: the flip inside the minted row left the served rows alone.
	expect(detailTag(container, 'north')).toBe('i');

	click(container, '[data-toggle="north"]');
	await expect.poll(() => detailTag(container, 'north')).toBe('b');
	expect(detailTag(container, 'east')).toBe('b');
	await cleanup();
});

// Two minted rows own two separate sets of flip subscriptions. Naming them
// together would let the second mint release the first row's, and that row's
// arm would then sit frozen while its own state kept toggling.
test('a second minted row does not take the first minted row apart', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	click(container, '[data-add-west]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east', 'west']);

	click(container, '[data-toggle="east"]');
	await expect.poll(() => detailTag(container, 'east')).toBe('b');
	click(container, '[data-toggle="west"]');
	await expect.poll(() => detailTag(container, 'west')).toBe('b');

	// Back again, both of them: a released subscription would leave the arm stuck.
	click(container, '[data-toggle="east"]');
	await expect.poll(() => detailTag(container, 'east')).toBe('i');
	expect(detailTag(container, 'west')).toBe('b');
	await cleanup();
});

test("a minted row's arm content refreshes on a shared write", async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	expect(detail(container, 'east')).toBe('first');

	click(container, '[data-note]');
	// The write is the page's; the read lives inside the minted row's served arm.
	await expect.poll(() => detail(container, 'east')).toBe('second');
	expect(detail(container, 'north')).toBe('second');
	await cleanup();
});

test('the arm a minted row flipped INTO refreshes on a shared write too', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	click(container, '[data-toggle="east"]');
	await expect.poll(() => detailTag(container, 'east')).toBe('b');

	click(container, '[data-note]');
	await expect.poll(() => detail(container, 'east')).toBe('second');
	await cleanup();
});

test('a minted row with arms still dispatches its own handler', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);

	click(container, '[data-toast="east"] span.body');
	await expect.poll(() => container.querySelector('[data-chosen]')?.textContent).toBe('east');
	click(container, '[data-toast="north"] span.body');
	await expect.poll(() => container.querySelector('[data-chosen]')?.textContent).toBe('north');
	await cleanup();
});

test('a removed key leaves no parked DOM and re-adding it wires no stale arm', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-drop]');
	await expect.poll(() => keys(container)).toEqual(['north']);
	expect(rowSpan(container)).toEqual(['h2', 'north']);

	click(container, '[data-restore]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south']);
	expect(container.querySelectorAll('[data-toast="south"]').length).toBe(1);

	// One flip, not two: a stale subscription on the returned row would run the
	// arm replacement twice and leave the range doubled.
	click(container, '[data-toggle="south"]');
	await expect.poll(() => detailTag(container, 'south')).toBe('b');
	expect(container.querySelectorAll('[data-toast="south"] span.detail > *').length).toBe(1);
	await cleanup();
});

test('N served rows plus one client mint match N+1 served rows, arm markers included', async () => {
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
// reason to reproduce, so the comparison is over the authored shape - but the
// branch anchor comments stay in, because those ARE what this unit resolves.
function normalize(container: Element): string {
	const rows = container.querySelector('.toasts')!.cloneNode(true) as Element;
	for (const element of [rows, ...Array.from(rows.querySelectorAll('*'))])
		for (const name of element.getAttributeNames())
			if (name.startsWith('data-markless') || name.startsWith('markless'))
				element.removeAttribute(name);
	return rows.innerHTML;
}
