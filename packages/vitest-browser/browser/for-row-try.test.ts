import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ForRowTry from './for-row-try/page.tsrx';

// A row added after first render appears, and settles again, when its component holds an @try,
// whether the component is the row, sits inside the row's element, or is the row's component's child.
afterEach(() => cleanup());

const shown = (root: ParentNode, list: string) =>
	[...root.querySelectorAll(`[data-list="${list}"] [data-city] span`)].map(
		(span) => span.textContent,
	);
const wrapped = (root: ParentNode) =>
	[...root.querySelectorAll('[data-wrapped]')].map((li) => li.textContent);
const middle = (root: ParentNode) =>
	[...root.querySelectorAll('[data-middle]')].map((li) => li.textContent);
const press = (root: ParentNode, button: string) =>
	root.querySelector<HTMLElement>(`[data-${button}]`)!.click();

async function addedRowsAppear(root: ParentNode) {
	await expect.poll(() => shown(root, 'cities')).toEqual(['Boston sunny 1']);
	press(root, 'add');
	await expect.poll(() => shown(root, 'cities')).toEqual(['Boston sunny 1', 'Oslo sunny 1']);
	await expect.poll(() => wrapped(root)).toEqual(['Boston!', 'Oslo!']);
	await expect.poll(() => middle(root)).toEqual(['Boston!', 'Oslo!']);
	press(root, 'next="Oslo"');
	await expect.poll(() => shown(root, 'cities')).toEqual(['Boston sunny 1', 'Oslo sunny 2']);
	press(root, 'add-later');
	await expect.poll(() => shown(root, 'later')).toEqual(['Lima sunny 1']);
	press(root, 'next="Lima"');
	await expect.poll(() => shown(root, 'later')).toEqual(['Lima sunny 2']);
	press(root, 'drop');
	await expect.poll(() => shown(root, 'cities')).toEqual(['Oslo sunny 2']);
	press(root, 'next="Oslo"');
	await expect.poll(() => shown(root, 'cities')).toEqual(['Oslo sunny 3']);
}

test('CSR: a row whose component holds @try appears when added', async () => {
	await addedRowsAppear((await render(ForRowTry)).container);
});

test('SSR: a row whose component holds @try appears when added', async () => {
	await addedRowsAppear((await renderSSR(ForRowTry)).container);
});
