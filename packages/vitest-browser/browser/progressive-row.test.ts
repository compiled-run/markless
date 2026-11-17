import { afterEach, expect, test } from 'vitest';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSRPhased } from '../src/index.ts';
import RowQualifying, {
	payloadRuntimeDemandMap as rowQualifyingRuntimeDemandMap,
} from './fixtures/progressive-row-qualifying.tsrx';
import RowIncrement, {
	payloadRuntimeDemandMap as rowIncrementRuntimeDemandMap,
} from './fixtures/progressive-row-increment.tsrx';
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

test('progressive execution: qualifying row dispatch uses generic keyed-repeat records', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(RowQualifying));
	const container = screen.container;
	const view = readViewPayload(container);
	const rowButton = requireElement<HTMLButtonElement>(container, 'article[data-row] button');
	const rowAction = actionForKeyedRepeat(container, rowButton, 'click');

	rowButton.click();
	await expect
		.poll(() => requireElement<HTMLOutputElement>(container, 'output[data-choice]').textContent)
		.toBe('north');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, rowQualifyingRuntimeDemandMap, rowAction);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(
		rowQualifyingRuntimeDemandMap.actions.find(
			(action) => action.recordKind === 'keyed-repeat-row',
		)?.plan,
	).toBeUndefined();
	expect(executed).not.toContain('web/event-only-lean/row');
	expect(executed).not.toContain('web/event-only-lean/lean-shared');
	expect(executed).not.toContain('web/event-only-lean/scalar-core');
	expect(executed).not.toContain('web/event-only-lean/scalar-resume');
	expect(executed).toContain('web/resume-keyed-repeats');
	expect(executed).toContain('web/resume-runtime');
	expect(executed).not.toContain('web/resume-async-boundaries');
	expect(executed).not.toContain('web/resume-branches');
	expect(executed).not.toContain('web/resume-behaviors');
	expect(executed).not.toContain('web/event-only-behaviors');
});

test('progressive execution: repeated row updates preserve warm state on generic records', async () => {
	const screen = await renderProgressiveSSR(renderSSRPhased(RowIncrement));
	const container = screen.container;
	const view = readViewPayload(container);
	const rowButton = requireElement<HTMLButtonElement>(
		container,
		'article[data-row] button[data-row-increment]',
	);
	const rowAction = actionForKeyedRepeat(container, rowButton, 'click');
	const picks = requireElement<HTMLOutputElement>(container, 'output[data-picks]');

	rowButton.click();
	await expect.poll(() => picks.textContent).toBe('Picks 1');
	rowButton.click();
	await expect.poll(() => picks.textContent).toBe('Picks 2');

	const executed = executedModules();
	const allowed = deriveAllowedModules(view, rowIncrementRuntimeDemandMap, rowAction);
	expect(forbiddenExecutedModules(executed, allowed)).toEqual([]);
	expect(
		rowIncrementRuntimeDemandMap.actions.find(
			(action) => action.recordKind === 'keyed-repeat-row',
		)?.plan,
	).toBeUndefined();
	expect(executed).not.toContain('web/event-only-lean/row');
	expect(executed).not.toContain('web/event-only-lean/lean-shared');
	expect(executed).not.toContain('web/event-only-lean/scalar-core');
	expect(executed).not.toContain('web/resume-branches');
});
