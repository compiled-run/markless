import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, calls, requested, resetCalls } from './gate.ts';
import Timeout from './timeout.tsrx';
import { press, settles, textOf } from './support.ts';

afterEach(async () => {
	vi.restoreAllMocks();
	await cleanup();
});

/** Replaces `AbortSignal.timeout` with signals the test fires by hand, in the order the page made them. */
function gatedTimeouts() {
	const made: { readonly ms: number; readonly fire: () => void }[] = [];
	vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
		const controller = new AbortController();
		made.push({
			ms,
			fire: () => controller.abort(new DOMException('signal timed out', 'TimeoutError')),
		});
		return controller.signal;
	});
	return made;
}

const shown = () => textOf('section p');

test('CSR: a request that runs past its limit is aborted and its timeout reaches @catch', async () => {
	resetCalls();
	const limits = gatedTimeouts();
	await render(Timeout);
	await settles(() => requested('Austin')).toBe(1);
	expect(limits.map((limit) => limit.ms)).toEqual([3000]);
	limits[0]!.fire();
	await settles(shown).toBe('The forecast took too long.');
	expect(calls()).toEqual(['Austin:aborted']);
});

test('CSR: an answer inside the limit shows, and the limit firing later changes nothing', async () => {
	resetCalls();
	const limits = gatedTimeouts();
	await render(Timeout);
	await settles(() => requested('Austin')).toBe(1);
	answer('Austin');
	await settles(shown).toBe('Austin sky');
	limits[0]!.fire();
	await settles(() => calls()).toEqual(['Austin:done']);
	expect(shown()).toBe('Austin sky');
});


test('CSR: an older run timing out after a newer run started never reaches @catch', async () => {
	resetCalls();
	const limits = gatedTimeouts();
	await render(Timeout);
	await settles(() => requested('Austin')).toBe(1);
	press('Boston');
	await settles(() => requested('Boston')).toBe(1);
	expect(calls()).toEqual(['Austin:aborted', 'Boston:open']);
	limits[0]!.fire();
	answer('Boston');
	await settles(shown).toBe('Boston sky');
	expect(document.body.textContent).not.toContain('took too long');
	limits[1]!.fire();
	expect(calls()).toEqual(['Austin:aborted', 'Boston:done']);
	expect(shown()).toBe('Boston sky');
});

test('SSR: after resume, a refresh that times out keeps the last answer and shows the timeout after it', async () => {
	resetCalls();
	const limits = gatedTimeouts();
	await renderSSR(Timeout);
	expect(shown()).toBe('Austin sky');
	press('Boston');
	await settles(() => requested('Boston')).toBe(1);
	expect(limits.map((limit) => limit.ms)).toEqual([3000]);
	limits[0]!.fire();
	await settles(() => [...document.querySelectorAll('section p')].map((p) => p.textContent?.trim())).toEqual([
		'Austin sky',
		'The forecast took too long.',
	]);
	expect(calls()).toEqual(['Boston:aborted']);
});
