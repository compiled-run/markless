import { afterEach, expect, test } from 'vitest';
import { resumeFromPayloadDocument } from '@markless/web/resume';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../../bundler/test-support/execution-expectations.ts';
import { cleanup, renderSSR } from '../src/index.ts';
import B909Fixture, {
	payloadRuntimeDemandMap as b909RuntimeDemandMap,
} from './fixtures/crazy-impl-b909-date-call.tsrx';
import {
	actionForElement,
	executedModules,
	readViewPayload,
	resetExecutedModules,
} from './support/progressive-helpers.ts';
afterEach(() => cleanup());
function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

function rejectionLog() {
	const values: unknown[] & { stop?: () => void } = [];
	const listener = (event: PromiseRejectionEvent) => {
		values.push(event.reason);
		event.preventDefault();
	};
	window.addEventListener('unhandledrejection', listener);
	values.stop = () => window.removeEventListener('unhandledrejection', listener);
	return values as unknown[] & { stop: () => void };
}

test('B909: tampered generic payload reports MARKLESS_PAYLOAD_INVALID, not NaN UI (3/3)', async () => {
	for (let run = 0; run < 3; run++) {
		const { container } = await renderSSR(B909Fixture);
		const state = required<HTMLScriptElement>(container, 'script[type="markless/state"]');
		const button = required<HTMLButtonElement>(container, 'button[data-b909-count]');
		const rejections = rejectionLog();
		state.textContent = JSON.stringify({ version: 1, cells: 'tampered' });
		button.click();
		await expect
			.poll(() => rejections[0])
			.toMatchObject({
				code: 'MARKLESS_PAYLOAD_INVALID',
				docsUrl: 'https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID',
			});
		expect(button.textContent).toBe('0');
		rejections.stop();
		await cleanup();
	}
});
test('B909: generic dispatch decodes Date state, finds DOM targets, and writes text (3/3)', async () => {
	for (let run = 0; run < 3; run++) {
		const { container } = await renderSSR(B909Fixture);
		const view = readViewPayload(container);
		const count = required<HTMLButtonElement>(container, 'button[data-b909-count]');
		const date = required<HTMLButtonElement>(container, 'button[data-b909-date]');
		const result = required<HTMLOutputElement>(container, 'output[data-b909-date-result]');
		expect(b909RuntimeDemandMap.recordKinds.every((kind) => kind.replaced === false)).toBe(true);
		expect(b909RuntimeDemandMap.actions.every((action) => action.plan === undefined)).toBe(true);

		resetExecutedModules();
		const countAction = actionForElement(container, count, 'click');
		count.click();
		await expect.poll(() => count.textContent).toBe('1');
		expect(
			forbiddenExecutedModules(
				executedModules(),
				deriveAllowedModules(view, b909RuntimeDemandMap, countAction),
			),
		).toEqual([]);
		for (const tier of [
			'web/event-only-resume',
			'web/event-only-lean/lean-shared',
			'web/event-only-lean/scalar-core',
			'web/event-only-lean/scalar-resume',
			'web/fns/scalar-specialized',
		]) {
			expect(executedModules()).not.toContain(tier);
		}

		resetExecutedModules();
		const dateAction = actionForElement(container, date, 'click');
		date.click();
		await expect.poll(() => Number(result.textContent)).toBeGreaterThan(0);
		expect(
			forbiddenExecutedModules(
				executedModules(),
				deriveAllowedModules(view, b909RuntimeDemandMap, dateAction),
			),
		).toEqual([]);
		await cleanup();
	}
});

test('B909: second full resume is a guarded no-op warning (3/3)', async () => {
	for (let run = 0; run < 3; run++) {
		const { container } = await renderSSR(B909Fixture);
		const root = required<HTMLElement>(container, '[data-async-container]');
		await resumeFromPayloadDocument({
			document: root,
			root,
			loadSymbol: () => () => undefined,
		});
		const second = await resumeFromPayloadDocument({
			document: root,
			root,
			loadSymbol: () => {
				throw new Error('second resume must not resolve symbols');
			},
		});
		expect(second.warnings?.[0]).toMatchObject({
			code: 'MARKLESS_RESUME_ALREADY_RESUMED',
			severity: 'warning',
			phase: 'resume',
		});
		await cleanup();
	}
});
