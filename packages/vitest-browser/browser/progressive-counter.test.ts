import { afterEach, expect, test } from 'vitest';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import AlternateScalar, {
	payloadRuntimeDemandMap as alternateScalarRuntimeDemandMap,
} from './fixtures/progressive-alternate-scalar.tsrx';
import EventOnly, {
	payloadRuntimeDemandMap as eventOnlyRuntimeDemandMap,
} from './fixtures/progressive-event-only.tsrx';
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
	button.click();
	await expect.poll(() => button.textContent).toBe('Count 2');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, eventOnlyRuntimeDemandMap, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	// Positive direction (dispatch-core actually executes) is asserted in the witness box
	// (boxes/ssr-preview.box.ts) where the page is fresh; in this harness the runtime
	// evaluates at test-module import, so only the forbidden direction is observable.
});

test('progressive execution: alternate scalar keydown updates prefixed text through generic dispatch', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(AlternateScalar));
	const container = screen.container;
	const input = requireElement<HTMLInputElement>(container, 'input[data-anything]');
	const output = requireElement<HTMLOutputElement>(container, 'output[data-alternate-total]');
	const view = readViewPayload(container);
	const action = actionForElement(container, input, 'keydown');

	expect(output.textContent).toBe('Total: 4');
	input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
	await expect.poll(() => output.textContent).toBe('Total: 5');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, alternateScalarRuntimeDemandMap, action);
	console.info(`[alternate-scalar-executed] ${executed.join(',')}`);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
});
