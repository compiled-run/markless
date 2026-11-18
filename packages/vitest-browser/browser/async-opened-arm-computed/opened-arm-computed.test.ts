import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AltPage from './alt-page.tsrx';
import Page from './page.tsrx';

// A child's sync computed over an async prop, inside another child's @if arm a click opened,
// follows the prop when it reloads.

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

const counts = () =>
	`direct ${document.querySelector('[data-direct]')?.textContent} derived ${document.querySelector('[data-derived]')?.textContent}`;
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function followsReloads() {
	await expect.poll(() => document.querySelector('[data-switch]') !== null).toBe(true);
	press('[data-switch]');
	await expect.poll(counts).toBe('direct 3 derived 3');
	press('[data-more]');
	await expect.poll(counts).toBe('direct 4 derived 4');
	press('[data-extra]');
	await expect.poll(counts).toBe('direct 4 derived 5');
	press('[data-more]');
	await expect.poll(counts).toBe('direct 5 derived 6');
	expect(pageErrors).toEqual([]);
}

test('CSR: a computed over an async prop in a click-opened child arm follows a reload', async () => {
	await render(Page);
	await followsReloads();
});

test('SSR: a computed over an async prop in a click-opened child arm follows a reload', async () => {
	await renderSSR(Page);
	await followsReloads();
});

const kept = () => document.querySelector('[data-kept]')?.textContent;

async function reopenedFollowsReloads() {
	await expect.poll(() => document.querySelector('[data-toggle]') !== null).toBe(true);
	press('[data-toggle]');
	await expect.poll(kept).toBe('n0,n1');
	press('[data-grow]');
	await expect.poll(kept).toBe('n0,n1,n2');
	press('[data-toggle]');
	await expect.poll(kept).toBe(undefined);
	press('[data-grow]');
	press('[data-toggle]');
	await expect.poll(kept).toBe('n0,n1,n2,n3');
	press('[data-skip]');
	await expect.poll(kept).toBe('n1,n2,n3');
	press('[data-grow]');
	await expect.poll(kept).toBe('n1,n2,n3,n4');
	expect(pageErrors).toEqual([]);
}

test('CSR: a reopened arm with a computed over a named async prop follows reloads', async () => {
	await render(AltPage);
	await reopenedFollowsReloads();
});

test('SSR: a reopened arm with a computed over a named async prop follows reloads', async () => {
	await renderSSR(AltPage);
	await reopenedFollowsReloads();
});
