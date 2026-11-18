import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CitySearch from './city-search.tsrx';
import { answerAt, calls, requested, resetCalls } from './gate.ts';
import { pause } from './pause.ts';
import { fakeClock, frames, listOf, type, until } from './support.ts';

// Passes through to the real helper and counts its calls; the runtime sets 300 ms timers of its own.
vi.mock('./pause.ts', async (load) => {
	const real = await load<typeof import('./pause.ts')>();
	return { pause: vi.fn(real.pause) };
});

afterEach(async () => {
	vi.useRealTimers();
	await cleanup();
});

const matches = () => listOf('section li');
const pauses = () => vi.mocked(pause).mock.calls.length;

function start() {
	vi.mocked(pause).mockClear();
	fakeClock();
}

/** Types `text`, waits until the page has started its 300 ms pause for it, then lets `ms` pass. */
async function typeAndWait(text: string, ms: number) {
	const before = pauses();
	type(text);
	await until(() => pauses() > before, true);
	await vi.advanceTimersByTimeAsync(ms);
}

async function asksOnceTypingPauses() {
	await typeAndWait('b', 100);
	await typeAndWait('bo', 100);
	await typeAndWait('bor', 250);
	expect(calls()).toEqual([]);
	await vi.advanceTimersByTimeAsync(50);
	await until(calls, ['bor:open']);
	answerAt(0);
	await until(matches, ['Bordeaux']);
}

test('CSR: typing asks once, 300 ms after the last key', async () => {
	resetCalls();
	start();
	await render(CitySearch);
	expect(matches()).toEqual([]);
	await asksOnceTypingPauses();
});

test('SSR: after resume, typing asks once, 300 ms after the last key', async () => {
	resetCalls();
	start();
	await renderSSR(CitySearch);
	expect(matches()).toEqual([]);
	await asksOnceTypingPauses();
});

async function lateAnswerNeverOverwrites(oldFirst: boolean) {
	resetCalls({ ignoreAbort: true });
	start();
	await render(CitySearch);
	await typeAndWait('bo', 300);
	await until(calls, ['bo:open']);
	await typeAndWait('bos', 300);
	await until(calls, ['bo:aborted', 'bos:open']);
	if (oldFirst) {
		answerAt(0);
		await frames();
		expect(matches()).toEqual([]);
		answerAt(1);
	} else {
		answerAt(1);
		await until(matches, ['Boston']);
		answerAt(0);
	}
	await until(matches, ['Boston']);
	await frames();
	expect(matches()).toEqual(['Boston']);
}

test('CSR: an older answer that lands after the newer one never overwrites it', async () => {
	await lateAnswerNeverOverwrites(false);
});

test('CSR: an older answer that lands first is dropped, and the newer one shows', async () => {
	await lateAnswerNeverOverwrites(true);
});

test('CSR: a key pressed while a request is out cancels it, and clearing the box shows no matches without asking', async () => {
	resetCalls();
	start();
	await render(CitySearch);
	await typeAndWait('bo', 300);
	await until(calls, ['bo:open']);
	type('');
	await until(calls, ['bo:aborted']);
	await vi.advanceTimersByTimeAsync(1_000);
	expect(requested('')).toBe(0);
	await until(matches, []);
});
