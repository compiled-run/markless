import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import CatchText from './catch-text.tsrx';
import { answer, answerEvery, calls, requested, resetCalls } from './gate.ts';
import { press, settles, textOf } from './support.ts';
import TwoInputs from './two-inputs.tsrx';

// Runtime defects the recipes ran into. Each pin fails today; when a fix lands it passes, and `test.fails` turns it red so the pin is removed.
afterEach(cleanup);

test.fails('one click that writes two inputs while a run is in flight sends one request', async () => {
	resetCalls();
	await render(TwoInputs);
	await settles(() => requested('Austin C')).toBe(1);
	press('Both');
	await settles(() => requested('Denver F')).toBeGreaterThan(0);
	answerEvery('Denver F');
	await settles(() => textOf('section p')).toBe('Denver F sky');
	expect(calls()).toEqual(['Austin C:aborted', 'Denver F:done']);
});

test.fails('@catch text that mixes the error with state keeps its words when the state changes', async () => {
	resetCalls();
	await render(CatchText);
	await settles(() => requested('Austin')).toBe(1);
	answer('Austin', { error: new Error('Service down.') });
	await settles(() => textOf('section p')).toBe('Service down. Attempt 1 of 4.');
	press('Next');
	await settles(() => textOf('section p')).toBe('Service down. Attempt 2 of 4.');
});
