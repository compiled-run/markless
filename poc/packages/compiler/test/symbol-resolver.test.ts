import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { planSymbolResolver } from '../src/index.ts';

function valuesFor<T, K extends keyof T>(records: ReadonlyArray<T>, key: K): T[K][] {
	return records.map((record) => record[key]);
}

test('symbol-resolver fixture plans lazy symbols and generated resolver ownership', async () => {
	const fixturePath = 'fixtures/proofs/symbol-resolver/src/App.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	expect(source, 'authored fixture source must not contain dynamic import').not.toContain(
		'import(',
	);

	const artifact = await planSymbolResolver({
		filename: fixturePath,
		source,
	});

	expect(artifact.passId).toBe('symbol-resolver-planning');
	expect(artifact.filename).toBe(fixturePath);
	expect(artifact.generatedResolver).toEqual({
		ownsDynamicImport: true,
		importOwner: 'generated-symbol-resolver',
		authoredSourceContainsDynamicImport: false,
	});
	expect(artifact.domEventClosures).toEqual([]);

	expect(valuesFor(artifact.eventHandlerSymbols, 'eventName')).toEqual(
		expect.arrayContaining(['input', 'keydown', 'click', 'submit']),
	);
	expect(artifact.eventHandlerSymbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				eventName: 'input',
				kind: 'event-handler',
				lazy: true,
				emitsDomClosure: false,
				importOwner: 'generated-symbol-resolver',
			}),
			expect.objectContaining({
				eventName: 'keydown',
				kind: 'event-handler',
				lazy: true,
				emitsDomClosure: false,
				importOwner: 'generated-symbol-resolver',
			}),
			expect.objectContaining({
				eventName: 'submit',
				kind: 'event-handler',
				lazy: true,
				emitsDomClosure: false,
				importOwner: 'generated-symbol-resolver',
			}),
		]),
	);

	expect(artifact.bindingUpdateSymbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'binding-update',
				source: 'panel.query',
				bindingKind: 'attribute-or-property',
				importOwner: 'generated-symbol-resolver',
			}),
			expect.objectContaining({
				kind: 'binding-update',
				source: 'panel.open',
				bindingKind: 'attribute-or-property',
				importOwner: 'generated-symbol-resolver',
			}),
			expect.objectContaining({
				kind: 'binding-update',
				source: 'statusLabel',
				bindingKind: 'text',
				importOwner: 'generated-symbol-resolver',
			}),
			expect.objectContaining({
				kind: 'binding-update',
				source: 'details.title',
				bindingKind: 'text',
				importOwner: 'generated-symbol-resolver',
			}),
		]),
	);

	expect(artifact.behaviorSymbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'behavior',
				expression: 'resolverHostBehavior(behaviorConfig)',
				importOwner: 'generated-symbol-resolver',
			}),
			expect.objectContaining({
				kind: 'behavior',
				expression: expect.stringContaining('resolverHostBehavior({'),
				importOwner: 'generated-symbol-resolver',
			}),
		]),
	);

	expect(artifact.asyncRunnerSymbols).toEqual([
		expect.objectContaining({
			kind: 'async-computed-runner',
			name: 'details',
			importOwner: 'generated-symbol-resolver',
		}),
	]);

	const keydownHandler = artifact.eventHandlerSymbols.find(
		(symbol) => symbol.eventName === 'keydown',
	);
	const escapePolicy = artifact.syncPolicyRecords.find(
		(policy) =>
			policy.eventName === 'keydown' &&
			policy.guardSource.includes('panel.open') &&
			policy.guardSource.includes('event.key === "Escape"'),
	);

	expect(keydownHandler, 'keydown should have a lazy handler symbol').toBeDefined();
	expect(escapePolicy).toMatchObject({
		kind: 'inline-sync-policy',
		eventName: 'keydown',
		methods: ['preventDefault'],
		handlerSymbolId: keydownHandler?.symbolId,
		importOwner: 'inline-event-wiring',
	});
	expect(valuesFor(artifact.eventHandlerSymbols, 'symbolId')).not.toContain(
		escapePolicy?.policyId,
	);

	expect(artifact.failClosedCases).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'ARCADE_SYMBOL_UNKNOWN',
				stage: 'symbol-resolution',
				action: 'fail-closed',
			}),
			expect.objectContaining({
				code: 'ARCADE_SYMBOL_MANIFEST_MISMATCH',
				stage: 'symbol-resolution',
				action: 'fail-closed',
			}),
		]),
	);
});
