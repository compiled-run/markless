import { afterEach, expect, test } from 'vitest';
import {
	MODULE_GROUPS,
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import RowMixed from './fixtures/progressive-row-mixed.tsrx';
import {
	actionForKeyedRepeat,
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

test('progressive execution: row dispatch allows declared branch wiring without async or behavior modules', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(RowMixed));
	const container = screen.container;
	const view = readViewPayload(container);
	const rowButton = requireElement<HTMLButtonElement>(container, 'article[data-mixed-row] button');
	const rowAction = actionForKeyedRepeat(container, rowButton, 'click');

	rowButton.click();
	await expect.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-mixed-choice]').textContent)
		.toBe('north');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, rowAction);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed.some((id) => MODULE_GROUPS['keyed-repeat'].has(id))).toBe(true);
	expect(executed.some((id) => MODULE_GROUPS['async-boundary'].has(id))).toBe(false);
	// PM ruling, spec 06 gate 2: declared branch records wire eagerly; async and
	// behavior capability groups remain demand-gated.
	expect(executed.some((id) => MODULE_GROUPS.branch.has(id))).toBe(true);
	expect(executed.some((id) => MODULE_GROUPS.behavior.has(id))).toBe(false);
});
