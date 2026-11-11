import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, answerEvery, requested, resetCalls } from './gate.ts';
import Backoff from './backoff.tsrx';
import { pause } from './pause.ts';
import { fakeClock, listOf, press, until } from './support.ts';

// Passes through to the real helper and counts its calls, so a test knows the back-off has started.
vi.mock('./pause.ts', async (load) => {
	const real = await load<typeof import('./pause.ts')>();
	return { pause: vi.fn(real.pause) };
});

/** Counts the pauses of `ms` the page starts from now on. */
function pausesOf(ms: number): () => number {
	const count = () => vi.mocked(pause).mock.calls.filter(([wait]) => wait === ms).length;
	const before = count();
	return () => count() - before;
}

afterEach(async () => {
	vi.useRealTimers();
	await cleanup();
});

const shown = () => listOf('section p').join(' | ');
const down = { error: new Error('Service down.') };

/** Fails the open request for `city`; the page shows the next attempt and waits `ms` before asking again. */
async function failsAndBacksOff(city: string, attempt: number, ms: number) {
	const asked = requested(city);
	const paused = pausesOf(ms);
	answer(city, down);
	await until(shown, `Service down. | Attempt ${attempt} of 4`);
	await until(paused, 1);
	await vi.advanceTimersByTimeAsync(ms - 200);
	expect(requested(city)).toBe(asked);
	await vi.advanceTimersByTimeAsync(200);
	await until(() => requested(city), asked + 1);
}

async function firstLoad() {
	resetCalls();
	fakeClock();
	await render(Backoff);
	await until(() => requested('Austin'), 1);
}

test('CSR: a failed load is tried again after 1 s, 2 s and 4 s, showing the attempt, and stops after attempt 4', async () => {
	await firstLoad();
	await failsAndBacksOff('Austin', 2, 1_000);
	await failsAndBacksOff('Austin', 3, 2_000);
	await failsAndBacksOff('Austin', 4, 4_000);
	answer('Austin', down);
	await until(shown, 'Service down. | Attempt 4 of 4');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(4);
});

test('CSR: a retry that succeeds shows the answer and stops retrying', async () => {
	await firstLoad();
	await failsAndBacksOff('Austin', 2, 1_000);
	answer('Austin');
	await until(shown, 'Austin sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(2);
});

// Picking Boston writes both `city` and `attempt`, which today sends Boston twice (pinned in known-defects.test.ts).
async function newPickCancelsTheWaitingRetry(paused: () => number) {
	await until(shown, 'Service down. | Attempt 2 of 4');
	await until(paused, 1);
	await vi.advanceTimersByTimeAsync(500);
	const austin = requested('Austin');
	press('Boston');
	await until(() => requested('Boston') > 0, true);
	await until(shown, 'Service down. | Attempt 1 of 4');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(austin);
	answerEvery('Boston');
	await until(shown, 'Boston sky');
	const boston = requested('Boston');
	await vi.advanceTimersByTimeAsync(20_000);
	expect([requested('Austin'), requested('Boston')]).toEqual([austin, boston]);
}

test('CSR: picking a new city during the back-off cancels the waiting retry and starts over at attempt 1', async () => {
	await firstLoad();
	const paused = pausesOf(1_000);
	answer('Austin', down);
	await newPickCancelsTheWaitingRetry(paused);
});

test('CSR: a new pick while the retried request is out cancels it too', async () => {
	await firstLoad();
	await failsAndBacksOff('Austin', 2, 1_000);
	press('Boston');
	await until(() => requested('Boston') > 0, true);
	answer('Austin');
	answerEvery('Boston');
	await until(shown, 'Boston sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(2);
	expect(shown()).toBe('Boston sky');
});

test('SSR: a refresh that fails after resume backs off and retries, keeping the attempt in state', async () => {
	resetCalls();
	fakeClock();
	await renderSSR(Backoff);
	expect(shown()).toBe('Austin sky');
	press('Boston');
	await until(() => requested('Boston'), 1);
	const paused = pausesOf(1_000);
	answer('Boston', down);
	await until(shown, 'Austin sky | Service down. | Attempt 2 of 4');
	await until(paused, 1);
	await vi.advanceTimersByTimeAsync(800);
	expect(requested('Boston')).toBe(1);
	await vi.advanceTimersByTimeAsync(200);
	await until(() => requested('Boston'), 2);
	answer('Boston');
	await until(shown, 'Boston sky');
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Boston')).toBe(2);
});
