import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import KeyedRemount from './keyed-remount.tsrx';
import PropRecipe from './prop-recipe.tsrx';
import RowsAdded from './rows-added.tsrx';

afterEach(cleanup);

// Each load waits on a timer-backed fetch, so a loaded machine gets room to answer.
const LOADS = { timeout: 5_000 };

const texts = (selector: string) =>
	[...document.querySelectorAll(selector)].map((node) => node.textContent?.trim());
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

async function addedRowLoads() {
	await expect
		.poll(() => texts('[data-shelf-row]'))
		.toEqual(['a v0 one', 'a v0 two', 'b v0 one', 'b v0 two']);
	click('[data-add]');
	await expect.poll(() => document.querySelectorAll('[data-list]').length, LOADS).toBe(3);
	await expect
		.poll(() => texts('[data-shelf-row]'))
		.toEqual(['a v0 one', 'a v0 two', 'b v0 one', 'b v0 two', 'new v0 one', 'new v0 two']);
}

test('CSR: a row added with an async child loads that child', async () => {
	await render(RowsAdded);
	await addedRowLoads();
});

test('SSR: a row added after resume with an async child loads that child', async () => {
	await renderSSR(RowsAdded);
	await addedRowLoads();
});

async function rowPropsReachTheRerun() {
	await expect
		.poll(() => texts('[data-shelf-row]'))
		.toEqual(['a v0 one', 'a v0 two', 'b v0 one', 'b v0 two']);
	click('[data-refetch]');
	await expect
		.poll(() => texts('[data-shelf-row]'))
		.toEqual(['a v1 one', 'a v1 two', 'b v1 one', 'b v1 two']);
}

test('CSR: a row child re-running its async recipe reads its row prop', async () => {
	await render(PropRecipe);
	await rowPropsReachTheRerun();
});

test('SSR: a row child re-running its async recipe after resume reads its row prop', async () => {
	await renderSSR(PropRecipe);
	await rowPropsReachTheRerun();
});

async function newKeyStartsFresh() {
	await expect
		.poll(() => texts('[data-shelf-row]'), LOADS)
		.toEqual(['fruit v0 one', 'fruit v0 two']);
	const before = document.querySelector('[data-shelf-row]');
	const input = document.querySelector('input') as HTMLInputElement;
	input.value = 'fruitx';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await expect
		.poll(() => texts('[data-shelf-row]'), LOADS)
		.toEqual(['fruitx v0 one', 'fruitx v0 two']);
	expect(before?.isConnected).toBe(false);
}

test('CSR: a re-keyed async child mounts fresh for the new key', async () => {
	await render(KeyedRemount);
	await newKeyStartsFresh();
});

test('SSR: a re-keyed async child mounts fresh for the new key after resume', async () => {
	await renderSSR(KeyedRemount);
	await newKeyStartsFresh();
});
