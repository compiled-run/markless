import { afterEach, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import CatchText from './catch-text.tsrx';
import { answer, requested, resetCalls } from './gate.ts';
import { press, settles, textOf } from './support.ts';

// Runtime defects the recipes ran into. Each pin fails today; when a fix lands it passes, and `test.fails` turns it red so the pin is removed.
afterEach(cleanup);

test.fails('@catch text that mixes the error with state keeps its words when the state changes', async () => {
	resetCalls();
	await render(CatchText);
	await settles(() => requested('Austin')).toBe(1);
	answer('Austin', { error: new Error('Service down.') });
	await settles(() => textOf('section p')).toBe('Service down. Attempt 1 of 4.');
	press('Next');
	await settles(() => textOf('section p')).toBe('Service down. Attempt 2 of 4.');
});
