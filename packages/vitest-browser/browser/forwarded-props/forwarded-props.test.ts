import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './fp-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;

async function pin() {
	expect(text('[data-loud]')).toBe('RIGHT');
	document.querySelector<HTMLElement>('[data-toggle]')!.click();
	await expect.poll(() => text('[data-own]')).toBe('bottom');
	await expect.poll(() => text('[data-loud]')).toBe('BOTTOM');
	await expect.poll(() => text('[data-joined]')).toBe('a+b');
}

test('CSR: a child computed calling a method on a prop follows the parent state', async () => {
	await render(Page);
	await pin();
});

test('SSR: a child computed calling a method on a prop follows the parent state', async () => {
	await renderSSR(Page);
	await pin();
});
