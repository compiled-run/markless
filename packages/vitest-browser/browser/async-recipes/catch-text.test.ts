import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import CatchText from './catch-text.tsrx';
import { answer, requested, resetCalls } from './gate.ts';
import { press, settles, textOf } from './support.ts';

afterEach(cleanup);

test('@catch text that mixes the error with state keeps its words when the state changes', async () => {
	resetCalls();
	await render(CatchText);
	await settles(() => requested('Austin')).toBe(1);
	answer('Austin', { error: new Error('Service down.') });
	await settles(() => textOf('section p')).toBe('Service down. Attempt 1 of 4.');
	const shown = document.querySelector('section p');
	press('Next');
	await settles(() => textOf('section p')).toBe('Service down. Attempt 2 of 4.');
	expect(document.querySelector('section p')).toBe(shown);
});
