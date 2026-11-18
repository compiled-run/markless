import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedRows from './imported-rows.tsrx';
import LocalRows from './local-rows.tsrx';
import PlainRows from './plain-rows.tsrx';
import PropFixedRows from './prop-fixed-rows.tsrx';
import PropRows from './prop-rows.tsrx';

// Component rows in a keyed @for over an async value inside @try, each row holding @if blocks:
//   a row present at load (control), a row added by a re-fetch, a row rebuilt because its item changed;
//   @if with @else (note) and without (flag); a second @if inside the first (deep);
//   opened by a handler outside the block and closed by one inside it;
//   the open state held by the component drawing the block, or handed to it as a prop;
//   the row component in the page's module or imported; a plain state list as a control.

let pageErrors: string[] = [];
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => pageErrors.push(String(event.reason));
beforeEach(() => {
	pageErrors = [];
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	cleanup();
});

const row = (index: number) => document.querySelectorAll('li')[index]!;
const press = (index: number, selector: string) =>
	row(index).querySelector<HTMLElement>(selector)!.click();
const pressPage = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
// Per row: n when its note is open, c when its @else shows, d when the note's inner block shows, x when its flag shows.
const mark = (element: Element) =>
	[
		['[data-note]', 'n'],
		['[data-closed]', 'c'],
		['[data-deep]', 'd'],
		['[data-flag]', 'x'],
	]
		.map(([selector, letter]) => (element.querySelector(selector!) ? letter : ''))
		.join('');
const marks = (count: number) => () =>
	[...document.querySelectorAll('li')].map(mark).join(' ') +
	` (${document.querySelectorAll('li').length} of ${count})`;
const closedRows = (count: number, first = 'c') =>
	[first, ...Array(count - 1).fill('c')].join(' ') + ` (${count} of ${count})`;
const markAt = (index: number) => () => mark(row(index));
const typed = () => row(0).querySelector<HTMLInputElement>('[data-text]')?.value ?? null;

type Shape = 'own' | 'prop';

async function blocksOpenAndClose(index: number, shape: Shape) {
	press(index, '[data-expand]');
	await expect.poll(markAt(index)).toBe('n');
	press(index, '[data-expand]');
	await expect.poll(markAt(index)).toBe('c');
	if (shape === 'prop') return;
	press(index, '[data-expand]');
	await expect.poll(markAt(index)).toBe('n');
	press(index, '[data-deeper]');
	await expect.poll(markAt(index)).toBe('nd');
	press(index, '[data-deeper]');
	await expect.poll(markAt(index)).toBe('n');
	press(index, '[data-deeper]');
	await expect.poll(markAt(index)).toBe('nd');
	press(index, '[data-close]');
	await expect.poll(markAt(index)).toBe('c');
	press(index, '[data-expand]');
	await expect.poll(markAt(index)).toBe('nd');
	press(index, '[data-deeper]');
	await expect.poll(markAt(index)).toBe('n');
	press(index, '[data-close]');
	await expect.poll(markAt(index)).toBe('c');
	press(index, '[data-flag-toggle]');
	await expect.poll(markAt(index)).toBe('cx');
	press(index, '[data-flag-toggle]');
	await expect.poll(markAt(index)).toBe('c');
}

async function rowsOpenTheirBlocks(shape: Shape) {
	await expect.poll(marks(3)).toBe(closedRows(3));
	// Row 1 stays open through every re-fetch below, with what was typed into it.
	press(0, '[data-expand]');
	await expect.poll(markAt(0)).toBe('n');
	if (shape === 'own') {
		const input = row(0).querySelector<HTMLInputElement>('[data-text]')!;
		input.value = 'kept';
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}

	pressPage('[data-add]');
	await expect.poll(marks(4)).toBe(closedRows(4, 'n'));
	await blocksOpenAndClose(3, shape);

	press(1, '[data-like]');
	await expect.poll(() => row(1).querySelector('[data-likes]')!.textContent).toBe('1');
	await blocksOpenAndClose(1, shape);

	await blocksOpenAndClose(2, shape);

	pressPage('[data-refresh]');
	pressPage('[data-add]');
	await expect.poll(marks(5)).toBe(closedRows(5, 'n'));
	if (shape === 'own') expect(typed()).toBe('kept');
	await blocksOpenAndClose(4, shape);
	press(1, '[data-like]');
	await expect.poll(() => row(1).querySelector('[data-likes]')!.textContent).toBe('2');
	await blocksOpenAndClose(1, shape);
	expect(markAt(0)()).toBe('n');
	if (shape === 'own') expect(typed()).toBe('kept');
	press(0, '[data-expand]');
	await expect.poll(markAt(0)).toBe('c');
	expect(pageErrors).toEqual([]);
}

test('CSR: rows from an async list, row component in the page module', async () => {
	await render(LocalRows);
	await rowsOpenTheirBlocks('own');
});

test('SSR: rows from an async list, row component in the page module', async () => {
	await renderSSR(LocalRows);
	await rowsOpenTheirBlocks('own');
});

test('CSR: rows from an async list, imported row component', async () => {
	await render(ImportedRows);
	await rowsOpenTheirBlocks('own');
});

test('SSR: rows from an async list, imported row component', async () => {
	await renderSSR(ImportedRows);
	await rowsOpenTheirBlocks('own');
});

test('CSR: rows from an async list, block drawn by a child given the open state as a prop', async () => {
	await render(PropRows);
	await rowsOpenTheirBlocks('prop');
});

test('SSR: rows from an async list, block drawn by a child given the open state as a prop', async () => {
	await renderSSR(PropRows);
	await rowsOpenTheirBlocks('prop');
});

test('CSR: rows from a plain state list (control)', async () => {
	await render(PlainRows);
	await rowsOpenTheirBlocks('own');
});

test('SSR: rows from a plain state list (control)', async () => {
	await renderSSR(PlainRows);
	await rowsOpenTheirBlocks('own');
});

// A child given changing open state as a prop, whose open block holds a nested @if, cannot be rebuilt when the
// prop changes. Dev refuses it with the build's message instead of serving a page whose first press throws.
test('the dev server refuses rows whose child @if a changing prop decides, with the build message', async () => {
	const response = await fetch(`${new URL('./prop-handler-rows.tsrx', import.meta.url).href}?import`);
	expect(response.status).toBe(500);
	expect(await response.text()).toMatch(
		/MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: .*prop-handler-rows\.tsrx: \\u003cNoteBlock>: this @if \(open\) cannot be rebuilt when open changes because it holds a branch binding\. Its test reads the prop `open`, and \\u003cRow> in .*prop-handler-rows\.tsrx passes it `note`, which changes\./,
	);
	await expect(import('./prop-handler-rows.tsrx')).rejects.toThrow(/Failed to fetch dynamically imported module/);
});

async function fixedRowsOpen() {
	await expect.poll(marks(3)).toBe('n n n (3 of 3)');
	press(1, '[data-deeper]');
	await expect.poll(markAt(1)).toBe('nd');
	pressPage('[data-add]');
	await expect.poll(marks(4)).toBe('n nd n n (4 of 4)');
	press(3, '[data-deeper]');
	await expect.poll(markAt(3)).toBe('nd');
	expect(pageErrors).toEqual([]);
}

test('CSR: rows whose child @if every caller passes a fixed value render and handle presses', async () => {
	await render(PropFixedRows);
	await fixedRowsOpen();
});

// Live defect, also on main before the dev refusal: resumed from served HTML, the nested @if in a row child's
// fixed-prop arm never flips. Remove `.fails` when it is fixed.
test.fails('SSR: rows whose child @if every caller passes a fixed value render and handle presses', async () => {
	await renderSSR(PropFixedRows);
	await fixedRowsOpen();
});
