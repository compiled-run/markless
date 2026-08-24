import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Limits from './scenarios/limits.tsrx';
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

// ---------------------------------------------------------------------------
// THE WALL EVERY PINNED ROW BELOW SHARES
//
// A COMPONENT INSIDE A REPEAT RENDERS NOTHING ON THE CLIENT. The queue write
// lands - the rows that read the queue's own length are green - and no element
// follows it. No diagnostic is produced either way.
//
// Projection is not the cause. A probe put two repeats over the same queue on one page:
//
//   - a repeat of PLAIN <li> markup inside `toaster.root`'s projected children
//     RENDERS (1 row for 1 message);
//   - a repeat of `toaster.item` inside a plain <ol> that projects nothing
//     renders NOTHING (0 rows);
//   - a repeat of a trivial local component with no `shared()` of its own, also
//     in a plain <ol>, renders NOTHING (0 rows).
//
// So the wall is the component in the repeat, not the projected slot, not the
// widget scope, and not the `{children}`-beside-a-construct shape the
// server-side splice fix in packages/web/src/ssr-data/renderer.ts addresses -
// that is a different bug and does not move these.
//
// `toaster.root` renders no default rows for a bare root, so the written-out
// parts are the family's ONLY path - and that path is exactly the shape this
// wall blocks. Until a component renders inside a repeat, the family renders no
// messages for any consumer.
//
// A repeat body may also hold only ONE element: two siblings inside `@for` is
// MARKLESS_PARSE_ERROR ("Expected '</' to close the JSX element, but found '@'").
// Measured while probing the above; not otherwise load-bearing here.
// ---------------------------------------------------------------------------

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

// Green without a rendered row: the queue is the fact, and the region's own
// length readout is plain markup rather than a component in a repeat.
test('CSR: more messages than a capped region shows are queued, not dropped', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	// All four are held: the repeat shows two, the queue keeps everything.
	await expect.poll(() => el(page.getByTestId('queued')).textContent).toBe('4');
});

test.fails('CSR: a message appears once', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	expect(el(Root).querySelectorAll('[ui-toast]')).toHaveLength(1);
});

test.fails('CSR: a component that never renders the region reaches the same queue', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Elsewhere).click();
	await expect.poll(() => titles()).toEqual(['From elsewhere']);
});

test.fails('CSR: saying the same id again updates the message in place', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	expect(el(Root).querySelectorAll('[ui-toast]')).toHaveLength(1);
});

// Merged: the written-out close button IS the only close button now, so the row
// that used to test the default row's button and the row that tested the custom
// path's button are one row.
test.fails('CSR: the close button on a row dismisses the message it sits in', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual([]);
});

test.fails('SSR: the close button on a resumed row dismisses the message it sits in', async () => {
	await renderSSR(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual([]);
});

test.fails('CSR: a message never takes focus away from what a person was doing', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).focus();
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	expect(document.activeElement).toBe(el(Save));
});

// Two walls at once now. The older one: every clock in this family is started by
// `toast()`, the method a consumer module cannot call, so a message
// raised by writing the queue is never handed to a ticker and nothing expires it.
// Auto-dismiss, hover-pause and tab-pause all hang off that one call and are
// pinned together rather than one row each. The newer one is the shared wall
// above: even with a ticker, the row is not on the page to leave it.
test.fails('CSR: a message with its own duration leaves by itself', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	await expect.poll(() => titles(), { timeout: 1500 }).toEqual([]);
});

test.fails('SSR: a message raised after resume renders in the served region', async () => {
	await renderSSR(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
});

test.fails('CSR: the parts written out render the message they were given', async () => {
	await render(Basic);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('itemtitle').elements().map((one) => one.textContent))
		.toEqual(['Saved', 'Copied']);
	const rows = page.getByTestId('item').elements();
	expect(rows[1]?.getAttribute('ui-tone')).toBe('success');
	expect(page.getByTestId('itemdescription').elements()[1]?.textContent).toBe('Two rows now.');
	expect(page.getByTestId('itemicon').elements()[0]?.getAttribute('aria-hidden')).toBe('true');
});

test.fails('CSR: a written-out item carries its place in the stack', async () => {
	await render(Basic);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('item').elements()).toHaveLength(2);
	const rows = page.getByTestId('item').elements();
	expect(rows[0]?.getAttribute('style')).toBe('--index: 0; --offset: 0%');
	expect(rows[0]?.hasAttribute('ui-front')).toBe(true);
	expect(rows[1]?.getAttribute('style')).toBe('--index: 1; --offset: 100%');
	expect(rows[1]?.hasAttribute('ui-front')).toBe(false);
});

test.fails('CSR: a capped region shows its cap, and dismissing brings the next forward', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	await expect.poll(() => titles()).toEqual(['One', 'Two']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual(['Two', 'Three']);
	expect(el(page.getByTestId('queued')).textContent).toBe('3');
});

test.fails('CSR: a dialog leaves the messages behind it reachable', async () => {
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

// A shared() method called from a handler in
// ANOTHER module is text-spliced without the family's imports or graph wiring.
// It used to compile clean and crash at dispatch in three shapes; the compiler
// now REFUSES it loudly at build time, naming the absent identifiers and the
// import capture. This row pins the refusal: the quarantined scenario cannot
// even load. It becomes a rendering test again when the compiler ships the capability (carry the definition context, or route the call through
// the family's own emitted module).
// The browser sees only the failed fetch; the diagnostic text itself is pinned
// in packages/compiler/test/cross-module-shared-method.test.ts.
test('the imperative surface is refused at build time until the capability ships', async () => {
	await expect(import('./scenarios/method.tsrx')).rejects.toThrow();
});
