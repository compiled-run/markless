import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AddedLists from './added-lists.tsrx';
import AddedListsDeep from './added-lists-deep.tsrx';

afterEach(cleanup);

const LOADS = { timeout: 3_000 };
const lists = () =>
	[...document.querySelectorAll('[data-list]')].map((list) =>
		[...list.querySelectorAll('ul li')].map((item) => item.textContent?.trim()),
	);

async function addedListLoadsOnItsOwn() {
	await expect.poll(() => lists(), LOADS).toEqual([['apple#0', 'banana#0', 'grape#0'], ['banana#0']]);
	(document.querySelector('[data-add]') as HTMLElement).click();
	await expect.poll(() => lists(), LOADS).toEqual([['apple#0', 'banana#0', 'grape#0'], ['banana#0'], ['apple#0', 'grape#0']]);
	const added = document.querySelectorAll<HTMLInputElement>('[data-list] input')[2]!;
	added.value = 'boom';
	added.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(() => document.querySelectorAll('[data-list]')[2]?.querySelector('[data-error]')?.textContent, LOADS).toContain('no items');
	expect(lists().slice(0, 2)).toEqual([['apple#0', 'banana#0', 'grape#0'], ['banana#0']]);
	(document.querySelector('[data-refresh]') as HTMLElement).click();
	await expect.poll(() => lists().slice(0, 2), LOADS).toEqual([['apple#1', 'banana#1', 'grape#1'], ['banana#1']]);
}

test('CSR: a list added in the browser whose row holds its own async value and @try loads, fails and refreshes on its own', async () => {
	await render(AddedLists);
	await addedListLoadsOnItsOwn();
});

test('SSR: a list added after resume whose row holds its own async value and @try loads, fails and refreshes on its own', async () => {
	await renderSSR(AddedLists);
	await addedListLoadsOnItsOwn();
});

test('CSR: a list added in the browser two components below the page loads, fails and refreshes on its own', async () => {
	await render(AddedListsDeep);
	await addedListLoadsOnItsOwn();
});

test('SSR: a list added after resume two components below the page loads, fails and refreshes on its own', async () => {
	await renderSSR(AddedListsDeep);
	await addedListLoadsOnItsOwn();
});
