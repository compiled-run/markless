import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import RefreshedRows from './refreshed-rows.tsrx';
import TreePage from './tree-page.tsrx';

// A row holding two components from another file, one reading page state, grows and updates in place.
afterEach(cleanup);

const LOADS = { timeout: 3_000 };
const rows = () => [...document.querySelectorAll('ol li')].map((row) => row.textContent?.trim());
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

async function growsAndUpdates() {
	await expect.poll(rows, LOADS).toEqual(['1a']);
	click('[data-more]');
	await expect.poll(rows, LOADS).toEqual(['1a', '2a']);
	click('[data-unit]');
	await expect.poll(rows, LOADS).toEqual(['10b', '20b']);
	click('[data-more]');
	await expect.poll(rows, LOADS).toEqual(['10b', '20b', '30b']);
}

test('CSR', async () => {
	await render(RefreshedRows);
	await growsAndUpdates();
});

test('SSR', async () => {
	await renderSSR(RefreshedRows);
	await growsAndUpdates();
});

// Each row holds a component and the recursive list itself, both from another file.
const tree = () => [...document.querySelectorAll('main em')].map((amount) => amount.textContent);

async function treeGrows() {
	await expect.poll(tree, LOADS).toEqual(['1', '11']);
	click('[data-add]');
	await expect.poll(tree, LOADS).toEqual(['1', '11', '2', '21']);
}

test('tree: CSR', async () => {
	await render(TreePage);
	await treeGrows();
});

test('tree: SSR', async () => {
	await renderSSR(TreePage);
	await treeGrows();
});
