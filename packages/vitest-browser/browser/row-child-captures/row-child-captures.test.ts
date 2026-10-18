import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './rcc-page.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinRowCaptures() {
	click('[data-sort-text="Time"]');
	await expect.poll(() => text('[data-closed]')).toBe('time');
	click('[data-add]');
	await expect.poll(() => document.querySelector('[data-sort-text="Args"]')).not.toBeNull();
	click('[data-sort-text="Args"]');
	await expect.poll(() => text('[data-closed]')).toBe('args');
}

test('CSR: a child per row runs the callback its row passed, reading that row', async () => {
	await render(Page);
	await pinRowCaptures();
});

test('SSR: a child per row runs the callback its row passed, reading that row', async () => {
	await renderSSR(Page);
	await pinRowCaptures();
});
