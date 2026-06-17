import { expect, test } from 'vitest';
import { createRuntimeHardeningPoc } from '../src/index.ts';

function stagesFor(receipts: ReadonlyArray<{ readonly stage: string }>): string[] {
	return receipts.map((receipt) => receipt.stage);
}

test('runtime hardening handles async races, keyed ranges, cleanup, no rollback, and receipts', async () => {
	const runtime = createRuntimeHardeningPoc();

	const stale = runtime.requestPreview('alpha');
	const current = runtime.requestPreview('beta');

	await runtime.resolvePreview(current.requestId, {
		id: 'beta',
		title: 'Beta preview',
	});
	await runtime.resolvePreview(stale.requestId, {
		id: 'alpha',
		title: 'Stale alpha preview',
	});

	expect(runtime.preview()).toEqual({
		id: 'beta',
		title: 'Beta preview',
		version: current.version,
	});
	expect(runtime.receipts()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				stage: 'async-stale-ignore',
				details: expect.objectContaining({
					requestId: stale.requestId,
					requestVersion: stale.version,
					currentVersion: current.version,
				}),
			}),
		]),
	);

	const alphaIdentity = runtime.itemIdentity('alpha');
	runtime.moveBefore('beta', 'alpha');
	expect(runtime.itemIdentity('alpha')).toBe(alphaIdentity);
	expect(runtime.journal()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'moveRange',
				key: 'beta',
				beforeKey: 'alpha',
			}),
		]),
	);

	runtime.removeKey('alpha');
	runtime.removeKey('alpha');
	expect(runtime.cleanupCount('alpha')).toBe(1);
	expect(runtime.journal()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'runCleanup',
				key: 'alpha',
				count: 1,
			}),
			expect.objectContaining({
				kind: 'removeRange',
				key: 'alpha',
			}),
		]),
	);

	const error = runtime.commitThenThrow();
	expect(error).toMatchObject({
		code: 'ARCADE_RUNTIME_HANDLER_THROW',
		message: 'after committed graph writes',
		committedWritesPreserved: true,
	});
	expect(runtime.graph()).toMatchObject({
		committed: 1,
		message: 'committed-before-error',
		failNext: false,
	});
	expect(runtime.journal()).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'errorRecord',
				code: 'ARCADE_RUNTIME_HANDLER_THROW',
				committedWritesPreserved: true,
			}),
		]),
	);

	expect(stagesFor(runtime.receipts())).toEqual(
		expect.arrayContaining([
			'async-request',
			'async-commit',
			'async-stale-ignore',
			'keyed-move',
			'cleanup-run',
			'handler-error',
			'dom-journal-apply',
		]),
	);
	expect(runtime.receipts().every((receipt) => receipt.inspectable)).toBe(true);
	expect(runtime.constraints()).toEqual({
		usesHydration: false,
		usesVdom: false,
		productionBrowserResume: false,
	});
});
