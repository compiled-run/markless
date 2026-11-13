import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import TaskPane from './if-compare.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
const shown = ['[data-strict]', '[data-loose]', '[data-else]', '[data-defined]', '[data-member]', '[data-computed]', '[data-alone]', '[data-truthy]'];
const empty = ['[data-empty]', '[data-falsy]'];

async function opensOnEachTask() {
	for (const selector of shown) await expect.poll(() => text(selector), { timeout: 2_000 }).toBe('task 1');
	for (const selector of empty) expect(text(selector)).toBe(null);

	await press('[data-next]');
	for (const selector of shown) await expect.poll(() => text(selector), { timeout: 2_000 }).toBe('task 2');

	await press('[data-none]');
	for (const selector of empty) await expect.poll(() => text(selector), { timeout: 2_000 }).toBe('none');
	for (const selector of shown) expect(text(selector)).toBe(null);

	await press('[data-next]');
	for (const selector of shown) await expect.poll(() => text(selector), { timeout: 2_000 }).toBe('task 1');
	for (const selector of empty) expect(text(selector)).toBe(null);
}

test('CSR: @if testing an async value, bare or against null or undefined, opens once it loads, follows it, closes on null and opens again', async () => {
	await render(TaskPane);
	await opensOnEachTask();
});

test('SSR: the same on a resumed page', async () => {
	await renderSSR(TaskPane);
	await opensOnEachTask();
});
