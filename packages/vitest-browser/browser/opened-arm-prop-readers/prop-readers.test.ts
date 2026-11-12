import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './page.tsrx';

// Every reader of a prop in a click-opened child arm sees the prop after it reloads.

let pageErrors: string[] = [];
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => pageErrors.push(String(event.reason));
beforeEach(() => {
	pageErrors = [];
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	cleanup();
});

const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const reader = (tag: string) => {
	const at = (part: string) =>
		document.querySelector(`[data-reader="${tag}"] [data-${part}]`)?.textContent;
	return `seen ${at('seen')} whole ${at('whole')} size ${at('size')}`;
};
const readIn = (tag: string) => press(`[data-reader="${tag}"] [data-read]`);

async function everyReaderFollowsReloads() {
	await expect.poll(() => document.querySelector('[data-switch]') !== null).toBe(true);
	press('[data-switch]');
	await expect.poll(() => reader('a')).toBe('seen -1 whole a:3 size 3');
	readIn('a');
	await expect.poll(() => reader('a')).toBe('seen 3 whole a:3 size 3');
	press('[data-more]');
	await expect.poll(() => reader('a')).toBe('seen 3 whole a:4 size 4');
	await expect.poll(() => reader('b')).toBe('seen -1 whole b:4 size 4');
	readIn('a');
	await expect.poll(() => reader('a')).toBe('seen 4 whole a:4 size 4');
	readIn('b');
	await expect.poll(() => reader('b')).toBe('seen 4 whole b:4 size 4');
	press('[data-more]');
	await expect.poll(() => reader('b')).toBe('seen 4 whole b:5 size 5');
	readIn('b');
	await expect.poll(() => reader('b')).toBe('seen 5 whole b:5 size 5');
	expect(reader('a')).toBe('seen 4 whole a:5 size 5');
	expect(pageErrors).toEqual([]);
}

test('CSR: every reader of a prop in a click-opened child arm follows a reload', async () => {
	await render(Page);
	await everyReaderFollowsReloads();
});

test('SSR: every reader of a prop in a click-opened child arm follows a reload', async () => {
	await renderSSR(Page);
	await everyReaderFollowsReloads();
});
