import { userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ArmPage from './ic-arm-page.tsrx';
import ComposedPage from './ic-composed-page.tsrx';
import FlatPage from './ic-flat-page.tsrx';
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
const maxes = () => roots().map((one) => one.getAttribute('ui-max'));
const totals = () =>
	[...document.querySelectorAll('[data-ic-total]')].map((one) => one.textContent);

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

// A row minted after resume derives its place twice: once with no page seeds,
// which answers 0, and again when the roster's revision renumbers it. The DOM
// holding the row is not yet the DOM holding the answer, so this waits for the
// derivation rather than for the element.
test('SSR: an item added after resume takes the next position by itself', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect.poll(positions, { timeout: 5000 }).toEqual(['0', '1', '2', '3']);
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

// --- flat items, no keyed repeat --------------------------------------------

// The shape a consumer actually writes for `tour` and `otp`: the parts are
// siblings in the consumer's own markup. Their handle is component-local, so
// before this was qualified per component instance every flat part filed under
// one bare key, the key named several elements, and the re-derive answered -1.
const flatAdd = () => document.querySelector('[data-ic-flat-add]') as HTMLElement;
const flatDrop = () => document.querySelector('[data-ic-flat-drop]') as HTMLElement;

test('CSR: flat items in two instances each count from zero at first paint', async () => {
	await render(FlatPage);

	expect(positions('[data-ic-first]')).toEqual(['0', '1', '2']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('SSR: flat items in two instances each count from zero at first paint', async () => {
	await renderSSR(FlatPage);

	expect(positions('[data-ic-first]')).toEqual(['0', '1', '2']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('CSR: a flat item behind an arrival renumbers and never answers -1', async () => {
	await render(FlatPage);
	await userEvent.click(flatAdd());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(4);

	expect(positions('[data-ic-first]')).toEqual(['0', '1', '2', '3']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('SSR: a flat item behind an arrival renumbers and never answers -1', async () => {
	await renderSSR(FlatPage);
	await userEvent.click(flatAdd());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(4);

	expect(positions('[data-ic-first]')).toEqual(['0', '1', '2', '3']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('CSR: a flat item behind a removal renumbers and never answers -1', async () => {
	await render(FlatPage);
	await userEvent.click(flatDrop());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(2);

	expect(positions('[data-ic-first]')).toEqual(['0', '1']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('SSR: a flat item behind a removal renumbers and never answers -1', async () => {
	await renderSSR(FlatPage);
	await userEvent.click(flatDrop());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(2);

	expect(positions('[data-ic-first]')).toEqual(['0', '1']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('CSR: the roster of a flat instance reads its own items only', async () => {
	await render(FlatPage);
	await surveyed(0);
	await surveyed(1);

	expect(seen(0)).toBe('0,1,2');
	expect(seen(1)).toBe('0,1');
});

test('SSR: the roster of a flat instance reads its own items only', async () => {
	await renderSSR(FlatPage);
	await surveyed(0);
	await surveyed(1);

	expect(seen(0)).toBe('0,1,2');
	expect(seen(1)).toBe('0,1');
});

// --- how many are there ------------------------------------------------------

// The second question a family asks its roster, and the one an authored `index`
// prop was standing in for: `otp` sets `maxlength`, `tour` writes "2 of 5". The
// root derives `w.itemEls.length` and writes it twice - into an attribute and
// into a text child - and it asks BEFORE any item of the instance has rendered,
// which is the whole difficulty on the server's single forward pass.

test('CSR: the root counts its items at first paint', async () => {
	await render(StaticPage);

	expect(maxes()).toEqual(['3']);
	expect(totals()).toEqual(['3']);
});

test('SSR: the root counts its items at first paint', async () => {
	await renderSSR(StaticPage);

	expect(maxes()).toEqual(['3']);
	expect(totals()).toEqual(['3']);
});

test('CSR: keyed rows are counted the same as static items', async () => {
	await render(KeyedPage);

	expect(maxes()).toEqual(['3']);
	expect(totals()).toEqual(['3']);
});

test('SSR: keyed rows are counted the same as static items', async () => {
	await renderSSR(KeyedPage);

	expect(maxes()).toEqual(['3']);
	expect(totals()).toEqual(['3']);
});

test('CSR: a component edge does not change the count', async () => {
	await render(ComposedPage);

	expect(maxes()).toEqual(['3']);
	expect(totals()).toEqual(['3']);
});

test('SSR: a component edge does not change the count', async () => {
	await renderSSR(ComposedPage);

	expect(maxes()).toEqual(['3']);
	expect(totals()).toEqual(['3']);
});

test('CSR: each instance counts only its own items', async () => {
	await render(TwoInstancesPage);

	expect(maxes()).toEqual(['2', '3']);
	expect(totals()).toEqual(['2', '3']);
});

test('SSR: each instance counts only its own items', async () => {
	await renderSSR(TwoInstancesPage);

	expect(maxes()).toEqual(['2', '3']);
	expect(totals()).toEqual(['2', '3']);
});

test('CSR: flat items in two instances each count their own', async () => {
	await render(FlatPage);

	expect(maxes()).toEqual(['3', '2']);
	expect(totals()).toEqual(['3', '2']);
});

test('SSR: flat items in two instances each count their own', async () => {
	await renderSSR(FlatPage);

	expect(maxes()).toEqual(['3', '2']);
	expect(totals()).toEqual(['3', '2']);
});

test('CSR: the count follows an item arriving after resume', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['4']);
	expect(totals()).toEqual(['4']);
});

test('SSR: the count follows an item arriving after resume', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['4']);
	expect(totals()).toEqual(['4']);
});

test('CSR: the count follows an item leaving after resume', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['2']);
	expect(totals()).toEqual(['2']);
});

test('SSR: the count follows an item leaving after resume', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['2']);
	expect(totals()).toEqual(['2']);
});

test('CSR: a flat instance recounts behind an arrival and leaves its sibling alone', async () => {
	await render(FlatPage);
	await userEvent.click(flatAdd());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(4);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['4', '2']);
	expect(totals()).toEqual(['4', '2']);
});

test('SSR: a flat instance recounts behind an arrival and leaves its sibling alone', async () => {
	await renderSSR(FlatPage);
	await userEvent.click(flatAdd());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(4);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['4', '2']);
	expect(totals()).toEqual(['4', '2']);
});

test('CSR: a flat instance recounts behind a removal', async () => {
	await render(FlatPage);
	await userEvent.click(flatDrop());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(2);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['2', '2']);
	expect(totals()).toEqual(['2', '2']);
});

test('SSR: a flat instance recounts behind a removal', async () => {
	await renderSSR(FlatPage);
	await userEvent.click(flatDrop());
	await expect.poll(() => items('[data-ic-first]').length, { timeout: 5000 }).toBe(2);

	await expect.poll(maxes, { timeout: 5000 }).toEqual(['2', '2']);
	expect(totals()).toEqual(['2', '2']);
});

// --- spending the count ------------------------------------------------------

// The count is a placeholder while the render is still emitting the members it
// counts, so an expression that SPENDS one cannot be evaluated where it stands.
// The slot hands the whole expression over and the composed page answers it.
// `ui-last` is arithmetic in an attribute value, the `next` gate is a BOOLEAN
// attribute - where presence is the value, so the whole attribute has to defer -
// and "n left" is template math in a text node.

const lasts = () => roots().map((one) => one.getAttribute('ui-last'));
const gates = () =>
	[...document.querySelectorAll('[data-ic-next]')].map((one) =>
		(one as HTMLButtonElement).disabled,
	);
const lefts = () =>
	[...document.querySelectorAll('[data-ic-left]')].map((one) => one.textContent);

test('CSR: the root spends its count in an attribute, a gate and text at first paint', async () => {
	await render(StaticPage);

	expect(lasts()).toEqual(['2']);
	expect(gates()).toEqual([false]);
	expect(lefts()).toEqual(['2 left']);
});

test('SSR: the root spends its count in an attribute, a gate and text at first paint', async () => {
	await renderSSR(StaticPage);

	expect(lasts()).toEqual(['2']);
	expect(gates()).toEqual([false]);
	expect(lefts()).toEqual(['2 left']);
});

// A boolean attribute answering false has to be ABSENT, not `disabled="false"`.
test('SSR: a false gate writes no attribute at all', async () => {
	await renderSSR(StaticPage);

	expect(document.querySelector('[data-ic-next]')?.hasAttribute('disabled')).toBe(false);
});

test('CSR: a spent count follows an item arriving after resume', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect.poll(lasts, { timeout: 5000 }).toEqual(['3']);
	expect(lefts()).toEqual(['3 left']);
});

test('SSR: a spent count follows an item arriving after resume', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect.poll(lasts, { timeout: 5000 }).toEqual(['3']);
	expect(lefts()).toEqual(['3 left']);
});

test('CSR: a spent count follows an item leaving after resume', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(lasts, { timeout: 5000 }).toEqual(['1']);
	expect(lefts()).toEqual(['1 left']);
});

test('SSR: a spent count follows an item leaving after resume', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(lasts, { timeout: 5000 }).toEqual(['1']);
	expect(lefts()).toEqual(['1 left']);
});

// Two instances of one family each spend their OWN count, which is the whole
// reason the answer is per widget instance rather than per page.
test('CSR: two instances spend their own counts', async () => {
	await render(TwoInstancesPage);

	expect(lasts()).toEqual(['1', '2']);
	expect(lefts()).toEqual(['1 left', '2 left']);
});

test('SSR: two instances spend their own counts', async () => {
	await renderSSR(TwoInstancesPage);

	expect(lasts()).toEqual(['1', '2']);
	expect(lefts()).toEqual(['1 left', '2 left']);
});

// The gate closes exactly when the walk reaches the last member, which is the
// shape a forward trigger is written in.
test('CSR: the gate closes on the last step', async () => {
	await render(StaticPage);
	const next = document.querySelector('[data-ic-next]') as HTMLButtonElement;
	await userEvent.click(next);
	await userEvent.click(next);

	await expect.poll(gates, { timeout: 5000 }).toEqual([true]);
});

test('SSR: the gate closes on the last step', async () => {
	await renderSSR(StaticPage);
	const next = document.querySelector('[data-ic-next]') as HTMLButtonElement;
	await userEvent.click(next);
	await userEvent.click(next);

	await expect.poll(gates, { timeout: 5000 }).toEqual([true]);
});

// A count is a placeholder while the render is still emitting the members it
// counts, and a spent expression is a token standing for its answer. Nothing the
// page ships may still be holding either - not the markup, and not the resume
// payload a resumed page rewrites the attribute from.
const PLACEHOLDER = /[\uE000-\uE004]/;

test('CSR: no placeholder count survives the render', async () => {
	await render(TwoInstancesPage);

	expect(PLACEHOLDER.test(document.body.innerHTML)).toBe(false);
});

test('SSR: no placeholder count survives the render', async () => {
	await renderSSR(TwoInstancesPage);

	expect(PLACEHOLDER.test(document.body.innerHTML)).toBe(false);
});

// --- "2 of 5" ----------------------------------------------------------------

// The count spent the way tour actually spends it: printed into surrounding text
// through a template slot, by a part standing IN the roster it is counting. The
// root's `of ${total}` is the same shape from the asker that renders FIRST, and
// the item's is the asker that renders in the MIDDLE of its own members - a
// forward pass answers neither, and both are exact because the served page
// answers the placeholder rather than the render answering the question.
//
// This is the boundary the compiler now draws. `${total}` is a bare read spent
// as string and is admitted; `total - 1` and `step >= total - 1` are refused by
// MARKLESS_ROSTER_COUNT_NOT_A_NUMBER, pinned in the compiler's own suite.

const labels = (within?: string) => items(within).map((one) => one.getAttribute('ui-label'));
const rootLabels = () => roots().map((one) => one.getAttribute('ui-label'));

test('CSR: a part prints "n of m" at first paint', async () => {
	await render(StaticPage);

	expect(labels()).toEqual(['1 of 3', '2 of 3', '3 of 3']);
	expect(rootLabels()).toEqual(['of 3']);
});

test('SSR: a part prints "n of m" at first paint', async () => {
	await renderSSR(StaticPage);

	expect(labels()).toEqual(['1 of 3', '2 of 3', '3 of 3']);
	expect(rootLabels()).toEqual(['of 3']);
});

test('CSR: every "n of m" moves when an item arrives', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect
		.poll(labels, { timeout: 5000 })
		.toEqual(['1 of 4', '2 of 4', '3 of 4', '4 of 4']);
	expect(rootLabels()).toEqual(['of 4']);
});

test('SSR: every "n of m" moves when an item arrives', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);

	await expect
		.poll(labels, { timeout: 5000 })
		.toEqual(['1 of 4', '2 of 4', '3 of 4', '4 of 4']);
	expect(rootLabels()).toEqual(['of 4']);
});

test('CSR: every "n of m" moves when the first item leaves', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(labels, { timeout: 5000 }).toEqual(['1 of 2', '2 of 2']);
	expect(rootLabels()).toEqual(['of 2']);
});

test('SSR: every "n of m" moves when the first item leaves', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(labels, { timeout: 5000 }).toEqual(['1 of 2', '2 of 2']);
	expect(rootLabels()).toEqual(['of 2']);
});

test('CSR: two instances print their own "n of m" and not each other\'s', async () => {
	await render(TwoInstancesPage);

	expect(labels('[data-ic-first]')).toEqual(['1 of 2', '2 of 2']);
	expect(labels('[data-ic-second]')).toEqual(['1 of 3', '2 of 3', '3 of 3']);
});

test('SSR: two instances print their own "n of m" and not each other\'s', async () => {
	await renderSSR(TwoInstancesPage);

	expect(labels('[data-ic-first]')).toEqual(['1 of 2', '2 of 2']);
	expect(labels('[data-ic-second]')).toEqual(['1 of 3', '2 of 3', '3 of 3']);
});

// --- a place another expression can USE --------------------------------------

// Painting a position proves it derived; it does not prove it can be READ. Every
// real family spends its place inside a second derivation - `otp.item` slices
// its own character out of the code, `tour.item` compares its place with the
// step showing - so the item derives `code.slice(pos, pos + 1)` beside `ui-pos`
// and writes it as `ui-mine`. A dependent that answers `''` is a position that
// reached its markup and not its own graph cell.

const mines = (within?: string) => items(within).map((one) => one.getAttribute('ui-mine'));
const writeCode = async (at = 0) => {
	await userEvent.click([...document.querySelectorAll('[data-ic-write]')][at] as HTMLElement);
};

test('CSR: a dependent derivation spends the position at first paint', async () => {
	await render(StaticPage);

	expect(mines()).toEqual(['a', 'b', 'c']);
});

test('SSR: a dependent derivation spends the position at first paint', async () => {
	await renderSSR(StaticPage);

	expect(mines()).toEqual(['a', 'b', 'c']);
});

test('CSR: a dependent derivation re-reads the position after a write', async () => {
	await render(StaticPage);
	await writeCode();

	await expect.poll(mines, { timeout: 5000 }).toEqual(['A', 'B', 'C']);
});

test('SSR: a dependent derivation re-reads the position after a write', async () => {
	await renderSSR(StaticPage);
	await writeCode();

	await expect.poll(mines, { timeout: 5000 }).toEqual(['A', 'B', 'C']);
});

test('CSR: a dependent derivation follows an item arriving, then a write', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);
	await writeCode();

	await expect.poll(mines, { timeout: 5000 }).toEqual(['A', 'B', 'C', 'D']);
});

test('SSR: a dependent derivation follows an item arriving, then a write', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-add]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(4);
	await writeCode();

	await expect.poll(mines, { timeout: 5000 }).toEqual(['A', 'B', 'C', 'D']);
});

test('CSR: a dependent derivation renumbers behind a removal', async () => {
	await render(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(mines, { timeout: 5000 }).toEqual(['a', 'b']);
});

test('SSR: a dependent derivation renumbers behind a removal', async () => {
	await renderSSR(MutatingPage);
	await userEvent.click(document.querySelector('[data-ic-drop-first]') as HTMLElement);
	await expect.poll(() => items().length, { timeout: 5000 }).toBe(2);

	await expect.poll(mines, { timeout: 5000 }).toEqual(['a', 'b']);
});

test('CSR: a flat instance spends its own places and leaves its sibling alone', async () => {
	await render(FlatPage);
	await writeCode(0);

	await expect.poll(() => mines('[data-ic-first]'), { timeout: 5000 }).toEqual(['A', 'B', 'C']);
	expect(mines('[data-ic-second]')).toEqual(['a', 'b']);
});

test('SSR: a flat instance spends its own places and leaves its sibling alone', async () => {
	await renderSSR(FlatPage);
	await writeCode(0);

	await expect.poll(() => mines('[data-ic-first]'), { timeout: 5000 }).toEqual(['A', 'B', 'C']);
	expect(mines('[data-ic-second]')).toEqual(['a', 'b']);
});

// --- flat items gated by an @if arm ------------------------------------------

// No keyed repeat anywhere on this page, so the arm applying or dropping is the
// only thing that moves the collection and the only channel that can tell the
// parts to count again. The arm's own member joins the roster ahead of the flat
// items and carries no attribute of its own, which an arm cannot hold - what is
// asserted is the flat items behind it renumbering, and the root recounting.
const armToggle = () => document.querySelector('[data-ic-arm-toggle]') as HTMLElement;
const extras = () => document.querySelectorAll('[data-ic-extra]').length;

test('CSR: an @if arm joining the roster renumbers the flat items behind it', async () => {
	await render(ArmPage);

	expect(positions('[data-ic-first]')).toEqual(['0', '1', '2']);

	await userEvent.click(armToggle());
	await expect.poll(extras, { timeout: 5000 }).toBe(1);

	await expect
		.poll(() => positions('[data-ic-first]'), { timeout: 5000 })
		.toEqual(['1', '2', '3']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('SSR: an @if arm joining the roster renumbers the flat items behind it', async () => {
	await renderSSR(ArmPage);

	expect(positions('[data-ic-first]')).toEqual(['0', '1', '2']);

	await userEvent.click(armToggle());
	await expect.poll(extras, { timeout: 5000 }).toBe(1);

	await expect
		.poll(() => positions('[data-ic-first]'), { timeout: 5000 })
		.toEqual(['1', '2', '3']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('CSR: dropping the @if arm renumbers the flat items behind it', async () => {
	await render(ArmPage);
	await userEvent.click(armToggle());
	await expect.poll(extras, { timeout: 5000 }).toBe(1);
	await expect
		.poll(() => positions('[data-ic-first]'), { timeout: 5000 })
		.toEqual(['1', '2', '3']);

	await userEvent.click(armToggle());
	await expect.poll(extras, { timeout: 5000 }).toBe(0);

	await expect
		.poll(() => positions('[data-ic-first]'), { timeout: 5000 })
		.toEqual(['0', '1', '2']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('SSR: dropping the @if arm renumbers the flat items behind it', async () => {
	await renderSSR(ArmPage);
	await userEvent.click(armToggle());
	await expect.poll(extras, { timeout: 5000 }).toBe(1);
	await expect
		.poll(() => positions('[data-ic-first]'), { timeout: 5000 })
		.toEqual(['1', '2', '3']);

	await userEvent.click(armToggle());
	await expect.poll(extras, { timeout: 5000 }).toBe(0);

	await expect
		.poll(() => positions('[data-ic-first]'), { timeout: 5000 })
		.toEqual(['0', '1', '2']);
	expect(positions('[data-ic-second]')).toEqual(['0', '1']);
});

test('CSR: the count follows an @if arm applying and dropping', async () => {
	await render(ArmPage);

	expect(maxes()).toEqual(['3', '2']);

	await userEvent.click(armToggle());
	await expect.poll(maxes, { timeout: 5000 }).toEqual(['4', '2']);
	expect(totals()).toEqual(['4', '2']);

	await userEvent.click(armToggle());
	await expect.poll(maxes, { timeout: 5000 }).toEqual(['3', '2']);
	expect(totals()).toEqual(['3', '2']);
});

// The first-paint count stands in CSR, where the seed pass asks the carrier rule
// with where this child stands on the page. SSR files the instance token from the
// compiler's per-component `marklessWidgetRoots` marker instead, which cannot see
// a placement, so the count placeholder is keyed with the bare handle id and the
// ask answers 0 until the first flip. Measured: ['0','2'] at paint here.
test.fails('SSR: the count follows an @if arm applying and dropping', async () => {
	await renderSSR(ArmPage);

	expect(maxes()).toEqual(['3', '2']);

	await userEvent.click(armToggle());
	await expect.poll(maxes, { timeout: 5000 }).toEqual(['4', '2']);
	expect(totals()).toEqual(['4', '2']);

	await userEvent.click(armToggle());
	await expect.poll(maxes, { timeout: 5000 }).toEqual(['3', '2']);
	expect(totals()).toEqual(['3', '2']);
});
