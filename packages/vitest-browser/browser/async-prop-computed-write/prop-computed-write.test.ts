import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HandlerPage from './handler-page.tsrx';
import OwnListPage from './own-list-page.tsrx';
import Page from './page.tsrx';

// A child given an async value as a prop reads all of it: a sync computed over it re-derives after
// the child writes its own state, and a handler reads it whole. A control: a child's @for over its
// own sync computed, client-rendered into a @try, draws each row once.

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

const items = () => [...document.querySelectorAll('li')].map((li) => li.textContent).join(' ');
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function keepsDeriving() {
	await expect.poll(items).toBe('x y');
	press('[data-add]');
	await expect.poll(items).toBe('x y z0');
	press('[data-add]');
	await expect.poll(items).toBe('x y z0 z1');
	press('[data-claim]');
	await expect.poll(items).toBe('y z0 z1 mine');
	expect(pageErrors).toEqual([]);
}

async function handlerReadsTheValue() {
	await expect.poll(() => document.querySelector('[data-pick]') !== null).toBe(true);
	press('[data-pick]');
	await expect.poll(() => document.querySelector('[data-picked]')!.textContent).toBe('x,y');
	expect(pageErrors).toEqual([]);
}

async function rowsDrawnOnce() {
	await expect.poll(items).toBe('x y');
	press('[data-drop]');
	await expect.poll(items).toBe('y');
	expect(pageErrors).toEqual([]);
}

test('CSR: a computed over an async prop re-derives after a state write', async () => {
	await render(Page);
	await keepsDeriving();
});

test('SSR: a computed over an async prop re-derives after a state write', async () => {
	await renderSSR(Page);
	await keepsDeriving();
});

test('CSR: a handler reads a whole async prop', async () => {
	await render(HandlerPage);
	await handlerReadsTheValue();
});

test('SSR: a handler reads a whole async prop', async () => {
	await renderSSR(HandlerPage);
	await handlerReadsTheValue();
});

test('CSR: a child @for over its own sync computed draws each row once', async () => {
	await render(OwnListPage);
	await rowsDrawnOnce();
});

test('SSR: a child @for over its own sync computed draws each row once', async () => {
	await renderSSR(OwnListPage);
	await rowsDrawnOnce();
});
