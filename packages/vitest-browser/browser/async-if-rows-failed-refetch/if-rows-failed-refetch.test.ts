import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FirstLoad from './first-load.tsrx';
import InlineRows from './inline-rows.tsrx';
import { installServer, resetServer, server } from './posts-server.ts';
import RowComponent from './row-component.tsrx';
import SaveRows from './save-rows.tsrx';

// Rows holding @if blocks, some open and some closed, inside an @try whose list re-fetch fails:
//   rows inline or drawn by a row component; @if with and without @else; open or closed when the fetch fails;
//   the failure on a Refresh, on the re-fetch a save causes, or on the first load; recovery by the next fetch or by reset.

installServer();
let pageErrors: string[] = [];
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => pageErrors.push(String(event.reason));
beforeEach(() => {
	resetServer();
	pageErrors = [];
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	cleanup();
});

const click = (selector: string, index = 0) =>
	document.querySelectorAll<HTMLElement>(selector)[index]!.click();
const titles = () =>
	[...document.querySelectorAll('[data-title]')].map((title) => title.textContent);
const caught = () => document.querySelector('[data-error]')?.textContent ?? null;
// Per row: f when its form is open, n when its note is open, c when its @else shows, x when its flag shows.
const rows = () =>
	[...document.querySelectorAll('li')]
		.map((row) =>
			[
				['[data-form]', 'f'],
				['[data-note]', 'n'],
				['[data-closed]', 'c'],
				['[data-flag]', 'x'],
			]
				.map(([selector, mark]) => (row.querySelector(selector!) ? mark : ''))
				.join(''),
		)
		.join(' ');
const posts = (count: number) => Array.from({ length: count }, (_, index) => `post ${index + 1}`);

async function keptThroughFailedRefresh(recover: 'refresh' | 'retry') {
	await expect.poll(titles).toEqual(posts(3));
	click('[data-toggle]', 0);
	click('[data-expand]', 1);
	await expect.poll(rows).toBe('fcx n cx');
	click('[data-fail]');
	await expect.poll(caught).toBe('offline at 1 Retry');
	expect(titles()).toEqual(posts(3));
	expect(rows()).toBe('fcx n cx');
	expect(document.querySelector('ul')!.nextElementSibling).toBe(
		document.querySelector('[data-error]'),
	);
	click('[data-toggle]', 0);
	click('[data-toggle]', 2);
	click('[data-expand]', 1);
	click('[data-expand]', 2);
	await expect.poll(rows).toBe('cx c fnx');
	if (recover === 'refresh') click('[data-refresh]');
	else click('[data-retry]');
	await expect.poll(titles).toEqual(posts(recover === 'refresh' ? 5 : 4));
	expect(caught()).toBeNull();
	expect(rows()).toBe(recover === 'refresh' ? 'cx c fnx cx cx' : 'cx c fnx cx');
	click('[data-expand]', 0);
	click('[data-toggle]', 1);
	await expect.poll(rows).toBe(recover === 'refresh' ? 'nx fc fnx cx cx' : 'nx fc fnx cx');
	expect(pageErrors).toEqual([]);
}

test('CSR: component rows with @if blocks are kept through a failed refresh and update on the next', async () => {
	await render(RowComponent);
	await keptThroughFailedRefresh('refresh');
});

test('SSR: component rows with @if blocks are kept through a failed refresh and update on the next', async () => {
	await renderSSR(RowComponent);
	await keptThroughFailedRefresh('refresh');
});

test('CSR: component rows with @if blocks are kept through a failed refresh and update on reset', async () => {
	await render(RowComponent);
	await keptThroughFailedRefresh('retry');
});

test('SSR: component rows with @if blocks are kept through a failed refresh and update on reset', async () => {
	await renderSSR(RowComponent);
	await keptThroughFailedRefresh('retry');
});

test('CSR: inline rows with @if blocks are kept through a failed refresh and update on the next', async () => {
	await render(InlineRows);
	await keptThroughFailedRefresh('refresh');
});

test('SSR: inline rows with @if blocks are kept through a failed refresh and update on the next', async () => {
	await renderSSR(InlineRows);
	await keptThroughFailedRefresh('refresh');
});

test('CSR: inline rows with @if blocks are kept through a failed refresh and update on reset', async () => {
	await render(InlineRows);
	await keptThroughFailedRefresh('retry');
});

test('SSR: inline rows with @if blocks are kept through a failed refresh and update on reset', async () => {
	await renderSSR(InlineRows);
	await keptThroughFailedRefresh('retry');
});

async function firstLoadFailsThenRows() {
	await expect.poll(caught).toBe('offline at 0');
	expect(titles()).toEqual([]);
	click('[data-refresh]');
	await expect.poll(titles).toEqual(posts(4));
	expect(caught()).toBeNull();
	expect(rows()).toBe('cx c cx cx');
	click('[data-expand]', 1);
	click('[data-expand]', 3);
	await expect.poll(rows).toBe('cx n cx nx');
	click('[data-refresh]');
	await expect.poll(titles).toEqual(posts(5));
	expect(rows()).toBe('cx n cx nx cx');
	expect(pageErrors).toEqual([]);
}

test('CSR: a list whose first load fails shows rows with working @if blocks once a refresh succeeds', async () => {
	await render(FirstLoad);
	await firstLoadFailsThenRows();
});

test('SSR: a list whose first load fails shows rows with working @if blocks once a refresh succeeds', async () => {
	await renderSSR(FirstLoad);
	await firstLoadFailsThenRows();
});

const total = () => document.querySelector('[data-total]')?.textContent ?? null;
const rowTitles = () =>
	[...document.querySelectorAll('li')].map(
		(row) => row.querySelector('[data-title]')?.textContent ?? 'form',
	);

// Only the row being renamed is toggled afterwards: its item never changes, so it is the same row throughout.
async function keptThroughFailedSaveRefetch(
	before: 'nothing' | 'add' | 'delete',
	recover: 'save' | 'retry',
) {
	await expect.poll(total).toBe('0');
	click('[data-expand]', 1);
	click('[data-toggle]', 2);
	await expect.poll(rowTitles).toEqual(['post a', 'post b', 'form']);
	let names = ['post a', 'post b', 'form'];
	if (before === 'add') {
		click('[data-add]');
		names = [...names, 'post d'];
		await expect.poll(rowTitles).toEqual(names);
	}
	if (before === 'delete') {
		server.posts = server.posts.filter((post) => post.id !== 'a');
		click('[data-touch]');
		names = ['post b', 'form'];
		await expect.poll(rowTitles).toEqual(names);
	}
	server.failNextRead = true;
	click('[data-like]', 0);
	await expect.poll(caught).toBe('offline Retry');
	expect(rowTitles()).toEqual(names);
	expect(total()).toBe('0');
	const renamed = names.indexOf('form');
	const noteOpen = () =>
		document.querySelectorAll('li')[renamed]!.querySelector('[data-note]') !== null;
	click('[data-expand]', renamed);
	await expect.poll(noteOpen).toBe(true);
	if (recover === 'retry') click('[data-retry]');
	else click('[data-like]', 0);
	await expect.poll(total).toBe(recover === 'retry' ? '1' : '2');
	expect(caught()).toBeNull();
	expect(rowTitles()).toEqual(names);
	expect(noteOpen()).toBe(true);
	click('[data-expand]', renamed);
	await expect.poll(noteOpen).toBe(false);
	expect(pageErrors).toEqual([]);
}

for (const before of ['nothing', 'add', 'delete'] as const)
	for (const recover of ['save', 'retry'] as const) {
		test(`CSR: component rows with @if blocks survive a failed re-fetch after a save (${before} first, recovered by ${recover})`, async () => {
			await render(SaveRows);
			await keptThroughFailedSaveRefetch(before, recover);
		});
		test(`SSR: component rows with @if blocks survive a failed re-fetch after a save (${before} first, recovered by ${recover})`, async () => {
			await renderSSR(SaveRows);
			await keptThroughFailedSaveRefetch(before, recover);
		});
	}
