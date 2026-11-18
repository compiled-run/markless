import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import UnreadPage from './unread-page.tsrx';

// An async value that is a plain number, passed whole as a prop, renders the number after every refresh.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const badge = () => document.querySelector('[data-badge]')?.textContent ?? null;

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function refreshes() {
	document.querySelector<HTMLElement>('[data-refresh]')!.click();
	await reply('count:1');
	await expect.poll(badge).toBe('7 unread');
	document.querySelector<HTMLElement>('[data-refresh]')!.click();
	await reply('count:2');
	await expect.poll(badge).toBe('8 unread');
}

test('CSR: an async number passed as a prop renders the number after a refresh', async () => {
	await render(UnreadPage);
	await reply('count:0');
	await expect.poll(badge).toBe('4 unread');
	await refreshes();
});

test('SSR: an async number passed as a prop renders the number after a refresh', async () => {
	await renderSSR(UnreadPage);
	expect(badge()).toBe('4 unread');
	await refreshes();
});
