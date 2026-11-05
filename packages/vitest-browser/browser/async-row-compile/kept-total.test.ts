import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import KeptTotal from './kept-total.tsrx';

// After a failed refresh keeps the old value, a computed over it still follows plain state.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function waitAsked(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
}

async function followsAfterFailure() {
	click('[data-add]');
	await expect.poll(() => text('[data-total]')).toBe('2 x 30');
	click('[data-recheck]');
	await waitAsked('quote:1');
	answer('quote:1', 'price check failed');
	await expect.poll(() => text('[data-total-error]')).toBe('failed');
	expect(text('[data-total]')).toBe('2 x 30');
	click('[data-add]');
	await expect.poll(() => text('[data-total]')).toBe('3 x 30');
	click('[data-recheck]');
	await waitAsked('quote:2');
	answer('quote:2');
	await expect.poll(() => text('[data-total]')).toBe('3 x 50');
	expect(text('[data-total-error]')).toBe(null);
	click('[data-add]');
	await expect.poll(() => text('[data-total]')).toBe('4 x 50');
}

test('CSR: a computed over a kept value follows plain state after a failed refresh', async () => {
	await render(KeptTotal);
	await waitAsked('quote:0');
	answer('quote:0');
	await expect.poll(() => text('[data-total]')).toBe('1 x 30');
	await followsAfterFailure();
});

test('SSR: a computed over a kept value follows plain state after a failed refresh', async () => {
	await renderSSR(KeptTotal);
	expect(text('[data-total]')).toBe('1 x 30');
	await followsAfterFailure();
});
