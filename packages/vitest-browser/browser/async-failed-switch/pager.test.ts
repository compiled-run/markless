import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import PagerPage from './pager-page.tsrx';

// A component inside a @try arm of a component that a keyed @for row places keeps its handler and values.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const errors: string[] = [];
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function pages() {
	errors.length = 0;
	document.querySelector<HTMLElement>('[data-tone="tone-next"]')!.click();
	await reply('page:2');
	await expect.poll(() => text('[data-shown]')).toBe('2');
	await expect
		.poll(() => document.querySelector('[data-tone="tone-next"]')?.hasAttribute('disabled'))
		.toBe(true);
	expect(errors).toEqual([]);
}

test('CSR: a component in a row component @try arm runs its handler', async () => {
	await render(PagerPage);
	await reply('page:1');
	await expect.poll(() => text('[data-shown]')).toBe('1');
	await pages();
});

test('SSR: a component in a row component @try arm runs its handler after resume', async () => {
	await renderSSR(PagerPage);
	await pages();
});

test('SSR: a component in a restarted row component @try arm runs its handler', async () => {
	await renderSSR(PagerPage);
	document.querySelector<HTMLElement>('[data-restart]')!.click();
	await reply('page:1');
	await expect.poll(() => text('[data-shown]')).toBe('1');
	await pages();
});
