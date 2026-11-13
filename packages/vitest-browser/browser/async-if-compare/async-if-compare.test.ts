import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import TaskPane from './if-compare.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
const shown = ['[data-strict]', '[data-loose]', '[data-else]', '[data-defined]', '[data-member]', '[data-computed]', '[data-alone]'];

async function opensOnEachTask() {
	for (const selector of shown) await expect.poll(() => text(selector), { timeout: 2_000 }).toBe('task 1');
	expect(text('[data-empty]')).toBe(null);

	await press('[data-next]');
	for (const selector of shown) await expect.poll(() => text(selector), { timeout: 2_000 }).toBe('task 2');

	await press('[data-none]');
	await expect.poll(() => text('[data-empty]'), { timeout: 2_000 }).toBe('none');
	for (const selector of shown) expect(text(selector)).toBe(null);
}

test('CSR: @if comparing an async value with null or undefined opens once it loads, and follows it', async () => {
	await render(TaskPane);
	await opensOnEachTask();
});

test('SSR: the same on a resumed page', async () => {
	await renderSSR(TaskPane);
	await opensOnEachTask();
});
