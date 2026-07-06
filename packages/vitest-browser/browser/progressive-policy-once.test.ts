import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import EventOnly from './fixtures/progressive-event-only.tsrx';
import {
	dispatchSubmit,
	renderProgressiveSSR,
	requireElement,
	resetExecutedModules,
} from './support/progressive-helpers.ts';

afterEach(async () => {
	resetExecutedModules();
	await cleanup();
});

test('progressive execution: event-only preventDefault is applied exactly once per dispatch', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(EventOnly));
	const form = requireElement<HTMLFormElement>(screen.container, 'form[data-event-form]');

	const calls = dispatchSubmit(form);
	await expect.poll(() => requireElement<HTMLButtonElement>(screen.container, 'button[data-submit-count]').textContent)
		.toContain('1');
	expect(calls()).toBe(1);
});
