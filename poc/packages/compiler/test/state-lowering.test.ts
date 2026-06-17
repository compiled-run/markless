import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateLvalues } from '../src/index.ts';

type ExpectedOperation = {
	readonly sourceTarget: string;
	readonly target: string;
	readonly operation: 'assign' | 'update' | 'call';
	readonly method?: string;
	readonly effect: 'scalar-cell' | 'object-path' | 'collection-mutation';
};

type ExpectedDiagnostic = {
	readonly code: string;
	readonly sourceTarget: string;
	readonly statePath?: string;
};

function expectOperation(
	operations: ReadonlyArray<ExpectedOperation>,
	expected: ExpectedOperation,
): void {
	expect(
		operations.some(
			(operation) =>
				operation.sourceTarget === expected.sourceTarget &&
				operation.target === expected.target &&
				operation.operation === expected.operation &&
				operation.method === expected.method &&
				operation.effect === expected.effect,
		),
		`lowered operations should include ${expected.operation} ${expected.sourceTarget} -> ${expected.target}${
			expected.method ? ` via ${expected.method}` : ''
		}`,
	).toBe(true);
}

function expectDiagnostic(
	diagnostics: ReadonlyArray<{
		readonly artifactKeys?: ReadonlyArray<string>;
		readonly code: string;
		readonly docsUrl: string;
		readonly passId?: string;
		readonly phase: string;
		readonly primarySpan?: { readonly start: number; readonly end: number };
		readonly severity: string;
		readonly statePath?: string;
		readonly suggestions?: ReadonlyArray<unknown>;
	}>,
	expected: ExpectedDiagnostic,
): void {
	const diagnostic = diagnostics.find(
		(candidate) =>
			candidate.code === expected.code &&
			candidate.artifactKeys?.includes(`write:${expected.sourceTarget}`),
	);

	expect(
		diagnostic,
		`diagnostics should include ${expected.code} for ${expected.sourceTarget}`,
	).toBeDefined();
	expect(diagnostic).toMatchObject({
		code: expected.code,
		severity: 'error',
		phase: 'state-lowering',
		passId: 'state-lowering',
		docsUrl: `https://arcadejs.com/errors/${expected.code}`,
	});
	expect(diagnostic?.primarySpan?.start).toEqual(expect.any(Number));
	expect(diagnostic?.primarySpan?.end).toEqual(expect.any(Number));
	expect(diagnostic?.suggestions?.length).toBeGreaterThan(0);

	if (expected.statePath) {
		expect(diagnostic?.statePath).toBe(expected.statePath);
	}
}

test('state-lvalues lowering preserves supported valid write operations', async () => {
	const fixturePath = 'fixtures/proofs/state-lvalues/src/valid.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});
	const artifact = lowerStateLvalues(graph);

	expect(artifact.passId).toBe('state-lowering');
	expect(artifact.filename).toBe(fixturePath);
	expect(artifact.diagnostics).toEqual([]);

	expectOperation(artifact.operations, {
		sourceTarget: 'count',
		target: 'count',
		operation: 'update',
		effect: 'scalar-cell',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'count',
		target: 'count',
		operation: 'assign',
		effect: 'scalar-cell',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.x',
		target: 'obj.x',
		operation: 'assign',
		effect: 'object-path',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.nested.title',
		target: 'obj.nested.title',
		operation: 'assign',
		effect: 'object-path',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'nested.title',
		target: 'obj.nested.title',
		operation: 'assign',
		effect: 'object-path',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.nested.meta.saves',
		target: 'obj.nested.meta.saves',
		operation: 'update',
		effect: 'object-path',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.tags.0',
		target: 'obj.tags[0]',
		operation: 'assign',
		effect: 'object-path',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.items',
		target: 'obj.items',
		operation: 'call',
		method: 'push',
		effect: 'collection-mutation',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.items',
		target: 'obj.items',
		operation: 'call',
		method: 'splice',
		effect: 'collection-mutation',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.items.index.done',
		target: 'obj.items[index].done',
		operation: 'assign',
		effect: 'object-path',
	});
	expectOperation(artifact.operations, {
		sourceTarget: 'obj.items.index.meta.edits',
		target: 'obj.items[index].meta.edits',
		operation: 'update',
		effect: 'object-path',
	});

	const splice = artifact.operations.find(
		(operation) =>
			operation.target === 'obj.items' &&
			operation.operation === 'call' &&
			operation.method === 'splice',
	);
	expect(splice?.invalidates).toEqual(
		expect.arrayContaining(['obj.items', 'obj.items.length', 'obj.items.*']),
	);
});

test('state-lvalues lowering emits structured diagnostics for invalid writes', async () => {
	const fixturePath = 'fixtures/proofs/state-lvalues/src/diagnostics.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});
	const artifact = lowerStateLvalues(graph);

	expect(artifact.passId).toBe('state-lowering');
	expect(artifact.filename).toBe(fixturePath);
	expectOperation(artifact.operations, {
		sourceTarget: 'count',
		target: 'count',
		operation: 'update',
		effect: 'scalar-cell',
	});

	for (const sourceTarget of [
		'doubled',
		'computedAlias',
		'props.count',
		'propCount',
		'settings.x',
		'settings.nested.title',
		'items',
		'xAlias',
		'dynamicAlias',
		'firstItem',
	]) {
		expect(
			artifact.operations.some((operation) => operation.sourceTarget === sourceTarget),
			`invalid write ${sourceTarget} should not lower to an operation`,
		).toBe(false);
	}

	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_COMPUTED_READONLY',
		sourceTarget: 'doubled',
		statePath: 'doubled',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_COMPUTED_READONLY',
		sourceTarget: 'computedAlias',
		statePath: 'doubled',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_PROPS_READONLY',
		sourceTarget: 'props.count',
		statePath: 'props.count',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_PROPS_READONLY',
		sourceTarget: 'propCount',
		statePath: 'props.count',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_PROPS_READONLY',
		sourceTarget: 'settings.x',
		statePath: 'props.settings.x',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_PROPS_READONLY',
		sourceTarget: 'settings.nested.title',
		statePath: 'props.settings.nested.title',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_PROPS_READONLY',
		sourceTarget: 'items',
		statePath: 'props.items',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_ALIAS_AMBIGUOUS_WRITE',
		sourceTarget: 'xAlias',
		statePath: 'obj.x',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_ALIAS_AMBIGUOUS_WRITE',
		sourceTarget: 'dynamicAlias',
	});
	expectDiagnostic(artifact.diagnostics, {
		code: 'ARCADE_STATE_ALIAS_LOCAL_COPY',
		sourceTarget: 'firstItem',
		statePath: 'obj.items.*',
	});
});
