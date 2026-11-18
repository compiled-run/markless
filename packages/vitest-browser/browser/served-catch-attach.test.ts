import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import { answer, requested, resetCalls } from './async-recipes/gate.ts';
import { fakeClock, until } from './async-recipes/support.ts';
import { Plain } from './served-catch-attach/plain.tsrx';
import { ResetTimer } from './served-catch-attach/reset-timer.tsrx';
import { cleanups, resetCleanups } from './served-catch-attach/service.ts';
import { WritesState } from './served-catch-attach/writes-state.tsrx';

// The server failed the load, so the page arrives with its @catch content; onIdle on the host starts its attach.
afterEach(async () => {
	vi.useRealTimers();
	await cleanup();
});

const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;

test('SSR: a plain attach in served @catch content runs at idle', async () => {
	await renderSSR(Plain);
	expect(text('[data-error]')).toBe('Waco is down.');
	await expect
		.poll(() => document.querySelector('[data-host]')?.getAttribute('data-runs'))
		.toBe('1');
});

test('SSR: an attach in served @catch content writes state the content shows', async () => {
	await renderSSR(WritesState);
	expect(text('[data-error]')).toBe('Dallas is down.');
	expect(text('[data-seen]')).toBe('0');
	await expect.poll(() => text('[data-seen]')).toBe('1');
});

test('SSR: reset from an attach timer in served @catch content loads again, and its cleanup runs when the content leaves', async () => {
	resetCalls();
	resetCleanups();
	fakeClock();
	const timers = vi.spyOn(globalThis, 'setTimeout');
	await renderSSR(ResetTimer);
	expect(text('[data-error]')).toBe('Austin is down.');
	expect(requested('Austin')).toBe(0);
	await until(() => timers.mock.calls.some(([, ms]) => ms === 1_000), true);
	await vi.advanceTimersByTimeAsync(1_000);
	await until(() => requested('Austin'), 1);
	answer('Austin');
	await until(() => text('[data-ok]'), 'Austin sky');
	expect(document.querySelector('[data-error]')).toBeNull();
	await until(cleanups, 1);
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('Austin')).toBe(1);
});
