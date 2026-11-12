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
const part = (tag: string, name: string) =>
	document.querySelector(`[data-reader="${tag}"] [data-${name}]`)?.textContent;
const readIn = (tag: string) => press(`[data-reader="${tag}"] [data-read]`);

async function opens() {
	await expect.poll(() => document.querySelector('[data-switch]') !== null).toBe(true);
	press('[data-switch]');
	await expect.poll(() => part('a', 'whole')).toBe('a:3');
}

// The sync computed follows the reload, so it marks when the reload has landed.
async function reloads(to: number) {
	press('[data-more]');
	await expect.poll(() => [part('a', 'whole'), part('b', 'whole')]).toEqual([`a:${to}`, `b:${to}`]);
}

async function handlerReadsTheReloadedProp() {
	await opens();
	readIn('a');
	await expect.poll(() => part('a', 'seen')).toBe('3');
	await reloads(4);
	readIn('a');
	readIn('b');
	await expect.poll(() => [part('a', 'seen'), part('b', 'seen')]).toEqual(['4', '4']);
	await reloads(5);
	readIn('b');
	await expect.poll(() => [part('a', 'seen'), part('b', 'seen')]).toEqual(['4', '5']);
	expect(pageErrors).toEqual([]);
}

async function asyncComputedFollowsTheReload() {
	await opens();
	await expect.poll(() => [part('a', 'size'), part('b', 'size')]).toEqual(['3', '3']);
	await reloads(4);
	await expect.poll(() => [part('a', 'size'), part('b', 'size')]).toEqual(['4', '4']);
	await reloads(5);
	await expect.poll(() => [part('a', 'size'), part('b', 'size')]).toEqual(['5', '5']);
	expect(pageErrors).toEqual([]);
}

test('CSR: a handler in a click-opened child arm reads the prop after it reloads', async () => {
	await render(Page);
	await handlerReadsTheReloadedProp();
});

test('SSR: a handler in a click-opened child arm reads the prop after it reloads', async () => {
	await renderSSR(Page);
	await handlerReadsTheReloadedProp();
});

test('CSR: an async computed over a prop in a click-opened child arm follows a reload', async () => {
	await render(Page);
	await asyncComputedFollowsTheReload();
});

test('SSR: an async computed over a prop in a click-opened child arm follows a reload', async () => {
	await renderSSR(Page);
	await asyncComputedFollowsTheReload();
});
