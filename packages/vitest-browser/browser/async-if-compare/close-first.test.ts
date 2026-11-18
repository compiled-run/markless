import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import OrderPane from './close-first.tsrx';

// The first change after load closes the arm the page opened with.
afterEach(cleanup);

const poll = { timeout: 2_000 };
const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const next = () => userEvent.click(document.querySelector<HTMLElement>('[data-next]')!);

async function closesThenOpens() {
	await expect.poll(() => text('[data-strict]'), poll).toBe('order 1');
	expect(text('[data-loose]')).toBe('some');

	await next();
	await expect.poll(() => text('[data-strict-else]'), poll).toBe('none');
	await expect.poll(() => text('[data-loose]'), poll).toBe(null);
	expect(text('[data-strict]')).toBe(null);

	await next();
	await expect.poll(() => text('[data-strict]'), poll).toBe('order 3');
	await expect.poll(() => text('[data-loose]'), poll).toBe('some');
	expect(text('[data-strict-else]')).toBe(null);
}

test('CSR: @if comparing an async value closes on the first re-fetch to null and opens again', async () => {
	await render(OrderPane);
	await closesThenOpens();
});

test('SSR: the same on a resumed page', async () => {
	await renderSSR(OrderPane);
	await closesThenOpens();
});
