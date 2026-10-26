import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import LocalPage from './local-helper-page.tsrx';

afterEach(cleanup);

const text = () => document.querySelector('[data-ten]')?.textContent ?? null;

test('CSR: a same-file helper creates state', async () => {
	await render(LocalPage);
	expect(text()).toBe('10');
	document.querySelector<HTMLElement>('[data-ten]')!.click();
	await expect.poll(text).toBe('11');
});

test('SSR: a same-file helper creates state', async () => {
	await renderSSR(LocalPage);
	expect(text()).toBe('10');
	document.querySelector<HTMLElement>('[data-ten]')!.click();
	await expect.poll(text).toBe('11');
});
