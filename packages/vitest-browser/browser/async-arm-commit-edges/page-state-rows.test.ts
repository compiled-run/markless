import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ImportedPageStateRows from './imported-page-state-rows.tsrx';
import PageStateRows from './page-state-rows.tsrx';

// Keyed rows in a @try whose child reads page state are kept by the browser on refresh; an unbound child is rebuilt in its row.

afterEach(cleanup);

const LOADS = { timeout: 5_000 };
const all = (selector: string) => [...document.querySelectorAll(selector)];
const texts = (selector: string) =>
	all(selector)
		.map((node) => node.textContent?.trim())
		.join('|');
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

function focusSecondNote(): HTMLInputElement {
	const note = all('[data-note]')[1] as HTMLInputElement;
	note.focus();
	note.value = 'typed';
	return note;
}

async function rowsKeptAndBuilt(label: string, rowText?: string) {
	await expect.poll(() => texts(label), LOADS).toBe('10 EUR|4 EUR');
	if (rowText) expect(texts(rowText)).toBe('10 EUR|4 EUR');
	const rows = all('[data-row]');
	const note = focusSecondNote();
	click('[data-usd]');
	await expect.poll(() => texts(label), LOADS).toBe('11 USD|5 USD|7 USD');
	if (rowText) expect(texts(rowText)).toBe('11 USD|5 USD|7 USD');
	expect(all('[data-row]').slice(0, 2)).toEqual(rows);
	expect(document.activeElement).toBe(note);
	expect(note.value).toBe('typed');
	return all('[data-row]');
}

test('CSR: rows whose child reads page state keep their elements and build the new row', async () => {
	await render(PageStateRows);
	await rowsKeptAndBuilt('[data-tag]', '[data-text]');
});

test('SSR: rows whose child reads page state keep their elements and build the new row after resume', async () => {
	await renderSSR(PageStateRows);
	await rowsKeptAndBuilt('[data-tag]', '[data-text]');
});

async function importedRowsKeptAndBuilt() {
	const rows = await rowsKeptAndBuilt('[data-label]');
	expect(rows.map((row) => row.getAttribute('data-unit'))).toEqual(['USD', 'USD', 'USD']);
	expect(all('[data-label]').map((node) => node.getAttribute('title'))).toEqual([
		'USD',
		'USD',
		'USD',
	]);
}

test('CSR: rows wrapping an imported child that reads page state keep their elements', async () => {
	await render(ImportedPageStateRows);
	await importedRowsKeptAndBuilt();
});

test('SSR: rows wrapping an imported child that reads page state keep their elements after resume', async () => {
	await renderSSR(ImportedPageStateRows);
	await importedRowsKeptAndBuilt();
});
