import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Board from './board.tsrx';
import FetchedAccounts from './fetched-accounts.tsrx';
import ImportedAccounts from './imported-accounts.tsrx';
import Ledger from './ledger.tsrx';
import Totals from './totals.tsrx';
import Weather from './weather.tsrx';

// A row's item handed whole, or a nested field of it, to a child with its own @try, and a
// same-file helper holding one: each loads, re-runs with its own props, and fails alone.
afterEach(cleanup);

// Each load waits on a timer-backed fetch, so a loaded machine gets room to answer.
const LOADS = { timeout: 5_000 };

const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((node) => node.textContent?.trim());
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const entries = () =>
	[...document.querySelectorAll('[data-entry]')].map(
		(row) => `${row.getAttribute('data-entry')}=${row.textContent?.trim()}`,
	);

async function wholeItemRowsLoadRerunAndFailAlone() {
	await expect.poll(entries, LOADS).toEqual(['x9=Rent#1', 'k2=Food#1']);
	click('[data-recount]');
	await expect.poll(entries, LOADS).toEqual(['x9=Rent#2', 'k2=Food#2']);
	click('[data-open]');
	await expect.poll(entries, LOADS).toEqual(['x9=Rent#2', 'k2=Food#2', 'q2=Travel#2']);
	click('[data-open]');
	await expect
		.poll(entries, LOADS)
		.toEqual(['x9=Rent#2', 'k2=Food#2', 'q2=Travel#2', 'q3=failed']);
	click('[data-recount]');
	await expect
		.poll(entries, LOADS)
		.toEqual(['x9=Rent#3', 'k2=Food#3', 'q2=Travel#3', 'q3=failed']);
}

test('CSR: a same-file row child reads its whole row item in its async recipe', async () => {
	await render(Ledger);
	await wholeItemRowsLoadRerunAndFailAlone();
});

test('SSR: a same-file row child reads its whole row item in its async recipe after resume', async () => {
	await renderSSR(Ledger);
	await wholeItemRowsLoadRerunAndFailAlone();
});

async function nestedFieldRowsFollowTheirOwnCity() {
	await expect.poll(() => texts('[data-reading]'), LOADS).toEqual(['Oslo#1', 'Lima#1']);
	click('[data-rescale]');
	await expect.poll(() => texts('[data-reading]'), LOADS).toEqual(['Oslo#10', 'Lima#10']);
	click('[data-prepend]');
	await expect
		.poll(() => texts('[data-reading]'), LOADS)
		.toEqual(['Kyiv#10', 'Oslo#10', 'Lima#10']);
}

test('CSR: a same-file row child reads a nested field of its row item', async () => {
	await render(Weather);
	await nestedFieldRowsFollowTheirOwnCity();
});

test('SSR: a same-file row child reads a nested field of its row item after resume', async () => {
	await renderSSR(Weather);
	await nestedFieldRowsFollowTheirOwnCity();
});

async function eachHelperSettlesOnItsOwn() {
	await expect.poll(() => texts('[data-total]'), LOADS).toEqual(['Rent#3', 'Food#3']);
	expect(texts('[data-total-failed]')).toEqual(['failed']);
	expect(texts('main > *').length).toBe(3);
}

test('CSR: same-file helpers with their own @try each settle with their own prop', async () => {
	await render(Totals);
	await eachHelperSettlesOnItsOwn();
});

test('SSR: same-file helpers with their own @try each settle with their own prop', async () => {
	await renderSSR(Totals);
	await eachHelperSettlesOnItsOwn();
});

async function fetchedRowsLoadTheirItems() {
	await expect.poll(() => texts('[data-worth]'), LOADS).toEqual(['Pay#1', 'Save#1']);
}

test('CSR: rows of an async list hand their whole item to a child with its own @try', async () => {
	await render(FetchedAccounts);
	await fetchedRowsLoadTheirItems();
});

test('SSR: rows of an async list hand their whole item to a child with its own @try', async () => {
	await renderSSR(FetchedAccounts);
	await fetchedRowsLoadTheirItems();
});

async function importedRowsLoadAndAddedRowsToo() {
	await expect
		.poll(() => texts('[data-account-balance]'), LOADS)
		.toEqual(['Rent#1', 'Food#1']);
	click('[data-add]');
	await expect
		.poll(() => texts('[data-account-balance]'), LOADS)
		.toEqual(['Rent#1', 'Food#1', 'Travel#1']);
}

test('CSR: an imported row child reads its whole row item, and an added row loads', async () => {
	await render(ImportedAccounts);
	await importedRowsLoadAndAddedRowsToo();
});

test('SSR: an imported row child reads its whole row item, and a row added after resume loads', async () => {
	await renderSSR(ImportedAccounts);
	await importedRowsLoadAndAddedRowsToo();
});

async function settledHelperArmsHandleTheirOwnClicks() {
	await expect.poll(() => texts('[data-tap]'), LOADS).toEqual(['Rent#1 x0', 'Food#1 x0']);
	(document.querySelectorAll('[data-tap]')[1] as HTMLElement).click();
	await expect.poll(() => texts('[data-tap]')).toEqual(['Rent#1 x0', 'Food#1 x1']);
	(document.querySelectorAll('[data-tap]')[0] as HTMLElement).click();
	await expect.poll(() => texts('[data-tap]')).toEqual(['Rent#1 x1', 'Food#1 x1']);
}

test("CSR: a same-file helper's settled @try content handles its own clicks", async () => {
	await render(Board);
	await settledHelperArmsHandleTheirOwnClicks();
});

test("SSR: a same-file helper's settled @try content handles its own clicks after resume", async () => {
	await renderSSR(Board);
	await settledHelperArmsHandleTheirOwnClicks();
});
