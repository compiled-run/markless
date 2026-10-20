import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './attach-imported-call-page.tsrx';

afterEach(cleanup);

const watched = (selector: string) =>
	document.querySelector(selector)?.getAttribute('data-watched') ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);

test('SSR: an attach closure calling an imported function runs it', async () => {
	await renderSSR(Page);
	expect(watched('[data-plain]')).toBe(null);

	await press('[data-plain-press]');
	await expect.poll(() => watched('[data-plain]')).toBe('watched');
	await press('[data-labelled-press]');
	await expect.poll(() => watched('[data-labelled]')).toBe('label-div');
});

test('CSR: an attach closure calling an imported function runs it', async () => {
	await render(Page);
	await expect.poll(() => watched('[data-plain]')).toBe('watched');
	await expect.poll(() => watched('[data-labelled]')).toBe('label-div');
});
