import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render } from '../../src/index.ts';
import Page from './attach-state-input-page.tsrx';

afterEach(cleanup);

const follows = (selector: string) => document.querySelector(selector)?.getAttribute('data-follows');

test('CSR: an attach whose input reads state, its own or a prop bound to it, runs again when that state changes', async () => {
	await render(Page);
	await expect.poll(() => follows('[data-own]')).toBe('false');
	await expect.poll(() => follows('[data-lamp]')).toBe('false');

	await userEvent.click(document.querySelector<HTMLElement>('[data-flip]')!);
	await expect.poll(() => follows('[data-own]')).toBe('true');
	await expect.poll(() => follows('[data-lamp]')).toBe('true');
});
