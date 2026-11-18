import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { answered } from './api.ts';
import DeepPage from './deep-page.tsrx';

// Arms two levels inside a @try that settles in the browser, open from the first paint, follow a reload.

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

const text = (selector: string) => document.querySelector(selector)?.textContent;
const rows = () => [...document.querySelectorAll('[data-list] li')].map((li) => li.textContent).join(',');
const upTo = (count: number) => Array.from({ length: count }, (_, i) => `row ${i}`).join(',');
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

test('CSR: a list two arms down builds each row once on a reload', async () => {
	await render(DeepPage);
	await expect.poll(rows).toBe(upTo(3));
	press('[data-more]');
	await expect.poll(rows).toBe(upTo(4));
	press('[data-more]');
	await expect.poll(rows).toBe(upTo(5));
	expect(pageErrors).toEqual([]);
});

test('CSR: an inner arm\'s text and @if test over an outer computed follow a reload', async () => {
	await render(DeepPage);
	await expect.poll(() => text('[data-count]')).toBe('3');
	await expect.poll(() => text('[data-size]')).toBe('few');
	press('[data-more]');
	await expect.poll(() => text('[data-count]')).toBe('4');
	await expect.poll(() => text('[data-size]')).toBe('many');
	expect(pageErrors).toEqual([]);
});

test('CSR: a @try inside an inner arm shows its value and follows a reload', async () => {
	await render(DeepPage);
	await expect.poll(() => text('[data-sized]')).toBe('size 3');
	press('[data-more]');
	await expect.poll(() => text('[data-sized]')).toBe('size 4');
	expect(pageErrors).toEqual([]);
});
