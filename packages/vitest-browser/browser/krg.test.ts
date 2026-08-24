import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ComputedPage from './fixtures/krg-computed-page.tsrx';
import HandlerPage from './fixtures/krg-handler-page.tsrx';

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

test('CSR: a handler write that admits an unserved key grows both lists', async () => {
	const screen = await render(HandlerPage);
	const container = screen.container as HTMLElement;

	press(container, 'data-krg-grow');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test('CSR: one write that admits an unserved key and drops a served one does both', async () => {
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

test('SSR resume: a handler write that admits an unserved key grows both lists', async () => {
	const screen = await renderSSR(HandlerPage);
	const container = screen.container;

	press(container, 'data-krg-grow');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test('SSR resume: one write that admits an unserved key and drops a served one does both', async () => {
	const screen = await renderSSR(HandlerPage);
	const container = screen.container;

	press(container, 'data-krg-swap');
	await expect.poll(() => plain(container)).toEqual(['bravo', 'delta']);
	expect(widget(container)).toEqual(['bravo', 'delta']);
});

// ============================================================ computed-driven

test('CSR: widening a computed filter grows both lists past what was served', async () => {
	const screen = await render(ComputedPage);
	const container = screen.container as HTMLElement;
	expect(plain(container)).toEqual(['charlie']);
	expect(widget(container)).toEqual(['charlie']);

	press(container, 'data-krg-all');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test('CSR: moving a computed filter sideways swaps the row set', async () => {
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

test('SSR resume: widening a computed filter grows both lists past what was served', async () => {
	const screen = await renderSSR(ComputedPage);
	const container = screen.container;
	expect(plain(container)).toEqual(['charlie']);

	press(container, 'data-krg-all');
	await expect.poll(() => count(container)).toBe('4');
	await expect.poll(() => plain(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
});

test('SSR resume: moving a computed filter sideways swaps the row set', async () => {
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
