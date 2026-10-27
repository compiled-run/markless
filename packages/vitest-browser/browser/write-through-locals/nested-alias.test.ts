import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import NestedAliasPage from './nested-alias-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
async function expectTracked(): Promise<void> {
	await press('[data-rename]');
	await expect.poll(() => text('[data-name]')).toBe('n');
	await press('[data-tag]');
	await expect.poll(() => text('[data-tags]')).toBe('x,y');
	await press('[data-chain]');
	await expect.poll(() => text('[data-tags]')).toBe('x,y,z');
	await press('[data-qty-bump]');
	await expect.poll(() => text('[data-qty]')).toBe('3');
	await press('[data-detached]');
	await expect.poll(() => text('[data-name]')).toBe('fresh');
	expect(text('[data-tags]')).toBe('');
}

test('CSR: a write through a local holding a nested state object updates the page', async () => {
	await render(NestedAliasPage);
	await expectTracked();
});

test('SSR: a write through a local holding a nested state object updates the page', async () => {
	await renderSSR(NestedAliasPage);
	await expectTracked();
});
