import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Custom from './scenarios/custom.tsrx';
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

test('CSR: the region is on the page before anything is said', async () => {
	await render(Basic);
	expect(el(Root).getAttribute('aria-live')).toBe('polite');
	expect(el(Root).getAttribute('aria-atomic')).toBe('false');
	expect(titles()).toEqual([]);
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

test('CSR: the close button on a row dismisses that row', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual([]);
});

test('SSR: the close button on a minted row dismisses that row', async () => {
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

// Expected red, and the same wall as the pinned row below: every clock in this
// family is started by `toast()`, which is the method a consumer module cannot
// call. A message raised by writing the queue is never handed to a ticker, so
// nothing expires it. Auto-dismiss, hover-pause and tab-pause all hang off that
// one call, so they are pinned together rather than one row each.
test.fails('CSR: a message with its own duration leaves by itself', async () => {
	await render(Basic);
	el<HTMLButtonElement>(Save).click();
	await expect.poll(() => titles()).toEqual(['Saved']);
	await expect.poll(() => titles(), { timeout: 1500 }).toEqual([]);
});

test('SSR: a message raised after resume renders in the served region', async () => {
	await renderSSR(Basic);
	expect(el(Root).getAttribute('aria-live')).toBe('polite');
	el<HTMLButtonElement>(Sticky).click();
	await expect.poll(() => titles()).toEqual(['Upload failed']);
});

test('CSR: more messages than the region shows are queued, not dropped', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	await expect.poll(() => titles()).toEqual(['One', 'Two']);
	// All four are still held: the region shows two, the queue keeps everything.
	expect(el(page.getByTestId('queued')).textContent).toBe('4');
});

test('CSR: dismissing a showing message brings the next one forward', async () => {
	await render(Limits);
	el<HTMLButtonElement>(page.getByTestId('four')).click();
	await expect.poll(() => titles()).toEqual(['One', 'Two']);
	(el(Root).querySelector('[ui-toastclose]') as HTMLButtonElement).click();
	await expect.poll(() => titles()).toEqual(['Two', 'Three']);
	expect(el(page.getByTestId('queued')).textContent).toBe('3');
});

// Expected red, all three: a consumer's own `@for` written INSIDE `toaster.root`
// renders nothing. The rows are a repeat inside a component's children slot, and
// the slot is filled once at render - the queue write lands (the same write fills
// the default rows in every green row above) and no row follows it. Measured two
// ways on this tip: with the default rows in an `@else` arm, the page threw
// `RuntimeResumeError: Resume locator h2 expected <div> at DOM order index 3`,
// and with `{children}` rendered outside the construct the throw goes away and
// the rows simply never appear. Neither shape produces a diagnostic.
test.fails('CSR: the parts written out render the message they were given', async () => {
	await render(Custom);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('itemtitle').elements().map((one) => one.textContent))
		.toEqual(['Saved', 'Copied']);
	const rows = page.getByTestId('item').elements();
	expect(rows[1]?.getAttribute('ui-tone')).toBe('success');
	expect(page.getByTestId('itemdescription').elements()[1]?.textContent).toBe('Two rows now.');
	expect(page.getByTestId('itemicon').elements()[0]?.getAttribute('aria-hidden')).toBe('true');
});

test.fails('CSR: a written-out item carries its place in the stack', async () => {
	await render(Custom);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('item').elements()).toHaveLength(2);
	const rows = page.getByTestId('item').elements();
	expect(rows[0]?.getAttribute('style')).toBe('--index: 0; --offset: 0%');
	expect(rows[0]?.hasAttribute('ui-front')).toBe(true);
	expect(rows[1]?.getAttribute('style')).toBe('--index: 1; --offset: 100%');
	expect(rows[1]?.hasAttribute('ui-front')).toBe(false);
});

test.fails('CSR: the close button written out dismisses the message it sits in', async () => {
	await render(Custom);
	el<HTMLButtonElement>(page.getByTestId('two')).click();
	await expect.poll(() => page.getByTestId('item').elements()).toHaveLength(2);
	(page.getByTestId('itemclose').elements()[0] as HTMLButtonElement).click();
	await expect.poll(() => page.getByTestId('itemtitle').elements().map((one) => one.textContent))
		.toEqual(['Copied']);
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

// The ruled surface (defect 95): a shared() method called from a handler in
// ANOTHER module is text-spliced without the family's imports or graph wiring.
// It used to compile clean and crash at dispatch in three shapes; the compiler
// now REFUSES it loudly at build time, naming the absent identifiers and the
// import capture. This row pins the refusal: the quarantined scenario cannot
// even load. It becomes a rendering test again when the owner's F2-vs-F3 ruling
// ships the capability (carry the definition context, or route the call through
// the family's own emitted module).
// The browser sees only the failed fetch; the diagnostic text itself is pinned
// in packages/compiler/test/cross-module-shared-method.test.ts.
test('the imperative surface is refused at build time until the capability ships', async () => {
	await expect(import('./scenarios/method.tsrx')).rejects.toThrow();
});
