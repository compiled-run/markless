import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import OneMessage from './scenarios/one-message.tsrx';

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

// One page module per file: a compiled page installs its row-minting loader into
// a single unqualified global, so importing a second page's module here leaves
// only the last one able to mint rows and every other page throws
// MARKLESS_PRERENDER_DATA_COMPONENT_MISSING. `one-message.tsrx` has no repeat, so
// it installs nothing and is safe to sit beside `basic.tsrx`; `limits.tsrx` and
// `over-modal.tsrx` each hold their own file.
//
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
}

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
});
