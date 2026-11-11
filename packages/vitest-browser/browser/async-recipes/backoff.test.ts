import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, calls, requested, resetCalls } from './gate.ts';
import Backoff from './backoff.tsrx';
import { fakeClock, listOf, press, until } from './support.ts';

afterEach(async () => {
	vi.useRealTimers();
	await cleanup();
});

const shown = () => listOf('section p').join(' | ');
const down = { error: new Error('Service down.') };

/** Counts every time the error text is put on the page from now on, so a flash between tries is seen. */
function watchErrors() {
	let seen = 0;
	const count = () => document.body.textContent?.includes('Service down.') ?? false;
	let showing = count();
	const observer = new MutationObserver(() => {
		const now = count();
		if (now && !showing) seen++;
		showing = now;
	});
	observer.observe(document.body, { subtree: true, childList: true, characterData: true });
	return () => {
		observer.disconnect();
		return seen;
	};
}

/** Fails the open request for `city`; the next try is asked only after `ms`. */
async function failsAndWaits(city: string, ms: number) {
	const asked = requested(city);
	answer(city, down);
	await vi.advanceTimersByTimeAsync(ms - 100);
	expect(requested(city)).toBe(asked);
	await vi.advanceTimersByTimeAsync(100);
	await until(() => requested(city), asked + 1);
}

async function firstLoad() {
	resetCalls();
	fakeClock();
	await render(Backoff);
	await until(() => requested('Austin'), 1);
}

test('CSR: three failed tries show one error, after waits of 1 s and 2 s, and then stop', async () => {
	await firstLoad();
	const errors = watchErrors();
	await failsAndWaits('Austin', 1_000);
	expect(shown()).toBe('Checking the sky');
	await failsAndWaits('Austin', 2_000);
	expect(shown()).toBe('Checking the sky');
	answer('Austin', down);
	await until(shown, 'Service down.');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(3);
	expect(errors()).toBe(1);
});

test('CSR: a second try that succeeds shows the forecast with no error in between', async () => {
	await firstLoad();
	const errors = watchErrors();
	await failsAndWaits('Austin', 1_000);
	answer('Austin');
	await until(shown, 'Austin sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(2);
	expect(errors()).toBe(0);
});

test('CSR: a new city during the wait abandons the old loop', async () => {
	await firstLoad();
	answer('Austin', down);
	await vi.advanceTimersByTimeAsync(500);
	press('Boston');
	await until(() => requested('Boston'), 1);
	answer('Boston');
	await until(shown, 'Boston sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect([requested('Austin'), requested('Boston')]).toEqual([1, 1]);
});

test('CSR: a new city while a retried request is out cancels that request and its loop', async () => {
	await firstLoad();
	await failsAndWaits('Austin', 1_000);
	press('Boston');
	await until(() => requested('Boston'), 1);
	expect(calls()).toEqual(['Austin:done', 'Austin:aborted', 'Boston:open']);
	answer('Boston');
	await until(shown, 'Boston sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect([requested('Austin'), requested('Boston')]).toEqual([2, 1]);
});

test('CSR: Try again after giving up runs a fresh loop of three tries', async () => {
	await firstLoad();
	await failsAndWaits('Austin', 1_000);
	await failsAndWaits('Austin', 2_000);
	answer('Austin', down);
	await until(shown, 'Service down.');
	press('Try again');
	await until(() => requested('Austin'), 4);
	await failsAndWaits('Austin', 1_000);
	answer('Austin');
	await until(shown, 'Austin sky');
	expect(requested('Austin')).toBe(5);
});

test('SSR: a refresh on the resumed page retries quietly and shows the new forecast', async () => {
	resetCalls();
	fakeClock();
	await renderSSR(Backoff);
	expect(shown()).toBe('Austin sky');
	const errors = watchErrors();
	press('Boston');
	await until(() => requested('Boston'), 1);
	await failsAndWaits('Boston', 1_000);
	expect(shown()).toBe('Austin sky');
	answer('Boston');
	await until(shown, 'Boston sky');
	expect(errors()).toBe(0);
});
