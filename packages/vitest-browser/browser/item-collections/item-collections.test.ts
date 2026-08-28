import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ComposedPage from './ic-composed-page.tsrx';
import KeyedPage from './ic-keyed-page.tsrx';
import MutatingPage from './ic-mutating-page.tsrx';
import StaticPage from './ic-static-page.tsrx';
import TwoInstancesPage from './ic-two-instances-page.tsrx';

// The general rule every widget family with a repeated part owes, in one place:
// an item's position is its place in the family's own collection, in document
// order, and NOBODY authors it. The family works it out.
//
// The item derives it: `computed(() => w.itemEls.indexOf(mine))` in
// ic-widget.tsrx, which is the one derive-time element() handle read the
// compiler admits. `ui-pos` is written by that derivation and by nothing else -
// `survey()` walks the same roster from a handler and only REPORTS what it
// finds, so a row asserting positions is asserting the derivation.
//
// The "at first paint" rows are the rule where a family actually needs the
// answer - `otp.item` paints its character, `tour.item` decides whether it is
// the step showing. They are answered from render order: the widget instance
// emits its members in document order, so the nth member to ask is the nth.
// After resume the same question is answered from the live roster, and a row
// arriving or leaving renumbers the ones behind it.

afterEach(async () => {
	await cleanup();
});

const items = (within?: string) =>
	[...document.querySelectorAll(`${within ?? ''} [data-ic-item]`.trim())];
const positions = (within?: string) => items(within).map((one) => one.getAttribute('ui-pos'));
const roots = () => [...document.querySelectorAll('[data-ic-root]')];
const seen = (at = 0) => roots()[at]?.getAttribute('ui-seen');

const surveyed = async (at = 0) => {
	roots()[at]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await expect.poll(() => seen(at), { timeout: 5000 }).not.toBe('unread');
};

// --- static items -----------------------------------------------------------

test('CSR: static items carry their document position at first paint', async () => {
	await render(StaticPage);

	expect(positions()).toEqual(['0', '1', '2']);
});

test('SSR: static items carry their document position at first paint', async () => {
	await renderSSR(StaticPage);

	expect(positions()).toEqual(['0', '1', '2']);
});

test('CSR: the roster reads static items in document order', async () => {
	await render(StaticPage);
	await surveyed();

	expect(seen()).toBe('0,1,2');
	expect(positions()).toEqual(['0', '1', '2']);
});

test('SSR: the roster reads static items in document order', async () => {
	await renderSSR(StaticPage);
	await surveyed();

	expect(seen()).toBe('0,1,2');
	expect(positions()).toEqual(['0', '1', '2']);
});

// --- keyed rows -------------------------------------------------------------

test('CSR: keyed rows carry their document position at first paint', async () => {
	await render(KeyedPage);

	expect(positions()).toEqual(['0', '1', '2']);
});

test('SSR: keyed rows carry their document position at first paint', async () => {
	await renderSSR(KeyedPage);

	expect(positions()).toEqual(['0', '1', '2']);
});

test('CSR: a key is identity, not position - the roster still reads 0,1,2', async () => {
	await render(KeyedPage);
	await surveyed();

	expect(seen()).toBe('0,1,2');
	expect(items().map((one) => one.textContent)).toEqual(['alpha', 'bravo', 'charlie']);
});

test('SSR: a key is identity, not position - the roster still reads 0,1,2', async () => {
	await renderSSR(KeyedPage);
	await surveyed();

	expect(seen()).toBe('0,1,2');
	expect(items().map((one) => one.textContent)).toEqual(['alpha', 'bravo', 'charlie']);
});

// --- projection through a composed root -------------------------------------

test('CSR: projected items carry their document position at first paint', async () => {
	await render(ComposedPage);

	expect(positions()).toEqual(['0', '1', '2']);
});

test('SSR: projected items carry their document position at first paint', async () => {
	await renderSSR(ComposedPage);

	expect(positions()).toEqual(['0', '1', '2']);
});

test('CSR: a component edge does not change an item position', async () => {
	await render(ComposedPage);
	await surveyed();

	expect(seen()).toBe('0,1,2');
	expect(positions('[data-ic-panel]')).toEqual(['0', '1', '2']);
});

test('SSR: a component edge does not change an item position', async () => {
	await renderSSR(ComposedPage);
	await surveyed();

	expect(seen()).toBe('0,1,2');
	expect(positions('[data-ic-panel]')).toEqual(['0', '1', '2']);
});

// --- added and removed after resume -----------------------------------------

// Red for the ordinal, not the mint: the row is built and attached now, and its
// four items are in the DOM - nothing stamps `ui-pos` until a handler walks the
// roster, which is the same reason the drop row below is red.
test('SSR: an item added after resume takes the next position by itself', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	expect(positions()).toEqual(['0', '1', '2', '3']);
});

test('SSR: dropping the first item renumbers the ones behind it', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	expect(positions()).toEqual(['0', '1']);
});

// The row a consumer's `@for` mints after resume reads the family instance its
// rows physically stand in, not the one its collection names.
test('SSR: the roster renumbers after an item is added', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);
	await surveyed();

	expect(seen()).toBe('0,1,2,3');
	expect(items().map((one) => one.textContent)).toEqual([
		'alpha',
		'bravo',
		'charlie',
		'delta-3',
	]);
});

test('SSR: the roster renumbers after the first item is dropped', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);
	await surveyed();

	expect(seen()).toBe('0,1');
	expect(items().map((one) => one.textContent)).toEqual(['bravo', 'charlie']);
	expect(positions()).toEqual(['0', '1']);
});

// --- two instances on one page ----------------------------------------------

test('CSR: each instance counts from zero at first paint', async () => {
	await render(TwoInstancesPage);

	expect(positions('[data-ic-first]')).toEqual(['0', '1']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1', '2']);
});

test('SSR: each instance counts from zero at first paint', async () => {
	await renderSSR(TwoInstancesPage);

	expect(positions('[data-ic-first]')).toEqual(['0', '1']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1', '2']);
});

test('CSR: a position is never global - the second roster starts at zero', async () => {
	await render(TwoInstancesPage);
	await surveyed(0);
	await surveyed(1);

	expect(seen(0)).toBe('0,1');
	expect(seen(1)).toBe('0,1,2');
	expect(positions('[data-ic-first]')).toEqual(['0', '1']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1', '2']);
});

test('SSR: a position is never global - the second roster starts at zero', async () => {
	await renderSSR(TwoInstancesPage);
	await surveyed(0);
	await surveyed(1);

	expect(seen(0)).toBe('0,1');
	expect(seen(1)).toBe('0,1,2');
	expect(positions('[data-ic-first]')).toEqual(['0', '1']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1', '2']);
});
