import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './ahq-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// The slow handler stays pending until the test says so, so only a held queue keeps the count at 0.
async function pinLaterClicksFlow() {
	click('[data-slow]');
	await expect.poll(() => text('[data-slow-state]')).toBe('waiting');
	click('[data-quick]');
	click('[data-quick]');
	await expect.poll(() => text('[data-quick-count]')).toBe('2');
	expect(text('[data-slow-state]')).toBe('waiting');
	(globalThis as { __finishSlow?: () => void }).__finishSlow?.();
	await expect.poll(() => text('[data-slow-state]')).toBe('done');
}

test('CSR: a pending async handler does not hold later clicks', async () => {
	await render(Page);
	await pinLaterClicksFlow();
});

test('SSR: a pending async handler does not hold later clicks', async () => {
	await renderSSR(Page);
	await pinLaterClicksFlow();
});
