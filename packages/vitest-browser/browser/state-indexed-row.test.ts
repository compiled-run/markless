import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { Nested } from './state-indexed-row/nested.tsrx';
import { Plain } from './state-indexed-row/plain.tsrx';

// A row attribute over a module-constant list that indexes page state by a row value (status[row.key]) repaints when that state changes.

afterEach(cleanup);

const classes = () =>
	[...document.querySelectorAll('[data-row]')].map((row) => row.getAttribute('class'));

async function repaints() {
	expect(classes()).toEqual(['row s0', 'row s0', 'row s0']);
	document.querySelector<HTMLElement>('[data-go]')!.click();
	await expect.poll(classes).toEqual(['row s1', 'row s2 blocking', 'row s0']);
}

test('CSR: a row class reading state indexed by the row key repaints', async () => {
	await render(Plain);
	await repaints();
});
test('SSR resume: a row class reading state indexed by the row key repaints', async () => {
	await renderSSR(Plain);
	await repaints();
});
test('CSR: the same row class repaints when the row holds nested and sibling lists', async () => {
	await render(Nested);
	await repaints();
});
test('SSR resume: the same row class repaints when the row holds nested and sibling lists', async () => {
	await renderSSR(Nested);
	await repaints();
});
