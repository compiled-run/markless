import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Gate from './fixtures/part-row-gate.tsrx';

// Both blocks are the same widget-scoped shared instance, the same computed()
// over the same plain state cell, the same keyed repeat and the same seven
// strings. They differ only in whether one row is a component part.

afterEach(async () => {
	await cleanup();
});

function values(testid: string) {
	return page
		.getByTestId(testid)
		.elements()
		.map((one) => one.getAttribute('ui-value'));
}

const FIRST = ['x-0', 'x-1', 'x-2', 'x-3', 'x-4', 'x-5', 'x-6'];
const SECOND = ['x-7', 'x-8', 'x-9', 'x-10', 'x-11', 'x-12', 'x-13'];

async function shifted() {
	(page.getByTestId('shift').element() as HTMLButtonElement).click();
	await expect
		.poll(() => page.getByTestId('offset').element().textContent, { timeout: 5000 })
		.toBe('1');
}

test('CSR: rows that are plain elements refresh when every element is replaced', async () => {
	await render(Gate);
	expect(values('plain-cell')).toEqual(FIRST);
	await shifted();
	expect(values('plain-cell')).toEqual(SECOND);
});

test('CSR: rows that are component parts refresh when every element is replaced', async () => {
	await render(Gate);
	expect(values('parts-cell')).toEqual(FIRST);
	await shifted();
	expect(values('parts-cell')).toEqual(SECOND);
});

test('SSR: the served rows carry the values the instance cell spells', async () => {
	await renderSSR(Gate);
	await expect.poll(() => values('plain-cell').length, { timeout: 5000 }).toBe(7);
	expect(values('plain-cell')).toEqual(FIRST);
	expect(values('parts-cell')).toEqual(FIRST);
});

// The collection is a computed() ON the instance whose elements are objects, so
// the served rows exist only if the consumer seeded the cell it derives from.
test('SSR: rows over an object-element array the instance computes are served', async () => {
	await renderSSR(Gate);
	await expect.poll(() => values('cells-cell').length, { timeout: 5000 }).toBe(7);
	expect(values('cells-cell')).toEqual(FIRST);
});

test('CSR: rows over an object-element array refresh when every element is replaced', async () => {
	await render(Gate);
	expect(values('cells-cell')).toEqual(FIRST);
	await shifted();
	expect(values('cells-cell')).toEqual(SECOND);
});
