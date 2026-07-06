import { afterEach, expect, test } from 'vitest';
import {
	MODULE_GROUPS,
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import EventOnly from './fixtures/progressive-event-only.tsrx';
import {
	actionForElement,
	executedModules,
	readViewPayload,
	renderProgressiveSSR,
	requireElement,
	resetExecutedModules,
} from './support/progressive-helpers.ts';

afterEach(async () => {
	resetExecutedModules();
	await cleanup();
});

test('progressive execution: counter dispatch executes only the event dispatch core path', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(EventOnly));
	const container = screen.container;
	const button = requireElement<HTMLButtonElement>(container, 'button[data-counter-only]');
	const view = readViewPayload(container);
	const action = actionForElement(container, button, 'click');

	button.click();
	await expect.poll(() => button.textContent).toBe('Count 1');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	// Positive direction (dispatch-core actually executes) is asserted in the witness box
	// (boxes/ssr-preview.box.ts) where the page is fresh; in this harness the runtime
	// evaluates at test-module import, so only the forbidden direction is observable.
});
