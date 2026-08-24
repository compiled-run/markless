import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ComputedPage from './fixtures/krg-computed-page.tsrx';
import HandlerPage from './fixtures/krg-handler-page.tsrx';
import SiblingPage from './fixtures/krg-sibling-page.tsrx';
import EmptyArmPage from './pages/krg-empty-arm-page.tsrx';
import MintComputedPage from './pages/krg-mint-computed-page.tsrx';
import MintPage from './pages/krg-mint-page.tsrx';

/**
 * Defect 84: a keyed `@for` does not follow its source.
 *
 * Every page here feeds ONE keyed source into TWO lists - plain rows and rows
 * that each root a widget - so any behaviour that only the widget rows show is
 * attributable to the row root and nothing else. A text read of the same array
 * sits beside them, which separates "the source never moved" from "the source
 * moved and the rows did not".
 *
 * Three transitions, each named for what it asks of the row set: shrink (drop a
 * served key), grow (admit a key that was never served), swap (admit an unserved
 * key while dropping a served one, in one write).
 */
afterEach(() => cleanup());

function plain(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krg-plain-row]')].map((row) =>
		row.getAttribute('data-krg-value'),
	);
}

function widget(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krg-widget-row]')].map((row) =>
		row.getAttribute('data-krg-value'),
	);
}

function count(container: ParentNode) {
	return container.querySelector('[data-krg-count]')?.textContent;
}

function press(container: ParentNode, attribute: string) {
	const node = container.querySelector<HTMLButtonElement>(`[${attribute}]`);
	if (!node) throw new Error(`Expected the ${attribute} button.`);
	node.click();
}

// ============================================================ handler-driven

test('CSR: a handler write that drops a served key takes its row out of both lists', async () => {
	const screen = await render(HandlerPage);
	const container = screen.container as HTMLElement;
	expect(plain(container)).toEqual(['alpha', 'bravo', 'charlie']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie']);

	press(container, 'data-krg-shrink');
	await expect.poll(() => count(container)).toBe('2');
	expect(plain(container)).toEqual(['alpha', 'bravo']);
	expect(widget(container)).toEqual(['alpha', 'bravo']);
});

test('CSR: a served key that comes back is rendered again in both lists', async () => {
	const screen = await render(HandlerPage);
	const container = screen.container as HTMLElement;

	press(container, 'data-krg-shrink');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo']);

	press(container, 'data-krg-restore');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie']);
});

// PENDING CAPABILITY, and narrower than it was. Minting a row for a key that was
// never served now works - the mint witnesses at the bottom of this file are the
// proof - but only for a row the client can finish from the item alone: static
// markup plus text positions. NEITHER list on this page is that row.
//
// The plain list's row carries `data-krg-value={item.label}`, a dynamic
// ATTRIBUTE, and the widget list's row roots a component. The compiler refuses
// `rowTemplate` for both (packages/compiler/test/keyed-repeat-row-mint.test.ts
// names each refusal), so growth here still finds no markup to build from and
// the list stays as served. Measured, not assumed: with the pin lifted, `count`
// reaches 4 and the plain rows stay at three.
//
// Closing the attribute half means shipping attribute slots and their fill in
// the row template; closing the widget half means a minted row starting a widget
// instance with a graph of its own, which is a different capability again.
// A key that WAS served and comes back is a third case and it works: the
// detached row is held in rowRootsByKey and re-appended, which is what the
// `restore` rows above assert. Deterministic, so test.fails.
test.fails('CSR: a handler write that admits an unserved key grows both lists', async () => {
	const screen = await render(HandlerPage);
	const container = screen.container as HTMLElement;

	press(container, 'data-krg-grow');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test.fails('CSR: one write that admits an unserved key and drops a served one does both', async () => {
	const screen = await render(HandlerPage);
	const container = screen.container as HTMLElement;

	press(container, 'data-krg-swap');
	await expect.poll(() => count(container)).toBe('2');
	await expect.poll(() => plain(container)).toEqual(['bravo', 'delta']);
	expect(widget(container)).toEqual(['bravo', 'delta']);
});

test('SSR resume: a handler write that drops a served key takes its row out of both lists', async () => {
	const screen = await renderSSR(HandlerPage);
	const container = screen.container;
	expect(plain(container)).toEqual(['alpha', 'bravo', 'charlie']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie']);

	press(container, 'data-krg-shrink');
	await expect.poll(() => count(container)).toBe('2');
	expect(plain(container)).toEqual(['alpha', 'bravo']);
	expect(widget(container)).toEqual(['alpha', 'bravo']);
});

test.fails('SSR resume: a handler write that admits an unserved key grows both lists', async () => {
	const screen = await renderSSR(HandlerPage);
	const container = screen.container;

	press(container, 'data-krg-grow');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test.fails('SSR resume: one write that admits an unserved key and drops a served one does both', async () => {
	const screen = await renderSSR(HandlerPage);
	const container = screen.container;

	press(container, 'data-krg-swap');
	await expect.poll(() => plain(container)).toEqual(['bravo', 'delta']);
	expect(widget(container)).toEqual(['bravo', 'delta']);
});

// ============================================================ computed-driven

// This page's two lists are the SAME two unmintable row shapes as the handler
// page's - a dynamic attribute on the plain row, a component at the widget row's
// root - so its growth stays pinned for that reason and not because a `computed`
// collection behaves differently. The computed mint witnesses at the bottom of
// this file drive the same `computed()` filter over a mintable row and pass.
test.fails('CSR: widening a computed filter grows both lists past what was served', async () => {
	const screen = await render(ComputedPage);
	const container = screen.container as HTMLElement;
	expect(plain(container)).toEqual(['charlie']);
	expect(widget(container)).toEqual(['charlie']);

	press(container, 'data-krg-all');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test.fails('CSR: moving a computed filter sideways swaps the row set', async () => {
	const screen = await render(ComputedPage);
	const container = screen.container as HTMLElement;

	press(container, 'data-krg-only-delta');
	await expect.poll(() => plain(container)).toEqual(['delta']);
	expect(widget(container)).toEqual(['delta']);
});

test('CSR: a computed filter that matches nothing empties both lists', async () => {
	const screen = await render(ComputedPage);
	const container = screen.container as HTMLElement;

	press(container, 'data-krg-none');
	await expect.poll(() => count(container)).toBe('0');
	await expect.poll(() => plain(container)).toEqual([]);
	expect(widget(container)).toEqual([]);
});

test.fails('SSR resume: widening a computed filter grows both lists past what was served', async () => {
	const screen = await renderSSR(ComputedPage);
	const container = screen.container;
	expect(plain(container)).toEqual(['charlie']);

	press(container, 'data-krg-all');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test.fails('SSR resume: moving a computed filter sideways swaps the row set', async () => {
	const screen = await renderSSR(ComputedPage);
	const container = screen.container;

	press(container, 'data-krg-only-delta');
	await expect.poll(() => plain(container)).toEqual(['delta']);
	expect(widget(container)).toEqual(['delta']);
});

test('SSR resume: a computed filter that matches nothing empties both lists', async () => {
	const screen = await renderSSR(ComputedPage);
	const container = screen.container;

	press(container, 'data-krg-none');
	await expect.poll(() => count(container)).toBe('0');
	await expect.poll(() => plain(container)).toEqual([]);
	expect(widget(container)).toEqual([]);
});

// ================================= a row that is not the parent's first child

// The repeat's parent holds a static sibling BEFORE the rows and an `@empty` arm
// after them, which is exactly the combobox's filtered list: a `<p>` carrying
// `matches.length`, then the options, then `@empty`.
//
// The reconcile no longer assumes the rows are the parent's FIRST children:
// `rowStartOffset` on the keyed-repeat record states how many element siblings
// stand in front of them, counted by the compiler from the parent chunk's own
// children, so the pairing survives a static sibling before the rows.
test('CSR: rows preceded by a sibling still drop the right row', async () => {
	const screen = await render(SiblingPage);
	const container = screen.container as HTMLElement;
	expect(plain(container)).toEqual(['alpha', 'bravo', 'charlie']);

	press(container, 'data-krg-shrink');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'charlie']);
	expect(container.querySelector('[data-krg-header]')).not.toBeNull();
});

test('SSR resume: rows preceded by a sibling still drop the right row', async () => {
	const screen = await renderSSR(SiblingPage);
	const container = screen.container;

	press(container, 'data-krg-shrink');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'charlie']);
	expect(container.querySelector('[data-krg-header]')).not.toBeNull();
});

// ================================================= the `@empty` arm after boot

// The arm was never served: this page's lists both had rows at boot, so the only
// way the arm can speak is for the client to build it from markup the view
// payload carries. It is carried for the armed list and NOT for the bare one,
// which is what makes "no arm" here a fact about the transport rather than about
// the reconcile happening to do nothing.

function armedRows(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krg-armed-row]')].map((row) =>
		row.getAttribute('data-krg-value'),
	);
}

function bareRows(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krg-bare-row]')].map((row) =>
		row.getAttribute('data-krg-value'),
	);
}

function armedArm(container: ParentNode) {
	return container.querySelector('[data-krg-armed-empty]');
}

// The arm belongs in the row span, which on this page is everything after the
// header. Reading the parent's own children says so; querySelector would find it
// anywhere under the list and prove nothing about where it landed.
function armedListChildren(container: ParentNode) {
	const list = container.querySelector('[data-krg-armed-list]');
	if (!list) throw new Error('Expected the armed list.');
	return [...list.children].map((child) => child.getAttribute('data-krg-value') ?? child.tagName);
}

async function expectShrinkToZeroRaisesTheArm(container: ParentNode) {
	expect(armedRows(container)).toEqual(['alpha', 'bravo']);
	expect(armedArm(container)).toBeNull();

	press(container, 'data-krg-none');
	await expect.poll(() => armedRows(container)).toEqual([]);
	await expect.poll(() => armedArm(container)?.textContent).toBe('nothing matches');
	// After the header, and nothing else left in the span.
	expect(armedListChildren(container)).toEqual(['LI', 'LI']);
	expect(container.querySelector('[data-krg-armed-header]')).not.toBeNull();
}

async function expectRegrowthTakesTheArmBack(container: ParentNode) {
	press(container, 'data-krg-none');
	await expect.poll(() => armedArm(container)?.textContent).toBe('nothing matches');

	press(container, 'data-krg-restore');
	await expect.poll(() => armedArm(container)).toBeNull();
	// Identity, not just count: these are the SERVED rows coming back in their
	// own order, so the arm's departure did not disturb the row span.
	expect(armedRows(container)).toEqual(['alpha', 'bravo']);
	expect(container.querySelector('[data-krg-tail]')?.textContent).toBe('tail');
}

async function expectARepeatWithNoArmStaysArmless(container: ParentNode) {
	expect(bareRows(container)).toEqual(['alpha', 'bravo']);

	press(container, 'data-krg-none');
	await expect.poll(() => bareRows(container)).toEqual([]);
	const list = container.querySelector('[data-krg-bare-list]');
	// Only its own header is left: nothing was minted into a list that declared
	// no `@empty` arm.
	expect(list?.children.length).toBe(1);
	expect(container.querySelector('[data-krg-bare-header]')).not.toBeNull();
}

test('SSR resume: a list that empties after boot raises its `@empty` arm', async () => {
	const screen = await renderSSR(EmptyArmPage);
	await expectShrinkToZeroRaisesTheArm(screen.container);
});

test('SSR resume: a row coming back takes the `@empty` arm out again', async () => {
	const screen = await renderSSR(EmptyArmPage);
	await expectRegrowthTakesTheArmBack(screen.container);
});

test('SSR resume: a repeat with no `@empty` arm empties to nothing at all', async () => {
	const screen = await renderSSR(EmptyArmPage);
	await expectARepeatWithNoArmStaysArmless(screen.container);
});

// A partial shrink is not an empty one: the arm has no business appearing while
// a row is still standing.
test('SSR resume: dropping one row of two leaves the arm alone', async () => {
	const screen = await renderSSR(EmptyArmPage);
	const container = screen.container;

	press(container, 'data-krg-drop-first');
	await expect.poll(() => armedRows(container)).toEqual(['bravo']);
	expect(armedArm(container)).toBeNull();
});

test('CSR: a list that empties after boot raises its `@empty` arm', async () => {
	const screen = await render(EmptyArmPage);
	await expectShrinkToZeroRaisesTheArm(screen.container as HTMLElement);
});

test('CSR: a row coming back takes the `@empty` arm out again', async () => {
	const screen = await render(EmptyArmPage);
	await expectRegrowthTakesTheArmBack(screen.container as HTMLElement);
});

test('CSR: a repeat with no `@empty` arm empties to nothing at all', async () => {
	const screen = await render(EmptyArmPage);
	await expectARepeatWithNoArmStaysArmless(screen.container as HTMLElement);
});

// ================================ a row minted for a key that was never served

// The pages above pair every plain row with a widget row, which is what keeps
// their growth pinned. These two carry the OTHER row shape - static markup plus
// text read from the row's own item, the shape the compiler ships `rowTemplate`
// for - so growth here is the mint doing its whole job, and the assertions ask
// for the row's TEXT and its EVENT rather than a count that a placeholder would
// also satisfy.

function mintRows(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krg-mint-row]')].map(
		(row) => row.querySelector('[data-krg-mint-label]')?.textContent,
	);
}

// The rows belong in the row span: after the header, before nothing else the
// list holds. Reading the parent's own children says so; querySelectorAll would
// find them anywhere underneath and prove nothing about where they landed.
function mintListChildren(container: ParentNode) {
	const list = container.querySelector('[data-krg-mint-list]');
	if (!list) throw new Error('Expected the mint list.');
	return [...list.children].map(
		(child) => child.querySelector('[data-krg-mint-label]')?.textContent ?? child.textContent,
	);
}

function picked(container: ParentNode) {
	return container.querySelector('[data-krg-picked]')?.textContent;
}

async function expectAnUnservedKeyGrowsARealRow(container: ParentNode) {
	expect(mintRows(container)).toEqual(['alpha', 'bravo', 'charlie']);

	press(container, 'data-krg-grow');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => mintRows(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	// In the row span, behind the header, with the tail untouched outside it.
	expect(mintListChildren(container)).toEqual([
		'header',
		'alpha',
		'bravo',
		'charlie',
		'delta',
	]);
	expect(container.querySelector('[data-krg-mint-tail]')?.textContent).toBe('tail');
}

async function expectAMintedRowDispatchesItsOwnItem(container: ParentNode) {
	press(container, 'data-krg-grow');
	await expect.poll(() => mintRows(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);

	const buttons = container.querySelectorAll<HTMLButtonElement>('[data-krg-mint-pick]');
	expect(buttons).toHaveLength(4);
	// The row this runtime built, not one the server sent: clicking it has to
	// answer ITS item, which is the whole difference between a row and markup.
	buttons[3]!.click();
	await expect.poll(() => picked(container)).toBe('delta');

	buttons[0]!.click();
	await expect.poll(() => picked(container)).toBe('alpha');
}

async function expectOneWriteSwapsAServedKeyForAnUnservedOne(container: ParentNode) {
	press(container, 'data-krg-swap');
	await expect.poll(() => count(container)).toBe('2');
	await expect.poll(() => mintRows(container)).toEqual(['bravo', 'delta']);
	expect(mintListChildren(container)).toEqual(['header', 'bravo', 'delta']);
}

async function expectAMintedRowThatLeavesAndReturnsIsTheSameRow(container: ParentNode) {
	press(container, 'data-krg-grow');
	await expect.poll(() => mintRows(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	const minted = container.querySelectorAll('[data-krg-mint-row]')[3]!;

	press(container, 'data-krg-shrink');
	await expect.poll(() => mintRows(container)).toEqual(['alpha', 'bravo']);
	press(container, 'data-krg-grow');
	await expect.poll(() => mintRows(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);

	// Element identity: the row was kept and put back, not built a second time.
	expect(container.querySelectorAll('[data-krg-mint-row]')[3]).toBe(minted);
}

test('CSR: a handler write that admits an unserved key mints a real row', async () => {
	const screen = await render(MintPage);
	await expectAnUnservedKeyGrowsARealRow(screen.container as HTMLElement);
});

test('CSR: a minted row dispatches its own item', async () => {
	const screen = await render(MintPage);
	await expectAMintedRowDispatchesItsOwnItem(screen.container as HTMLElement);
});

test('CSR: one write that admits an unserved key and drops a served one does both', async () => {
	const screen = await render(MintPage);
	await expectOneWriteSwapsAServedKeyForAnUnservedOne(screen.container as HTMLElement);
});

test('CSR: a minted key that leaves and returns keeps its own row', async () => {
	const screen = await render(MintPage);
	await expectAMintedRowThatLeavesAndReturnsIsTheSameRow(screen.container as HTMLElement);
});

test('SSR resume: a handler write that admits an unserved key mints a real row', async () => {
	const screen = await renderSSR(MintPage);
	await expectAnUnservedKeyGrowsARealRow(screen.container);
});

test('SSR resume: a minted row dispatches its own item', async () => {
	const screen = await renderSSR(MintPage);
	await expectAMintedRowDispatchesItsOwnItem(screen.container);
});

test('SSR resume: one write that admits an unserved key and drops a served one does both', async () => {
	const screen = await renderSSR(MintPage);
	await expectOneWriteSwapsAServedKeyForAnUnservedOne(screen.container);
});

test('SSR resume: a minted key that leaves and returns keeps its own row', async () => {
	const screen = await renderSSR(MintPage);
	await expectAMintedRowThatLeavesAndReturnsIsTheSameRow(screen.container);
});

// ------------------------------------------------ the same, from a computed()

async function expectWideningAComputedFilterMintsThePastServedRows(container: ParentNode) {
	expect(mintRows(container)).toEqual(['charlie']);

	press(container, 'data-krg-all');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => mintRows(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(container.querySelector('[data-krg-mint-empty]')).toBeNull();
}

async function expectAComputedFilterMovingSidewaysSwapsTheRowSet(container: ParentNode) {
	press(container, 'data-krg-only-delta');
	await expect.poll(() => mintRows(container)).toEqual(['delta']);
	expect(mintListChildren(container)).toEqual(['header', 'delta']);
}

// The arm this client raised itself has to come back down for a MINTED row, not
// only for a served one coming back: the row that lowers it here never existed
// in the served document.
async function expectAMintLowersTheArmTheClientRaised(container: ParentNode) {
	press(container, 'data-krg-none');
	await expect.poll(() => container.querySelector('[data-krg-mint-empty]')?.textContent).toBe(
		'nothing matches',
	);

	press(container, 'data-krg-only-delta');
	await expect.poll(() => mintRows(container)).toEqual(['delta']);
	expect(container.querySelector('[data-krg-mint-empty]')).toBeNull();
	expect(mintListChildren(container)).toEqual(['header', 'delta']);
}

test('CSR: widening a computed filter mints the rows past what was served', async () => {
	const screen = await render(MintComputedPage);
	await expectWideningAComputedFilterMintsThePastServedRows(screen.container as HTMLElement);
});

test('CSR: moving a computed filter sideways swaps the row set', async () => {
	const screen = await render(MintComputedPage);
	await expectAComputedFilterMovingSidewaysSwapsTheRowSet(screen.container as HTMLElement);
});

test('CSR: a minted row takes back down the `@empty` arm the client raised', async () => {
	const screen = await render(MintComputedPage);
	await expectAMintLowersTheArmTheClientRaised(screen.container as HTMLElement);
});

test('SSR resume: widening a computed filter mints the rows past what was served', async () => {
	const screen = await renderSSR(MintComputedPage);
	await expectWideningAComputedFilterMintsThePastServedRows(screen.container);
});

test('SSR resume: moving a computed filter sideways swaps the row set', async () => {
	const screen = await renderSSR(MintComputedPage);
	await expectAComputedFilterMovingSidewaysSwapsTheRowSet(screen.container);
});

test('SSR resume: a minted row takes back down the `@empty` arm the client raised', async () => {
	const screen = await renderSSR(MintComputedPage);
	await expectAMintLowersTheArmTheClientRaised(screen.container);
});
