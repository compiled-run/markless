import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HandlerReads from './handler-reads.tsrx';
import Headline from './headline.tsrx';
import NestedRowHandler from './nested-row-handler.tsrx';
import PriceList from './price-list.tsrx';
import RefreshRows from './refresh-rows.tsrx';
import Shelves from './shelves.tsrx';
import SpreadAsync from './spread-async.tsrx';
import TaskBoard from './task-board.tsrx';

afterEach(cleanup);

// Each load waits on a timer-backed fetch, so a loaded machine gets room to answer.
const LOADS = { timeout: 5_000 };
const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

async function clicksShow(read: string, steps: ReadonlyArray<readonly [string, string]>) {
	for (const [selector, shown] of steps) {
		click(selector);
		await expect.poll(() => textOf(read), LOADS).toBe(shown);
	}
}

async function spreadCopiesTheValue() {
	await expect.poll(() => textOf('[data-text]'), LOADS).toBe('todo one');
	await clicksShow('output', [['[data-copy]', '{"id":1,"text":"todo one"}']]);
}

test('CSR: a handler spreading an async value copies the value', async () => {
	await render(SpreadAsync);
	await spreadCopiesTheValue();
});

test('SSR: a handler spreading an async value copies the value after resume', async () => {
	await renderSSR(SpreadAsync);
	await spreadCopiesTheValue();
});

async function handlerReadsSeeTheValue() {
	await expect.poll(() => textOf('[data-name]'), LOADS).toBe('Ada');
	await clicksShow('[data-note]', [
		['[data-destructure]', 'Leeds/Ada'],
		['[data-keys]', 'name+city'],
		['[data-call]', 'Ada of Leeds'],
		['[data-json]', '{"name":"Ada","city":"Leeds"}'],
		['[data-list]', '2:wash,dry'],
		['[data-copy-task]', '{"slug":"wash","title":"Wash","done":false}'],
	]);
}

test('CSR: destructuring, keys, calls and collection reads in a handler see the async value', async () => {
	await render(HandlerReads);
	await handlerReadsSeeTheValue();
});

test('SSR: destructuring, keys, calls and collection reads in a handler see the async value after resume', async () => {
	await renderSSR(HandlerReads);
	await handlerReadsSeeTheValue();
});

async function everyRowHandlerRuns() {
	await expect.poll(() => document.querySelectorAll('button.row').length, LOADS).toBe(2);
	await clicksShow('output', [
		['button.row', 'row 1'],
		['button.pick', 'pick 1'],
		['button.retry', 'retry 2'],
	]);
}

test('CSR: handlers in an inner row and an @if arm of an async row run', async () => {
	await render(NestedRowHandler);
	await everyRowHandlerRuns();
});

test('SSR: handlers in an inner row and an @if arm of an async row run after resume', async () => {
	await renderSSR(NestedRowHandler);
	await everyRowHandlerRuns();
});

async function boardHandlersRun() {
	await expect.poll(() => document.querySelectorAll('tr').length, LOADS).toBe(2);
	await clicksShow('[data-last]', [
		['[data-finish]', 'finish:wash'],
		['[data-undo]', 'undo:dry'],
		['[data-step]', 'step:wash:soap'],
	]);
}

test('CSR: handlers in both arms of a row @if and in a row-local list run', async () => {
	await render(TaskBoard);
	await boardHandlersRun();
});

test('SSR: handlers in both arms of a row @if and in a row-local list run after resume', async () => {
	await renderSSR(TaskBoard);
	await boardHandlersRun();
});

async function refreshKeepsRowsAndFocus() {
	await expect.poll(() => document.querySelectorAll('li').length, LOADS).toBe(2);
	const rows = [...document.querySelectorAll('li')];
	const button = rows[0]!.querySelector('button') as HTMLButtonElement;
	click('button.refetch');
	button.focus();
	await expect.poll(() => document.querySelector('ul')?.getAttribute('aria-busy'), LOADS).toBe('true');
	await expect.poll(() => document.querySelector('ul')?.getAttribute('aria-busy') ?? null, LOADS).toBe(null);
	expect([...document.querySelectorAll('li')]).toEqual(rows);
	expect(rows.every((row) => row.isConnected)).toBe(true);
	expect(document.activeElement).toBe(button);
}

test('CSR: a refresh keeps keyed row elements and focus', async () => {
	await render(RefreshRows);
	await refreshKeepsRowsAndFocus();
});

test('SSR: a refresh keeps keyed row elements and focus after resume', async () => {
	await renderSSR(RefreshRows);
	await refreshKeepsRowsAndFocus();
});

const labels = () =>
	[...document.querySelectorAll('dd')].map(
		(row) => `${row.getAttribute('data-sku')}=${row.textContent}`,
	);

async function changedRefreshUpdatesInPlace() {
	await expect.poll(labels, LOADS).toEqual(['pear=pear 0', 'fig=fig 0']);
	const [pear, fig] = document.querySelectorAll('dd');
	const input = fig!.querySelector('input') as HTMLInputElement;
	input.focus();
	input.value = 'typed';
	click('[data-reload]');
	await expect.poll(labels, LOADS).toEqual(['pear=pear 1', 'fig=fig 1', 'kiwi=kiwi 1']);
	expect(textOf('[data-count]')).toBe('3 items');
	const after = document.querySelectorAll('dd');
	expect(after[0]).toBe(pear);
	expect(after[1]).toBe(fig);
	expect(document.activeElement).toBe(input);
	expect(input.value).toBe('typed');
}

test('CSR: a refresh with new values updates kept rows in place and adds the new one', async () => {
	await render(PriceList);
	await changedRefreshUpdatesInPlace();
});

test('SSR: a refresh with new values updates kept rows in place and adds the new one after resume', async () => {
	await renderSSR(PriceList);
	await changedRefreshUpdatesInPlace();
});

async function refreshedTextShows() {
	await expect.poll(() => textOf('[data-title]'), LOADS).toBe('edition 1');
	click('[data-next]');
	await expect.poll(() => textOf('[data-title]'), LOADS).toBe('edition 2');
	click('[data-next]');
	await expect.poll(() => textOf('[data-title]'), LOADS).toBe('edition 3');
}

test('CSR: a refresh of a @try that only shows text shows the new value', async () => {
	await render(Headline);
	await refreshedTextShows();
});

test('SSR: a refresh of a @try that only shows text shows the new value after resume', async () => {
	await renderSSR(Headline);
	await refreshedTextShows();
});

const books = () => [...document.querySelectorAll('[data-book]')].map((book) => book.textContent);

async function listInAnArmFollowsItsFlips() {
	await expect.poll(books, LOADS).toEqual(['One']);
	await clicksShow('[data-read]', [['[data-book]', 'a:One']]);
	click('[data-toggle]');
	await expect.poll(books, LOADS).toEqual(['Two']);
	await clicksShow('[data-read]', [['[data-book]', 'b:Two']]);
	click('[data-toggle]');
	await expect.poll(books, LOADS).toEqual(['One']);
	await clicksShow('[data-read]', [['[data-book]', 'a:One']]);
	click('[data-add]');
	await expect.poll(books, LOADS).toEqual(['One', 'Three']);
	(document.querySelectorAll('[data-book]')[1] as HTMLElement).click();
	await expect.poll(() => textOf('[data-read]'), LOADS).toBe('c:Three');
}

test('CSR: a list inside a row @if arm builds and wires its rows on every flip and in added rows', async () => {
	await render(Shelves);
	await listInAnArmFollowsItsFlips();
});

test('SSR: a list inside a row @if arm builds and wires its rows on every flip and in added rows after resume', async () => {
	await renderSSR(Shelves);
	await listInAnArmFollowsItsFlips();
});
