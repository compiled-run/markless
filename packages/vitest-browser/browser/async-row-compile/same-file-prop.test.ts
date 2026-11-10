import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import SameFileProp from './same-file-prop.tsrx';

// A same-file child's async recipe reads a prop named like the parent's state, beside an attribute reading that state.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

async function bumpRefreshes() {
	const button = document.querySelector<HTMLButtonElement>('[data-bump]')!;
	expect(button.getAttribute('aria-pressed')).toBe('false');
	button.click();
	await expect.poll(() => button.getAttribute('aria-pressed')).toBe('true');
	await reply('quote:1');
	await expect.poll(() => text('[data-price]')).toBe('Lamp: 40');
}

test('CSR: a same-file child reading a prop renders beside an attribute reading page state', async () => {
	await render(SameFileProp);
	await reply('quote:0');
	await expect.poll(() => text('[data-price]')).toBe('Lamp: 30');
	await bumpRefreshes();
});

test('SSR: a same-file child reading a prop renders beside an attribute reading page state', async () => {
	await renderSSR(SameFileProp);
	expect(text('[data-price]')).toBe('Lamp: 30');
	await bumpRefreshes();
});
