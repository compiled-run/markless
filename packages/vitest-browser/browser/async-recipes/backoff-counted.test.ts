import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { answer, requested, resetCalls } from './gate.ts';
import BackoffCounted from './backoff-counted.tsrx';
import { fakeClock, listOf, press, until } from './support.ts';

// The Async page's way to say how many tries failed: the count rides the error the loop throws, so @catch shows it.
afterEach(async () => {
	vi.useRealTimers();
	await cleanup();
});

const shown = () => listOf('section p').join(' | ');
const down = { error: new Error('Service down.') };

async function failsAndWaits(city: string, ms: number) {
	const asked = requested(city);
	answer(city, down);
	await vi.advanceTimersByTimeAsync(ms);
	await until(() => requested(city), asked + 1);
}

async function firstLoad() {
	resetCalls();
	fakeClock();
	await render(BackoffCounted);
	await until(() => requested('Austin'), 1);
}

test('CSR: the error shown after the last try says how many tries failed', async () => {
	await firstLoad();
	await failsAndWaits('Austin', 1_000);
	expect(shown()).toBe('Checking the sky');
	await failsAndWaits('Austin', 2_000);
	expect(shown()).toBe('Checking the sky');
	answer('Austin', down);
	await until(shown, 'Tried 3 times. Service down.');
	press('Try again');
	await until(() => requested('Austin'), 4);
	answer('Austin');
	await until(shown, 'Austin sky');
});

test('CSR: a new city during the wait drops the old loop without a count error', async () => {
	await firstLoad();
	answer('Austin', down);
	await vi.advanceTimersByTimeAsync(500);
	press('Boston');
	await until(() => requested('Boston'), 1);
	answer('Boston');
	await until(shown, 'Boston sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(shown()).toBe('Boston sky');
	expect([requested('Austin'), requested('Boston')]).toEqual([1, 1]);
});
