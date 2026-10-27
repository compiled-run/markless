import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ElementLocalsPage from './element-locals-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
async function expectTracked(): Promise<void> {
	await press('[data-loop]');
	await expect.poll(() => text('[data-row="2"]')).toBe('1');
	expect(text('[data-second]')).toBe('1');
	await press('[data-find]');
	await expect.poll(() => text('[data-row="3"]')).toBe('7');
	await press('[data-each]');
	await expect.poll(() => text('[data-row="1"]')).toBe('10');
	expect(text('[data-row="2"]')).toBe('11');
	expect(text('[data-row="3"]')).toBe('17');
	expect(text('[data-second]')).toBe('11');
	await press('[data-last]');
	await expect.poll(() => text('[data-row="3"]')).toBe('-1');
}

test('CSR: a write through a loop variable, a find() result, a callback row or at() updates the page', async () => {
	await render(ElementLocalsPage);
	await expectTracked();
});

test('SSR: a write through a loop variable, a find() result, a callback row or at() updates the page', async () => {
	await renderSSR(ElementLocalsPage);
	await expectTracked();
});
