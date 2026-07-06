import { afterEach, expect, test } from 'vitest';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import RowMixed, {
	payloadRuntimeDemandMap as rowMixedRuntimeDemandMap,
} from './fixtures/progressive-row-mixed.tsrx';
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

test('progressive execution: qualifying row dispatch stays on the lean keyed-repeat path', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(RowMixed));
	const container = screen.container;
	const view = readViewPayload(container);
	const rowButton = requireElement<HTMLButtonElement>(container, 'article[data-mixed-row] button');
	const rowAction = actionForKeyedRepeat(container, rowButton, 'click');

	rowButton.click();
	await expect.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-mixed-choice]').textContent)
		.toBe('north');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, rowMixedRuntimeDemandMap, rowAction);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(executed).toContain('web/event-only-lean/row');
	expect(executed).not.toContain('web/event-only-lean/scalar-core');
	expect(executed).not.toContain('web/event-only-lean/scalar-resume');
	expect(executed).toContain('web/resume-keyed-repeats');
	expect(executed).not.toContain('web/resume-async-boundaries');
	expect(executed).not.toContain('web/resume-branches');
	expect(executed).not.toContain('web/resume-behaviors');
	expect(executed).not.toContain('web/event-only-behaviors');
});
