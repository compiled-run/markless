import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AsyncObjectKeyPage from './async-object-key-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);

async function expectRefetchOnNestedWrite(): Promise<void> {
	await expect.poll(() => text('[data-results]')).toBe('results a:1');
	await press('[data-term]');
	await expect.poll(() => text('[data-results]')).toBe('results b:1');
	await press('[data-page]');
	await expect.poll(() => text('[data-results]')).toBe('results b:2');
	await press('[data-sort]');
	await expect.poll(() => text('[data-sorted]')).toBe('sorted date');
}

test('CSR: an async value keyed on a whole state object refetches when a field inside it changes', async () => {
	await render(AsyncObjectKeyPage);
	await expectRefetchOnNestedWrite();
});

test('SSR: an async value keyed on a whole state object refetches when a field inside it changes', async () => {
	await renderSSR(AsyncObjectKeyPage);
	await expectRefetchOnNestedWrite();
});
