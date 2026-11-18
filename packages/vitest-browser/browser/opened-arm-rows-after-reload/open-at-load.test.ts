import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answered } from './api.ts';
import OpenCardsPage from './open-cards-page.tsrx';
import OpenDerivedPage from './open-derived-page.tsrx';
import OpenDirectPage from './open-direct-page.tsrx';

// A keyed @for in a child arm open from the first paint builds each row once when the async prop reloads while it stays open.

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
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const upTo = (count: number) => Array.from({ length: count }, (_, i) => `row ${i}`).join(',');

async function reloadsWhileOpen(open: string) {
	await expect.poll(rows).toBe(upTo(3));
	press('[data-more]');
	await expect.poll(rows).toBe(upTo(4));
	press('[data-more]');
	await expect.poll(rows).toBe(upTo(5));
	press('[data-close]');
	await expect.poll(rows).toBe('');
	press(open);
	await expect.poll(rows).toBe(upTo(5));
	press('[data-more]');
	await expect.poll(rows).toBe(upTo(6));
	expect(pageErrors).toEqual([]);
}

test('CSR: a @for over a computed of the prop builds each row once on reloads while open from the first paint', async () => {
	await render(OpenDerivedPage);
	await reloadsWhileOpen('[data-open-derived]');
});

test('SSR: a @for over a computed of the prop builds each row once on reloads while open from the first paint', async () => {
	await renderSSR(OpenDerivedPage);
	await reloadsWhileOpen('[data-open-derived]');
});

test('CSR: a @for over the prop itself builds each row once on reloads while open from the first paint', async () => {
	await render(OpenDirectPage);
	await reloadsWhileOpen('[data-open-direct]');
});

test('SSR: a @for over the prop itself builds each row once on reloads while open from the first paint', async () => {
	await renderSSR(OpenDirectPage);
	await reloadsWhileOpen('[data-open-direct]');
});

test('CSR: component rows over a computed of the prop builds each row once on reloads while open from the first paint', async () => {
	await render(OpenCardsPage);
	await reloadsWhileOpen('[data-open-cards]');
});

test('SSR: component rows over a computed of the prop builds each row once on reloads while open from the first paint', async () => {
	await renderSSR(OpenCardsPage);
	await reloadsWhileOpen('[data-open-cards]');
});
