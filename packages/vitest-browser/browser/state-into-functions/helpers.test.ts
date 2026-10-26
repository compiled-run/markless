import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HelpersPage from './helpers-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);

async function expectHelperChangesShown(): Promise<void> {
	await press('[data-rename]');
	await expect.poll(() => text('[data-first]')).toBe('Cy');
	await press('[data-rename-again]');
	await expect.poll(() => text('[data-first]')).toBe('Di');
	await press('[data-tag]');
	await expect.poll(() => text('[data-tags]')).toBe('x,y');
	await press('[data-patch]');
	await expect.poll(() => text('[data-item="2"]')).toBe('7');
	expect(text('[data-item="1"]')).toBe('0');
	await press('[data-tidy]');
	await expect.poll(() => text('[data-email]')).toBe('[ada@x.io]');
	await press('[data-bump]');
	await expect.poll(() => text('[data-counter]')).toBe('3');
	await press('[data-label]');
	await expect.poll(() => text('[data-shown]')).toBe('Di L (2)');
}

test('CSR: a helper that changes the state it is handed updates the page', async () => {
	await render(HelpersPage);
	await expectHelperChangesShown();
});

test('SSR: a helper that changes the state it is handed updates the page', async () => {
	await renderSSR(HelpersPage);
	await expectHelperChangesShown();
});
