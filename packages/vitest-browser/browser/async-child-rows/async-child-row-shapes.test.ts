import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Ledger from './ledger.tsrx';
import Notes from './notes.tsrx';
import Topics from './topics.tsrx';

// The same three defects in other shapes: a child that IS the row, string keys,
// a row prepended rather than appended, a failing load, and a re-keyed child wrapped in its own element.
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

async function ledgerRowsLoadAndRefetch() {
	await expect.poll(entries, LOADS).toEqual(['x9=Rent#1', 'k2=Food#1']);
	const [rent] = document.querySelectorAll('[data-entry]');
	click('[data-open-account]');
	await expect.poll(() => texts('[data-balance-pending]'), LOADS).toEqual(['counting']);
	expect(document.querySelectorAll('[data-entry]')[1]).toBe(rent);
	await expect.poll(entries, LOADS).toEqual(['q2=Travel#1', 'x9=Rent#1', 'k2=Food#1']);
	click('[data-recount]');
	await expect.poll(entries, LOADS).toEqual(['q2=Travel#2', 'x9=Rent#2', 'k2=Food#2']);
	click('[data-open-account]');
	await expect
		.poll(entries, LOADS)
		.toEqual(['q3=failed', 'q2=Travel#2', 'x9=Rent#2', 'k2=Food#2']);
}

test('CSR: prepended rows load, refetch with their own item, and fail on their own', async () => {
	await render(Ledger);
	await ledgerRowsLoadAndRefetch();
});

test('SSR: prepended rows load, refetch with their own item, and fail on their own after resume', async () => {
	await renderSSR(Ledger);
	await ledgerRowsLoadAndRefetch();
});

async function newTopicStartsFromItsFirstLoad() {
	await expect
		.poll(() => texts('[data-post]'), LOADS)
		.toEqual(['feed:cats one', 'feed:cats two']);
	const before = document.querySelector('[data-topic]');
	click('[data-dogs]');
	await expect.poll(() => texts('[data-feed-pending]'), LOADS).toEqual(['waiting']);
	expect(before?.isConnected).toBe(false);
	expect(document.querySelector('[data-topic]')?.getAttribute('data-topic')).toBe('dogs');
	await expect
		.poll(() => texts('[data-post]'), LOADS)
		.toEqual(['feed:dogs one', 'feed:dogs two']);
}

test('CSR: a wrapped child keyed by its subject starts from its own first load', async () => {
	await render(Topics);
	await newTopicStartsFromItsFirstLoad();
});

test('SSR: a wrapped child keyed by its subject starts from its own first load after resume', async () => {
	await renderSSR(Topics);
	await newTopicStartsFromItsFirstLoad();
});

async function addedRowOpensItsOwnBoundary() {
	await expect.poll(() => texts('[data-note-toggle]'), LOADS).toEqual(['Alpha']);
	click('[data-add-note]');
	await expect.poll(() => texts('[data-note-toggle]'), LOADS).toEqual(['Alpha', 'Beta']);
	(document.querySelectorAll('[data-note-toggle]')[1] as HTMLElement).click();
	await expect.poll(() => texts('[data-note-detail]'), LOADS).toEqual(['Beta#0']);
	(document.querySelectorAll('[data-note-toggle]')[0] as HTMLElement).click();
	await expect.poll(() => texts('[data-note-detail]'), LOADS).toEqual(['Alpha#0', 'Beta#0']);
}

test('CSR: a row added with a boundary inside its own @if opens it', async () => {
	await render(Notes);
	await addedRowOpensItsOwnBoundary();
});

test('SSR: a row added after resume with a boundary inside its own @if opens it', async () => {
	await renderSSR(Notes);
	await addedRowOpensItsOwnBoundary();
});
