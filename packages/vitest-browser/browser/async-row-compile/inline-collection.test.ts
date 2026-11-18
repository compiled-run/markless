import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, forgetRequests } from './gate.ts';
import InlineFilter from './inline-filter.tsrx';
import { InlineSlice } from './inline-slice.tsrx';

// A @for whose collection calls a method on an async value inside @try builds and follows both inputs.
afterEach(() => {
	cleanup();
	forgetRequests();
});

const messages = () => [...document.querySelectorAll('[data-message]')].map((row) => row.textContent);

async function reply(key: string) {
	await expect.poll(() => asked(key)).toBe(true);
	answer(key);
}

function type(text: string) {
	const input = document.querySelector<HTMLInputElement>('[data-query]')!;
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function filterFollowsTypingAndRefresh() {
	type('al');
	await expect.poll(messages).toEqual(['alpha 0', 'alpine 0']);
	click('[data-again]');
	await reply('messages:1');
	await expect.poll(messages).toEqual(['alpha 1', 'alpine 1']);
	type('b');
	await expect.poll(messages).toEqual(['beta 1']);
}

test('CSR: an inline filter on an async value follows typing and a refresh', async () => {
	await render(InlineFilter);
	await reply('messages:0');
	await expect.poll(messages).toEqual(['alpha 0', 'beta 0', 'alpine 0']);
	await filterFollowsTypingAndRefresh();
});

test('SSR: an inline filter on an async value follows typing and a refresh after resume', async () => {
	await renderSSR(InlineFilter);
	expect(messages()).toEqual(['alpha 0', 'beta 0', 'alpine 0']);
	await filterFollowsTypingAndRefresh();
});

async function sliceFollowsState() {
	click('[data-more]');
	await expect.poll(messages).toEqual(['alpha 0', 'beta 0']);
	click('[data-again]');
	await reply('messages:1');
	await expect.poll(messages).toEqual(['alpha 1', 'beta 1']);
}

test('CSR: an inline slice on an async value follows plain state and a refresh', async () => {
	await render(InlineSlice);
	await reply('messages:0');
	await expect.poll(messages).toEqual(['alpha 0']);
	await sliceFollowsState();
});

test('SSR: an inline slice on an async value follows plain state and a refresh after resume', async () => {
	await renderSSR(InlineSlice);
	expect(messages()).toEqual(['alpha 0']);
	await sliceFollowsState();
});
