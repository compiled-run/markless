import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CoalescedPage from './coalesced-page.tsrx';
import { answerGroceries, groceriesAsked } from './groceries.ts';
import PlainPage from './plain-page.tsrx';

// A keyed @for in a child component follows the array its parent passes, after an awaited write to the parent's state.

afterEach(() => cleanup());

const LOADS = { timeout: 5_000 };
const rows = () => [...document.querySelectorAll('[data-row]')].map((row) => row.textContent?.trim());

async function loadFillsChildList() {
	expect(rows()).toEqual([]);
	(document.querySelector('[data-load]') as HTMLElement).click();
	await expect.poll(groceriesAsked, LOADS).toBe(true);
	answerGroceries([
		{ id: 'a', name: 'apples' },
		{ id: 'b', name: 'bread' },
	]);
	await expect.poll(rows, LOADS).toEqual(['apples', 'bread']);
}

test('CSR: a child list fed rows ?? [] fills after the parent writes rows', async () => {
	await render(CoalescedPage);
	await loadFillsChildList();
});

test('SSR: a child list fed rows ?? [] fills after the parent writes rows', async () => {
	await renderSSR(CoalescedPage);
	await loadFillsChildList();
});

test('CSR: a child list fed rows fills after the parent writes rows', async () => {
	await render(PlainPage);
	await loadFillsChildList();
});

test('SSR: a child list fed rows fills after the parent writes rows', async () => {
	await renderSSR(PlainPage);
	await loadFillsChildList();
});
