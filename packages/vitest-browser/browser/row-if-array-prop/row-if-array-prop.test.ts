import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AsyncRows from './async-rows.tsrx';
import FixedConfig from './fixed-config.tsrx';
import ImportedRows from './imported-rows.tsrx';
import PlainRows from './plain-rows.tsrx';
import ScalarChild from './scalar-child.tsrx';

// An @if in a child component whose condition is more than a bare prop: it reads into an array prop
// (opened.includes(post.id)), or combines a scalar prop (count > 0), with the child in the page's file or imported.

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

const press = (selector: string, index = 0) =>
	document.querySelectorAll<HTMLElement>(selector)[index]!.click();
// Per row: o when its block is open, x when another row is open, - otherwise.
const rowMarks = () =>
	[...document.querySelectorAll('li')]
		.map((row) =>
			row.querySelector('[data-open]') ? 'o' : row.querySelector('[data-other]') ? 'x' : '-',
		)
		.join('');
const shown = () =>
	[...document.querySelectorAll('[data-open]')].map((node) => node.textContent).join(',');

async function rowsFlip(other = '-') {
	const mark = (marks: string) => marks.replaceAll('-', marks.includes('o') ? other : '-');
	await expect.poll(rowMarks).toBe('---');
	press('[data-toggle]', 1);
	await expect.poll(rowMarks).toBe(mark('-o-'));
	press('[data-toggle]', 2);
	await expect.poll(rowMarks).toBe(mark('-oo'));
	press('[data-toggle]', 1);
	await expect.poll(rowMarks).toBe(mark('--o'));
	press('[data-open-first]');
	await expect.poll(rowMarks).toBe(mark('o-o'));
	press('[data-toggle]', 2);
	press('[data-open-first]');
	await expect.poll(rowMarks).toBe('---');
	expect(pageErrors).toEqual([]);
}

async function countFlips() {
	expect(shown()).toBe('');
	press('[data-more]');
	await expect.poll(shown).toBe('1');
	press('[data-more]');
	await expect.poll(shown).toBe('2');
	press('[data-reset]');
	await expect.poll(shown).toBe('');
	expect(pageErrors).toEqual([]);
}

// The caller passes a plain object rather than state, so the condition still reads it after the write.
async function fixedObjectFlips() {
	expect(shown()).toBe('');
	press('[data-next]');
	await expect.poll(shown).toBe('picked');
	press('[data-next]');
	await expect.poll(shown).toBe('inline');
	press('[data-next]');
	await expect.poll(shown).toBe('');
	expect(pageErrors).toEqual([]);
}

test('rows of a plain state list in the same file flip on an array prop, rendered in the browser', async () => {
	await render(PlainRows);
	await rowsFlip();
});

test('rows of a plain state list in the same file flip on an array prop, after resume', async () => {
	await renderSSR(PlainRows);
	await rowsFlip();
});

test('rows of an async list in the same file flip on an array prop, rendered in the browser', async () => {
	await render(AsyncRows);
	await rowsFlip();
});

test('rows of an async list in the same file flip on an array prop, after resume', async () => {
	await renderSSR(AsyncRows);
	await rowsFlip();
});

test('imported rows flip an @else if chain on an array prop, rendered in the browser', async () => {
	await render(ImportedRows);
	await rowsFlip('x');
});

test('imported rows flip an @else if chain on an array prop, after resume', async () => {
	await renderSSR(ImportedRows);
	await rowsFlip('x');
});

test('a child in the same file flips on a comparison over a scalar prop, rendered in the browser', async () => {
	await render(ScalarChild);
	await countFlips();
});

test('a child in the same file flips on a comparison over a scalar prop, after resume', async () => {
	await renderSSR(ScalarChild);
	await countFlips();
});

test('a condition reading into a plain object prop flips when the state beside it moves, rendered in the browser', async () => {
	await render(FixedConfig);
	await fixedObjectFlips();
});

test('a condition reading into a plain object prop flips when the state beside it moves, after resume', async () => {
	await renderSSR(FixedConfig);
	await fixedObjectFlips();
});
