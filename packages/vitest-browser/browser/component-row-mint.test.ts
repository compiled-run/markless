import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/component-row-mint.tsrx';
import Served from './fixtures/component-row-mint-served.tsrx';

const keys = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-card]')).map(
		(row) => row.getAttribute('data-card') ?? '',
	);
const tags = (container: Element): string[] =>
	Array.from(container.querySelectorAll('[data-card] em.tag')).map(
		(tag) => tag.textContent ?? '',
	);
const click = (container: Element, selector: string): void => {
	(container.querySelector(selector) as HTMLElement).click();
};
// Rows keep their own row span after the static sibling the compiler counted.
const rowSpan = (container: Element): string[] =>
	Array.from(container.querySelector('.cards')!.children).map((child) =>
		child.getAttribute('data-card') ?? child.tagName.toLowerCase(),
	);

test('an unserved key mints a component row that renders its own markup', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	expect(keys(container)).toEqual(['north', 'south']);

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	expect(tags(container)).toEqual(['North', 'South', 'East']);
	// Mixed page: the minted row lands behind the static sibling, not in front.
	expect(rowSpan(container)).toEqual(['h2', 'north', 'south', 'east']);
	await cleanup();
});

test('a minted row dispatches its own handler and the served rows keep theirs', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);

	click(container, '[data-card="east"]');
	await expect.poll(() => container.querySelector('[data-chosen]')?.textContent).toBe('east');
	// Independence: a served row still answers with its own key, not the minted one.
	click(container, '[data-card="north"]');
	await expect.poll(() => container.querySelector('[data-chosen]')?.textContent).toBe('north');
	await cleanup();
});

test('the pinned census stays true after a mint, so a later row still resolves', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-add]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south', 'east']);
	// A census that drifted would resolve this click against the wrong element.
	click(container, '[data-card="south"]');
	await expect.poll(() => container.querySelector('[data-chosen]')?.textContent).toBe('south');
	await cleanup();
});

test('a removed key leaves no parked DOM and re-adding it wires no stale subscription', async () => {
	const screen = await renderSSR(App);
	const container = screen.container;

	click(container, '[data-drop]');
	await expect.poll(() => keys(container)).toEqual(['north']);
	expect(rowSpan(container)).toEqual(['h2', 'north']);

	click(container, '[data-restore]');
	await expect.poll(() => keys(container)).toEqual(['north', 'south']);
	// Exactly one row per key: a parked row re-attached beside a fresh mint
	// would show two, and a stale subscription would dispatch twice.
	expect(container.querySelectorAll('[data-card="south"]').length).toBe(1);

	click(container, '[data-card="south"]');
	await expect.poll(() => container.querySelector('[data-chosen]')?.textContent).toBe('south');
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

// Served markup carries resume bookkeeping attributes the client mint has no
// reason to reproduce, so the comparison is over the authored shape.
function normalize(container: Element): string {
	const cards = container.querySelector('.cards')!.cloneNode(true) as Element;
	for (const element of [cards, ...Array.from(cards.querySelectorAll('*'))])
		for (const name of element.getAttributeNames())
			if (name.startsWith('data-markless') || name.startsWith('markless')) element.removeAttribute(name);
	return cards.outerHTML;
}
