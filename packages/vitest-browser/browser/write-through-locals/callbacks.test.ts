import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CallbacksPage from './callbacks-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
async function expectTracked(): Promise<void> {
	await press('[data-run]');
	await expect.poll(() => text('[data-total]')).toBe('6');
	await expect.poll(() => text('[data-tags]')).toBe('a,b');
	await press('[data-spread]');
	await expect.poll(() => text('[data-seen]')).toBe('4');
}

test('CSR: a collection method called inside an array callback updates the page', async () => {
	await render(CallbacksPage);
	await expectTracked();
});

test('SSR: a collection method called inside an array callback updates the page', async () => {
	await renderSSR(CallbacksPage);
	await expectTracked();
});
