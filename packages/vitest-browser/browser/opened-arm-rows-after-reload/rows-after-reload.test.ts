import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answered } from './api.ts';
import Page from './page.tsrx';

// A keyed @for in a child arm a click opens builds each row once when the async prop reloaded while the arm was closed.

let pageErrors: string[] = [];
const onError = (event: ErrorEvent) => pageErrors.push(String(event.error ?? event.message));
const onRejection = (event: PromiseRejectionEvent) => pageErrors.push(String(event.reason));
beforeEach(() => {
	pageErrors = [];
	answered.length = 0;
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
});
afterEach(() => {
	window.removeEventListener('error', onError);
	window.removeEventListener('unhandledrejection', onRejection);
	cleanup();
});

const rows = () => [...document.querySelectorAll('[data-list] li')].map((li) => li.textContent).join(',');
const closed = () => document.body.textContent?.includes('closed') && document.querySelector('[data-list]') === null;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const upTo = (count: number) => Array.from({ length: count }, (_, i) => `row ${i}`).join(',');

// The fetch answering, plus a macrotask for its delivery, marks a reload that landed while nothing on screen reads it.
async function reload(to: number) {
	press('[data-more]');
	await expect.poll(() => answered.at(-1)).toBe(to);
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function opensAfterReloads(open: string) {
	await expect.poll(() => document.querySelector(open) !== null).toBe(true);
	await reload(4);
	await reload(5);
	press(open);
	await expect.poll(rows).toBe(upTo(5));
	await reload(6);
	await expect.poll(rows).toBe(upTo(6));
	press('[data-close]');
	await expect.poll(closed).toBe(true);
	await reload(7);
	await reload(8);
	press(open);
	await expect.poll(rows).toBe(upTo(8));
	await reload(9);
	await expect.poll(rows).toBe(upTo(9));
	expect(pageErrors).toEqual([]);
}

test('CSR: a @for over a computed of a reloaded prop builds each row once when its arm opens', async () => {
	await render(Page);
	await opensAfterReloads('[data-open-derived]');
});

test('SSR: a @for over a computed of a reloaded prop builds each row once when its arm opens', async () => {
	await renderSSR(Page);
	await opensAfterReloads('[data-open-derived]');
});

test('CSR: a @for over the reloaded prop itself builds each row once when its arm opens', async () => {
	await render(Page);
	await opensAfterReloads('[data-open-direct]');
});

test('SSR: a @for over the reloaded prop itself builds each row once when its arm opens', async () => {
	await renderSSR(Page);
	await opensAfterReloads('[data-open-direct]');
});

test('CSR: component rows over a computed of a reloaded prop are built once when their arm opens', async () => {
	await render(Page);
	await opensAfterReloads('[data-open-cards]');
});

test('SSR: component rows over a computed of a reloaded prop are built once when their arm opens', async () => {
	await renderSSR(Page);
	await opensAfterReloads('[data-open-cards]');
});
