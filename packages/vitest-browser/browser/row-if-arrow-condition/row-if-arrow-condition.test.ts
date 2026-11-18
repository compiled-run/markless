import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AsyncRows from './async-rows.tsrx';
import ImportedRows from './imported-rows.tsrx';
import InlineBlockRows from './inline-block-rows.tsrx';
import InlineRows from './inline-rows.tsrx';
import SameFileRows from './same-file-rows.tsrx';

// A row @if whose condition passes an arrow to an array method over parent state, reading the row item inside the arrow.

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

// Per row, the letters of the blocks it shows: s some, e every, f find, l filter(...).length > 1.
const marks = () =>
	[...document.querySelectorAll('li')]
		.map((row) =>
			[
				['[data-some]', 's'],
				['[data-every]', 'e'],
				['[data-find]', 'f'],
				['[data-filter]', 'l'],
			]
				.map(([selector, letter]) => (row.querySelector(selector!) ? letter : ''))
				.join('') || '-',
		)
		.join(' ');
const toggle = (index: number) => document.querySelectorAll<HTMLElement>('[data-toggle]')[index]!.click();

async function flips() {
	await expect.poll(marks).toBe('e e e');
	toggle(1);
	await expect.poll(marks).toBe('e sf e');
	toggle(0);
	await expect.poll(marks).toBe('sf sfl el');
	toggle(1);
	await expect.poll(marks).toBe('sf e e');
	toggle(0);
	await expect.poll(marks).toBe('e e e');
	expect(pageErrors).toEqual([]);
}

test('a row component in the same file, rendered in the browser', async () => {
	await render(SameFileRows);
	await flips();
});

test('a row component in the same file, after resume', async () => {
	await renderSSR(SameFileRows);
	await flips();
});

test('a row written inline in the @for, rendered in the browser', async () => {
	await render(InlineRows);
	await flips();
});

test('a row written inline in the @for, after resume', async () => {
	await renderSSR(InlineRows);
	await flips();
});

test('a row written inline in the @for with block-bodied functions, rendered in the browser', async () => {
	await render(InlineBlockRows);
	await flips();
});

test('a row written inline in the @for with block-bodied functions, after resume', async () => {
	await renderSSR(InlineBlockRows);
	await flips();
});

test('an imported row component, rendered in the browser', async () => {
	await render(ImportedRows);
	await flips();
});

test('an imported row component, after resume', async () => {
	await renderSSR(ImportedRows);
	await flips();
});

test('an imported row component in an async list, rendered in the browser', async () => {
	await render(AsyncRows);
	await flips();
});

test('an imported row component in an async list, after resume', async () => {
	await renderSSR(AsyncRows);
	await flips();
});
