import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/keyed-row-outside-read.tsrx';

afterEach(() => cleanup());

// A served row whose bindings read page state outside the row keeps its elements when that state moves.
const row = (container: Element, id: string) =>
	container.querySelector(`[data-member="${id}"]`) as HTMLLIElement;

test('SSR: picking a row keeps that row, its checkbox focus, and every other row', async () => {
	const { container } = await renderSSR(App);
	const rows = ['c1', 'c2', 'c3'].map((id) => row(container, id));
	const box = rows[1]!.querySelector('[data-pick]') as HTMLInputElement;

	await userEvent.click(box);
	await expect
		.poll(() => container.querySelector('[data-summary]')?.textContent)
		.toBe('1 picked');

	expect(['c1', 'c2', 'c3'].map((id) => row(container, id))).toEqual(rows);
	expect(box.checked).toBe(true);
	expect(document.activeElement).toBe(box);

	await userEvent.click(box);
	await expect
		.poll(() => container.querySelector('[data-summary]')?.textContent)
		.toBe('0 picked');
	expect(row(container, 'c2')).toBe(rows[1]);
	expect(box.checked).toBe(false);
});

test('SSR: renaming an item rewrites its row in place', async () => {
	const { container } = await renderSSR(App);
	const before = row(container, 'c2');

	await userEvent.click(container.querySelector('[data-rename]') as HTMLButtonElement);
	await expect
		.poll(() => row(container, 'c2').querySelector('[data-name]')?.textContent)
		.toBe('Bea');

	expect(row(container, 'c2')).toBe(before);
	expect(before.querySelector('[data-pick]')?.getAttribute('aria-label')).toBe('Pick Bea');
});
