import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import BareTryRowPage from './bare-try-row/page.tsrx';

// A keyed row whose component is a bare @try lives between row comments and survives reorders and arm swaps.
afterEach(() => cleanup());

const WAIT = { timeout: 2000, interval: 10 };

function click(root: ParentNode, selector: string) {
	const element = root.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	element.click();
}

const itemIds = (root: ParentNode) =>
	[
		...root.querySelectorAll(
			'[data-list="items"] > [data-item], [data-list="items"] > [data-loading]',
		),
	].map((node) => node.getAttribute('data-item') ?? node.getAttribute('data-loading'));

async function reorderInsertRemove(root: ParentNode) {
	await expect.poll(() => itemIds(root), WAIT).toEqual(['a', 'b', 'c']);
	click(root, '[data-reverse]');
	await expect.poll(() => itemIds(root), WAIT).toEqual(['c', 'b', 'a']);
	click(root, '[data-add]');
	await expect.poll(() => itemIds(root), WAIT).toEqual(['c', 'b', 'a', 'd']);
	await expect
		.poll(() => root.querySelector('[data-item="d"]')?.textContent, WAIT)
		.toBe('detail d');
	click(root, '[data-remove]');
	await expect.poll(() => itemIds(root), WAIT).toEqual(['c', 'b', 'a']);
	// Every row still settles its own detail after the shuffle: none lost its boundary.
	for (const id of ['c', 'b', 'a'])
		await expect
			.poll(() => root.querySelector(`[data-item="${id}"]`)?.textContent, WAIT)
			.toBe(`detail ${id}`);
}

async function rowCallbackInTry(root: ParentNode) {
	await expect.poll(() => root.querySelector('[data-count]')?.textContent, WAIT).toBe('1');
	await expect
		.poll(() => root.querySelector('[data-counter-value]')?.textContent, WAIT)
		.toBe('1 detail 1');
	// The callback reads its own row's item, so each bump proves which row it ran for.
	click(root, '[data-counter-bump]');
	await expect.poll(() => root.querySelector('[data-count]')?.textContent, WAIT).toBe('10');
	await expect
		.poll(() => root.querySelector('[data-counter-value]')?.textContent, WAIT)
		.toBe('10 detail 10');
	click(root, '[data-counter-bump]');
	await expect.poll(() => root.querySelector('[data-count]')?.textContent, WAIT).toBe('100');
}

async function onerowRekeyStale(root: ParentNode) {
	await expect
		.poll(() => root.querySelector('[data-page-label]')?.textContent, WAIT)
		.toBe('Page 1 of 3');
	click(root, '[data-next]');
	await expect
		.poll(() => root.querySelector('[data-page-label]')?.textContent, WAIT)
		.toBe('Page 2 of 3');
	// The old row is gone outright, not left showing stale text or stuck loading.
	expect(root.querySelectorAll('[data-page-label]')).toHaveLength(1);
	expect([...root.querySelectorAll('[data-page-item]')].map((node) => node.textContent)).toEqual([
		'p2 a',
	]);
	expect(root.querySelector('[data-page-loading]')).toBeNull();
	click(root, '[data-prev]');
	await expect
		.poll(() => root.querySelector('[data-page-label]')?.textContent, WAIT)
		.toBe('Page 1 of 3');
	expect(root.querySelectorAll('[data-page-label]')).toHaveLength(1);
}

async function tryFailsThenRecovers(root: ParentNode) {
	await expect
		.poll(() => root.querySelector('[data-flaky-error]')?.textContent, WAIT)
		.toMatch(/^boom flaky-/);
	click(root, '[data-flaky-retry]');
	await expect
		.poll(() => root.querySelector('[data-flaky-ok]')?.textContent, WAIT)
		.toMatch(/^fixed flaky-/);
	expect(root.querySelector('[data-flaky-error]')).toBeNull();
}

const retrying = (root: ParentNode) =>
	[...root.querySelectorAll('[data-list="retrying"] > p')].map((node) => node.textContent);

async function tryFailsThenRecoversOnInput(root: ParentNode) {
	await expect.poll(() => retrying(root), WAIT).toEqual(['down r1', 'down r2']);
	click(root, '[data-retry-reverse]');
	await expect.poll(() => retrying(root), WAIT).toEqual(['down r2', 'down r1']);
	click(root, '[data-retry-all]');
	await expect.poll(() => retrying(root), WAIT).toEqual(['up r2 1', 'up r1 1']);
	click(root, '[data-retry-reverse]');
	await expect.poll(() => retrying(root), WAIT).toEqual(['up r1 1', 'up r2 1']);
}

async function focusKeptAcrossRefresh(root: ParentNode) {
	await expect.poll(() => root.querySelectorAll('[data-focus-item]').length, WAIT).toBe(2);
	const input = root.querySelector<HTMLInputElement>('[data-focus-input="x"]')!;
	input.focus();
	input.value = 'typed';
	click(root, '[data-add-focus]');
	await expect.poll(() => root.querySelectorAll('[data-focus-item]').length, WAIT).toBe(3);
	expect(document.activeElement).toBe(input);
	expect(input.value).toBe('typed');
}

test('CSR: reordering, inserting and removing bare-@try rows keeps each row settled', async () => {
	await reorderInsertRemove((await render(BareTryRowPage)).container);
});
test('SSR: reordering, inserting and removing bare-@try rows keeps each row settled', async () => {
	await reorderInsertRemove((await renderSSR(BareTryRowPage)).container);
});

test('CSR: row-callback-in-try: a callback called from inside the row bare @try bumps the parent', async () => {
	await rowCallbackInTry((await render(BareTryRowPage)).container);
});
test('SSR: row-callback-in-try: a callback called from inside the row bare @try bumps the parent', async () => {
	await rowCallbackInTry((await renderSSR(BareTryRowPage)).container);
});

test('CSR: onerow-rekey-stale: re-keying a one-row bare-@try list replaces the old row cleanly', async () => {
	await onerowRekeyStale((await render(BareTryRowPage)).container);
});
test('SSR: onerow-rekey-stale: re-keying a one-row bare-@try list replaces the old row cleanly', async () => {
	await onerowRekeyStale((await renderSSR(BareTryRowPage)).container);
});

test('CSR: a bare-@try row that fails then recovers through its own @catch reset', async () => {
	await tryFailsThenRecovers((await render(BareTryRowPage)).container);
});
// No SSR twin: @catch's reset does not recover after SSR outside any row either, so the served case is pinned below through an input change.

test('CSR: a bare-@try row that fails recovers in place when its input changes, and still moves', async () => {
	await tryFailsThenRecoversOnInput((await render(BareTryRowPage)).container);
});
test('SSR: a bare-@try row that fails recovers in place when its input changes, and still moves', async () => {
	await tryFailsThenRecoversOnInput((await renderSSR(BareTryRowPage)).container);
});

test('CSR: focus and typed text inside a bare-@try row survive a sibling row being added', async () => {
	await focusKeptAcrossRefresh((await render(BareTryRowPage)).container);
});
test('SSR: focus and typed text inside a bare-@try row survive a sibling row being added', async () => {
	await focusKeptAcrossRefresh((await renderSSR(BareTryRowPage)).container);
});
