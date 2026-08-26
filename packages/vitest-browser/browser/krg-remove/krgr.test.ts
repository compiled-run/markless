import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './krgr-page.tsrx';

/**
 * Removal from a keyed `@for` over WIDGET-scoped shared state.
 *
 * One source feeds two lists - plain rows, and rows that each root a widget of
 * their own - so a failure on only one of them names the row root. Three keys
 * are served and a fourth is only ever minted, which puts a served row and a
 * client-built row of the same shape side by side.
 */
afterEach(() => cleanup());

function plain(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krgr-plain-row]')].map((row) =>
		row.getAttribute('data-krgr-value'),
	);
}

function widget(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krgr-widget-row]')].map((row) =>
		row.getAttribute('data-krgr-value'),
	);
}

function owners(container: ParentNode) {
	return [...container.querySelectorAll<HTMLElement>('[data-krgr-widget-drop]')].map((one) =>
		one.getAttribute('data-krgr-owner'),
	);
}

function length(container: ParentNode) {
	return container.querySelector('[data-krgr-length]')?.textContent;
}

function press(container: ParentNode, attribute: string, at = 0) {
	const node = container.querySelectorAll<HTMLButtonElement>(`[${attribute}]`)[at];
	if (!node) throw new Error(`Expected a ${attribute} button at ${at}.`);
	node.click();
}

test('CSR: an outside handler takes a served key out of both lists', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie']);

	press(container, 'data-krgr-drop-b');
	await expect.poll(() => length(container)).toBe('2');
	expect(plain(container)).toEqual(['alpha', 'charlie']);
	expect(widget(container)).toEqual(['alpha', 'charlie']);
});

test('CSR: an outside handler takes a minted key out of both lists', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	press(container, 'data-krgr-add-d');
	await expect.poll(() => widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);

	press(container, 'data-krgr-drop-b');
	await expect.poll(() => length(container)).toBe('3');
	expect(plain(container)).toEqual(['alpha', 'charlie', 'delta']);
	expect(widget(container)).toEqual(['alpha', 'charlie', 'delta']);
});

// The attribute records which instance a row's own button resolved: a minted row
// has to answer with the enclosing widget's, exactly as a served row does.
test('CSR: a row-owned button resolves the enclosing widget on served and minted rows', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	expect(owners(container)).toEqual(['rows', 'rows', 'rows']);

	press(container, 'data-krgr-add-d');
	await expect.poll(() => widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(owners(container)).toEqual(['rows', 'rows', 'rows', 'rows']);
});

test('CSR: a row-owned button takes off its own row and leaves the rest', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	press(container, 'data-krgr-widget-drop', 1);
	await expect.poll(() => length(container)).toBe('2');
	expect(widget(container)).toEqual(['alpha', 'charlie']);
	expect(plain(container)).toEqual(['alpha', 'charlie']);
});

test('CSR: a minted row-owned button takes off its own row', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;
	press(container, 'data-krgr-add-d');
	await expect.poll(() => widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);

	press(container, 'data-krgr-widget-drop', 3);
	await expect.poll(() => length(container)).toBe('3');
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie']);
	expect(plain(container)).toEqual(['alpha', 'bravo', 'charlie']);
});

test('SSR: a resumed page drops a served key from both lists', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container as HTMLElement;

	press(container, 'data-krgr-drop-b');
	await expect.poll(() => length(container)).toBe('2');
	expect(plain(container)).toEqual(['alpha', 'charlie']);
	expect(widget(container)).toEqual(['alpha', 'charlie']);
});

test('SSR: a minted row-owned button resolves the enclosing widget and drops its row', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container as HTMLElement;
	press(container, 'data-krgr-add-d');
	await expect.poll(() => widget(container)).toEqual(['alpha', 'bravo', 'charlie', 'delta']);
	expect(owners(container)).toEqual(['rows', 'rows', 'rows', 'rows']);

	press(container, 'data-krgr-widget-drop', 3);
	await expect.poll(() => length(container)).toBe('3');
	expect(widget(container)).toEqual(['alpha', 'bravo', 'charlie']);
	expect(plain(container)).toEqual(['alpha', 'bravo', 'charlie']);
});
