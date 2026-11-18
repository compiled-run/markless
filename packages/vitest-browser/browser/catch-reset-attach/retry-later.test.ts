import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, requested, resetCalls } from '../async-recipes/gate.ts';
import { fakeClock, listOf, press, timeoutsOf, until } from '../async-recipes/support.ts';
import RetryLater from './retry-later.tsrx';

afterEach(async () => {
	vi.useRealTimers();
	await cleanup();
});

const down = { error: new Error('Service down.') };
const shown = () => listOf('section p').join(' | ');

test('CSR: reset called from an attach timer in @catch loads again', async () => {
	resetCalls();
	fakeClock();
	const retries = timeoutsOf(1_000);
	await render(RetryLater);
	await until(() => requested('Austin'), 1);
	answer('Austin', down);
	await until(shown, 'Service down.');
	await until(retries, 1);
	await vi.advanceTimersByTimeAsync(900);
	expect(requested('Austin')).toBe(1);
	await vi.advanceTimersByTimeAsync(100);
	await until(() => requested('Austin'), 2);
	answer('Austin');
	await until(shown, 'Austin sky');
});

test('CSR: the attach cleanup clears the timer when the @catch content leaves', async () => {
	resetCalls();
	fakeClock();
	const retries = timeoutsOf(1_000);
	await render(RetryLater);
	await until(() => requested('Austin'), 1);
	answer('Austin', down);
	await until(shown, 'Service down.');
	await until(retries, 1);
	await vi.advanceTimersByTimeAsync(1_000);
	await until(() => requested('Austin'), 2);
	answer('Austin', down);
	await until(shown, 'Service down.');
	press('Boston');
	await until(() => requested('Boston'), 1);
	answer('Boston');
	await until(shown, 'Boston sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect([requested('Austin'), requested('Boston')]).toEqual([2, 1]);
});

test('SSR: reset from an attach timer reloads after a refresh fails on the resumed page', async () => {
	resetCalls();
	fakeClock();
	const retries = timeoutsOf(1_000);
	await renderSSR(RetryLater);
	expect(shown()).toBe('Austin sky');
	press('Boston');
	await until(() => requested('Boston'), 1);
	answer('Boston', down);
	await until(shown, 'Austin sky | Service down.');
	await until(retries, 1);
	await vi.advanceTimersByTimeAsync(1_000);
	await until(() => requested('Boston'), 2);
	answer('Boston');
	await until(shown, 'Boston sky');
});
