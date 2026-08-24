import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ComputedPage from './fixtures/krg-computed-page.tsrx';
import HandlerPage from './fixtures/krg-handler-page.tsrx';
import SiblingPage from './fixtures/krg-sibling-page.tsrx';

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

// PENDING CAPABILITY - a row is minted for a key that was never served. Nothing
// in resume can build one: the view payload carries no row template, and
// `rowTemplateId` reaches only the two SERVER-side renderers
// (packages/web/src/settle-kernel.ts and packages/web/src/ssr-data/renderer.ts).
// Growth needs the row's markup, its widget instance, and its handle and event
// wiring all minted client-side, which is new machinery rather than a repair.
// Reusing the settle kernel client-side was evaluated and rejected: its input is
// the whole render-data surface - every chunk and every component definition
// (SurfaceLike in settle-kernel.ts) - so shipping it would put the entire
// template corpus in the browser payload. A minted row also has to enter the
// element census through the splice, the same requirement the `@empty` arm hit.
// A key that WAS served and comes back is a different case and it works: the
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
