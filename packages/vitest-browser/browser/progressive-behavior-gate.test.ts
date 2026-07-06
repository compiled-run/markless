import { afterEach, expect, test } from 'vitest';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import PlainVsBehavior from './fixtures/progressive-plain-vs-behavior.tsrx';
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

test('progressive execution: clicking a plain button never executes behavior modules', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(PlainVsBehavior));
	const container = screen.container;
	const plain = requireElement<HTMLButtonElement>(container, 'button[data-plain-action]');
	const view = readViewPayload(container);
	const action = actionForElement(container, plain, 'click');

	plain.click();
	await expect.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-plain-label]').textContent)
		.toBe('plain');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, action);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed).not.toContain('web/resume-behaviors');
	expect(executed).not.toContain('web/event-only-behaviors');
});
