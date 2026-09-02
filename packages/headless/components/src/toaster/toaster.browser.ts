import { clearDevServerErrorOverlay } from '../../test-support/dev-error-overlay.ts';
import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Held from './scenarios/held.tsrx';
import Limits from './scenarios/limits.tsrx';
import OneMessage from './scenarios/one-message.tsrx';
import OverModal from './scenarios/over-modal.tsrx';

const Root = page.getByTestId('root');
const Save = page.getByTestId('save');
const Sticky = page.getByTestId('sticky');
const Elsewhere = page.getByTestId('elsewhere');

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function titles() {
	return [...el(Root).querySelectorAll('[ui-toasttitle]')].map((one) => one.textContent);
}

// A repeat body may hold only ONE element: two siblings inside `@for` is
// MARKLESS_PARSE_ERROR ("Expected '</' to close the JSX element, but found '@'"),
// and a construct may not be the direct child of a component tag, which is why
// every scenario wraps its repeat in a presentation `<div>`.

test('CSR: the region is on the page before anything is said', async () => {
	await render(Basic);
	expect(el(Root).getAttribute('aria-live')).toBe('polite');
	expect(el(Root).getAttribute('aria-atomic')).toBe('false');
	expect(titles()).toEqual([]);
});

test('SSR: the served region is a live region before anything is said', async () => {
	await renderSSR(Basic);
	expect(el(Root).getAttribute('aria-live')).toBe('polite');
	expect(el(Root).getAttribute('aria-relevant')).toBe('additions');
});

// Each of these parts branches on `children`, so a self-closed placement has to
// serve the record's own words and a written-into one has to serve the children.
function expectPartsFilled() {
	expect(el(page.getByTestId('itemtitle')).textContent).toBe('Saved');
	expect(el(page.getByTestId('itemdescription')).textContent).toBe('On disk.');
	expect(el(page.getByTestId('itemicon')).textContent).toBe('✓');
	expect(el(page.getByTestId('itemicon')).getAttribute('aria-hidden')).toBe('true');
	expect(el(page.getByTestId('written-itemtitle')).textContent).toBe('Written instead');
	expect(el(page.getByTestId('item')).getAttribute('ui-tone')).toBe('success');
	// Each row is its own status: a reader hears the message, not the whole region.
	expect(el(page.getByTestId('item')).getAttribute('role')).toBe('status');
	expect(el(page.getByTestId('item')).getAttribute('aria-live')).toBe('polite');
	// The consumer's name wins; a self-closed close is still named, by hidden text.
	expect(el(page.getByTestId('itemclose')).getAttribute('aria-label')).toBe('Dismiss');
	expect(el(page.getByTestId('itemclose')).textContent).toBe('×');
	expect(el(page.getByTestId('written-itemclose')).hasAttribute('aria-label')).toBe(false);
	expect(el(page.getByTestId('written-itemclose')).textContent).toBe('Close');
}

// `error` is the one tone a reader interrupts for: APG Alert, Radix's foreground toast.
function expectUrgentRow(tone: string) {
	const row = el(Root).querySelector('[ui-toast]');
	expect(row?.getAttribute('ui-tone')).toBe(tone);
	expect(row?.getAttribute('role')).toBe('alert');
	expect(row?.getAttribute('aria-live')).toBe('assertive');
}

test('CSR: an error message interrupts, and any other tone waits its turn', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	expectUrgentRow('error');
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual([]);

	el<HTMLButtonElement>(Elsewhere).click();
	await expect.poll(() => titles()).toEqual(['From elsewhere']);
	const row = el(Root).querySelector('[ui-toast]');
	expect(row?.getAttribute('role')).toBe('status');
	expect(row?.getAttribute('aria-live')).toBe('polite');
});

test('SSR: an error message raised after resume interrupts', async () => {
	await renderSSR(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	expectUrgentRow('error');
});

test('CSR: a written-out row renders the message it was given', async () => {
	await render(OneMessage);
	expectPartsFilled();
});

test('SSR: the served row renders the message it was given', async () => {
	await renderSSR(OneMessage);
	expectPartsFilled();
});

test('CSR: a message appears once', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	expect(el(Root).querySelectorAll('[ui-toast]')).toHaveLength(1);
});

test('CSR: a component that never renders the region reaches the same queue', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Elsewhere).click();
	await expect.poll(() => titles()).toEqual(['From elsewhere']);
});

test('CSR: saying the same id again updates the message in place', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	expect(el(Root).querySelectorAll('[ui-toast]')).toHaveLength(1);
});

test('CSR: the close button on a row dismisses the message it sits in', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual([]);
});

test('SSR: the close button on a resumed row dismisses the message it sits in', async () => {
	await renderSSR(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual([]);
});

test('CSR: a message never takes focus away from what a person was doing', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).focus();
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	expect(document.activeElement).toBe(el(Save));
});

// The one wall the shipped row mint does not clear. Every clock in this family is
// started inside `toast()`, a method on the page-scoped shared instance that a
// consumer module cannot call - and `expire`, `hasExpired`, `holdAll` and
// `releaseAll` are not on the family's public surface either, so a queue written
// through `toaster.say(...)` is handed to no ticker and `duration` means nothing.
// Auto-dismiss, hover-pause and tab-pause all hang off that one call and are
// pinned together rather than one row each.
test.fails('CSR: a message with its own duration leaves by itself', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	await expect.poll(() => titles(), { timeout: 1500 }).toEqual([]);
});

// WCAG 2.2.2 gives two separate reasons to stop the clock, and the region reports
// the stop as `ui-paused`. One reason ending is not both ending: a person who
// tabbed into a row to press Dismiss keeps it while the pointer wanders off, and a
// person still hovering keeps it while focus goes elsewhere.
test('CSR: focus in the region keeps the clock stopped after the pointer leaves', async () => {
	await render(Held);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	const region = el(Root);

	region.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: null }));
	await expect.poll(() => region.hasAttribute('ui-paused')).toBe(true);

	el<HTMLButtonElement>(page.getByTestId('itemclose')).focus();
	await new Promise((resolve) => setTimeout(resolve, 20));

	region.dispatchEvent(
		new PointerEvent('pointerout', { bubbles: true, relatedTarget: el(Elsewhere) }),
	);
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(region.hasAttribute('ui-paused')).toBe(true);

	// Both reasons gone is what starts it again.
	el<HTMLButtonElement>(Elsewhere).focus();
	await expect.poll(() => region.hasAttribute('ui-paused')).toBe(false);
});

test('CSR: the pointer resting on the region keeps the clock stopped after focus leaves', async () => {
	await render(Held);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	const region = el(Root);

	el<HTMLButtonElement>(page.getByTestId('itemclose')).focus();
	await expect.poll(() => region.hasAttribute('ui-paused')).toBe(true);

	region.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: null }));
	await new Promise((resolve) => setTimeout(resolve, 20));

	el<HTMLButtonElement>(Elsewhere).focus();
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(region.hasAttribute('ui-paused')).toBe(true);
});

test('SSR: a message raised after resume renders in the served region', async () => {
	await renderSSR(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
});

test('CSR: the parts written out render the message they were given', async () => {
	await render(Basic);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('itemtitle').elements().map((one) => one.textContent))
		.toEqual(['Saved', 'Copied']);
	const rows = page.getByTestId('item').elements();
	expect(rows[1]?.getAttribute('ui-tone')).toBe('success');
	expect(page.getByTestId('itemdescription').elements()[1]?.textContent).toBe('Two rows now.');
	expect(page.getByTestId('itemicon').elements()[0]?.getAttribute('aria-hidden')).toBe('true');
});

// The second wall. A minted row evaluates its own `computed()` cells before the
// page-scoped queue they read is live, so `positionOf(queue, item.id)` answers
// -1: `stackingStyle` clamps that to `--index: 0`, which hides it, and `ui-front`
// is left off the row that IS at the front. The cells correct themselves one
// graph flush later, by which time the row minted in that flush is stale in turn.
// Measured: two rows minted in one flush both paint `--index: 0` with no
// `ui-front`; after a third message the first row gains `ui-front` and the second
// still reads `--index: 0`.
test('CSR: a written-out item carries its place in the stack', async () => {
	await render(Basic);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('item').elements()).toHaveLength(2);
	const rows = page.getByTestId('item').elements();
	expect(rows[0]?.getAttribute('style')).toBe('--index: 0; --offset: 0%');
	expect(rows[0]?.hasAttribute('ui-front')).toBe(true);
	expect(rows[1]?.getAttribute('style')).toBe('--index: 1; --offset: 100%');
	expect(rows[1]?.hasAttribute('ui-front')).toBe(false);
});

test('CSR: more messages than a capped region shows are queued, not dropped', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	// All four are held: the repeat shows two, the queue keeps everything.
	await expect.poll(() => el(page.getByTestId('queued')).textContent).toBe('4');
});

test('CSR: a capped region shows its cap, and dismissing brings the next forward', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	await expect.poll(() => titles()).toEqual(['One', 'Two']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual(['Two', 'Three']);
	expect(el(page.getByTestId('queued')).textContent).toBe('3');
});

test('CSR: a dialog leaves the messages behind it reachable', async () => {
	await render(OverModal);
	el<HTMLButtonElement>(page.getByTestId('modal-trigger')).click();
	await expect.poll(() => el(page.getByTestId('modal-backdrop')).hasAttribute('hidden')).toBe(false);
	el<HTMLButtonElement>(page.getByTestId('say')).click();
	await expect.poll(() => titles()).toEqual(['Deleted']);
	// The live region is neither inert nor hidden while the dialog holds the page.
	expect(el(Root).hasAttribute('inert')).toBe(false);
	expect(el(Root).getAttribute('aria-hidden')).toBe(null);
	expect((el(Root).querySelector('[ui-toast]') as HTMLElement).closest('[inert]')).toBe(null);
});

// The half of the row above that does NOT need a rendered message: a dialog must
// not take the live region out of reach, whether or not anything has been said.
test('CSR: a dialog does not take the live region out of reach', async () => {
	await render(OverModal);
	el<HTMLButtonElement>(page.getByTestId('modal-trigger')).click();
	await expect.poll(() => el(page.getByTestId('modal-backdrop')).hasAttribute('hidden')).toBe(false);
	expect(el(Root).hasAttribute('inert')).toBe(false);
	expect(el(Root).getAttribute('aria-hidden')).toBe(null);
	expect(el(Root).closest('[inert]')).toBe(null);
});

// A shared() method called from a handler in another module is text-spliced
// without the family's imports or graph wiring, so the compiler refuses it at
// build time, naming the absent identifiers and the import capture. This row
// pins the refusal: the quarantined scenario cannot even load. It becomes a
// rendering test again once the compiler can carry the definition context or
// route the call through the family's own emitted module.
// The browser sees only the failed fetch; the diagnostic text itself is pinned
// in packages/compiler/test/cross-module-shared-method.test.ts.
test('the imperative surface is refused at build time until the capability ships', async () => {
	await expect(import('./scenarios/method.tsrx')).rejects.toThrow();
	await expect.poll(() => clearDevServerErrorOverlay()).toBeGreaterThan(0);
});
