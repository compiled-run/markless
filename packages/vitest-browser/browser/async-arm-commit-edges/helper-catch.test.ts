import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { failNext } from './gated.ts';
import HelperCatch from './helper-catch.tsrx';
import HelperCatchTwice from './helper-catch-twice.tsrx';

// A same-file helper whose @catch reads the error settles by rendering its arm, with its ids qualified once.

afterEach(() => {
	failNext(0);
	cleanup();
});

const LOADS = { timeout: 5_000 };
const textOf = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? '';
const all = (selector: string) => [...document.querySelectorAll(selector)];
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();
const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : (event.error ?? event.message)));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

async function catchShowsTheErrorAndRecovers() {
	await expect.poll(() => textOf('[data-total]'), LOADS).toBe('40');
	const field = document.querySelector('[data-field]') as HTMLInputElement;
	field.focus();
	failNext();
	click('[data-again]');
	await expect.poll(() => textOf('[data-message]'), LOADS).toBe('rent failed in round 1');
	// A failed refresh keeps the value it showed and draws the @catch after it.
	expect(textOf('[data-total]')).toBe('40');
	expect(document.activeElement).toBe(field);
	click('[data-retry]');
	await expect.poll(() => textOf('[data-total]'), LOADS).toBe('41');
	expect(document.querySelector('[data-error]')).toBe(null);
	failNext();
	click('[data-again]');
	await expect.poll(() => textOf('[data-message]'), LOADS).toBe('rent failed in round 2');
	click('[data-again]');
	await expect.poll(() => textOf('[data-total]'), LOADS).toBe('43');
	expect(document.activeElement).toBe(field);
	expect(errors).toEqual([]);
}

test('CSR: a same-file helper whose @catch reads the error shows it and its reset retries', async () => {
	await render(HelperCatch);
	await catchShowsTheErrorAndRecovers();
});

test('SSR: a same-file helper whose @catch reads the error shows it and its reset retries after resume', async () => {
	await renderSSR(HelperCatch);
	await catchShowsTheErrorAndRecovers();
});

const readings = () => all('[data-reading]').map((node) => node.textContent?.trim());

async function eachInstanceSettlesOnItsOwn() {
	await expect.poll(readings, LOADS).toEqual(['gas: 30', 'water: 50']);
	failNext();
	click('[data-again]');
	await expect.poll(() => all('[data-problem]').length, LOADS).toBe(1);
	expect(textOf('[data-problem]')).toMatch(/^Error: (gas|water) failed in round 1$/);
	const failed = textOf('[data-problem]').includes('gas') ? 'gas: 30' : 'water: 50';
	await expect
		.poll(readings, LOADS)
		.toEqual(failed === 'gas: 30' ? ['gas: 30', 'water: 51'] : ['gas: 31', 'water: 50']);
	expect(all('[data-meter]')).toHaveLength(2);
	click('[data-again]');
	await expect.poll(readings, LOADS).toEqual(['gas: 32', 'water: 52']);
	expect(document.querySelector('[data-problem]')).toBe(null);
	expect(errors).toEqual([]);
}

test('CSR: two instances of a same-file helper whose @catch reads the error settle on their own', async () => {
	await render(HelperCatchTwice);
	await eachInstanceSettlesOnItsOwn();
});

test('SSR: two instances of a same-file helper whose @catch reads the error settle on their own after resume', async () => {
	await renderSSR(HelperCatchTwice);
	await eachInstanceSettlesOnItsOwn();
});
