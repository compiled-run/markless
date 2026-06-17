import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { planSerializerValues } from '../src/index.ts';

const fixturePath = 'fixtures/proofs/serializer-values/src/App.tsrx';

type SerializerArtifact = Awaited<ReturnType<typeof planSerializerValues>>;

async function fixtureArtifact(): Promise<SerializerArtifact> {
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');

	return planSerializerValues({
		filename: fixturePath,
		source,
	});
}

function classification(
	artifact: SerializerArtifact,
	statePath: string,
): SerializerArtifact['classifications'][number] {
	const record = artifact.classifications.find((candidate) => candidate.statePath === statePath);
	expect(record, `classification for ${statePath}`).toBeDefined();
	return record!;
}

function diagnostic(
	artifact: SerializerArtifact,
	statePath: string,
	code: string,
): SerializerArtifact['diagnostics'][number] {
	const record = artifact.diagnostics.find(
		(candidate) => candidate.statePath === statePath && candidate.code === code,
	);
	expect(record, `diagnostic ${code} for ${statePath}`).toBeDefined();
	return record!;
}

test('serializer-values fixture classifies serializable tiers and built-ins', async () => {
	const artifact = await fixtureArtifact();

	expect(artifact.passId).toBe('serializer-values-planning');
	expect(artifact.filename).toBe(fixturePath);
	expect(artifact.payloadShape).toEqual({
		kind: 'logical-state-arena',
		finalJson: false,
		browserResume: false,
	});
	expect(artifact).not.toHaveProperty('payloadJson');

	expect(classification(artifact, 'stateArena.primitives.name')).toMatchObject({
		tier: 'built-in',
		valueKind: 'string',
	});
	expect(classification(artifact, 'stateArena.plainArray')).toMatchObject({
		tier: 'built-in',
		valueKind: 'array',
	});
	expect(classification(artifact, 'stateArena.identity.primary')).toMatchObject({
		tier: 'built-in',
		valueKind: 'plain-object',
		identitySource: 'sharedContact',
	});
	expect(classification(artifact, 'panel')).toMatchObject({
		tier: 'framework-graph',
		valueKind: 'element-handle',
		serializesAs: 'dom-locator',
	});
	expect(classification(artifact, 'derivedSummary')).toMatchObject({
		tier: 'recreated',
		valueKind: 'computed',
		serializesAs: 'dependency-record',
	});
	expect(artifact.behaviorRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				tier: 'dom-resource-behavior',
				behavior: 'serializerBehavior',
				serializesResult: false,
				inputPaths: expect.arrayContaining([
					'stateArena.identity.primary.id',
					'derivedSummary.byteLength',
				]),
			}),
		]),
	);

	expect(artifact.builtins).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				statePath: 'stateArena.builtins.createdAt',
				builtin: 'Date',
			}),
			expect.objectContaining({
				statePath: 'stateArena.builtins.matcher',
				builtin: 'RegExp',
			}),
			expect.objectContaining({ statePath: 'stateArena.builtins.endpoint', builtin: 'URL' }),
			expect.objectContaining({ statePath: 'stateArena.builtins.amount', builtin: 'BigInt' }),
			expect.objectContaining({
				statePath: 'stateArena.builtins.bytes',
				builtin: 'Uint8Array',
			}),
			expect.objectContaining({
				statePath: 'stateArena.builtins.buffer',
				builtin: 'ArrayBuffer',
			}),
			expect.objectContaining({
				statePath: 'stateArena.collections.contactMap',
				builtin: 'Map',
			}),
			expect.objectContaining({ statePath: 'stateArena.collections.tagSet', builtin: 'Set' }),
		]),
	);
});

test('serializer-values fixture plans identity, cycles, and class restore shape', async () => {
	const artifact = await fixtureArtifact();

	const sharedContact = artifact.identityPlans.find(
		(candidate) => candidate.sourceName === 'sharedContact',
	);
	expect(sharedContact).toMatchObject({
		preservation: 'payload-id-backref',
		roundTripShape: 'same-object-identity',
	});
	expect(sharedContact?.statePaths).toEqual(
		expect.arrayContaining([
			'stateArena.identity.primary',
			'stateArena.identity.secondary',
			'stateArena.identity.nested.repeated',
			'stateArena.collections.contactMap["primary"]',
			'stateArena.collections.contactMap["secondary"]',
		]),
	);

	const cycle = artifact.cyclePlans.find((candidate) => candidate.rootSourceName === 'cycleA');
	expect(cycle).toMatchObject({
		allocation: 'shells-first',
		roundTripShape: 'forward-ref-and-backref',
	});
	expect(cycle?.statePaths).toEqual(
		expect.arrayContaining(['stateArena.cycles.cycleA', 'stateArena.cycles.cycleB']),
	);
	expect(cycle?.edges).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				from: 'stateArena.cycles.cycleA',
				property: 'next',
				to: 'stateArena.cycles.cycleB',
			}),
			expect.objectContaining({
				from: 'stateArena.cycles.cycleB',
				property: 'next',
				to: 'stateArena.cycles.cycleA',
			}),
			expect.objectContaining({
				from: 'stateArena.cycles.cycleB',
				property: 'parent',
				to: 'stateArena.cycles.cycleA',
			}),
		]),
	);

	expect(artifact.classRestorePlans).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				statePath: 'stateArena.valueClass.customer',
				className: 'CustomerSnapshot',
				tier: 'app-value-class',
				restoreStrategy: 'Object.create+assign',
				constructorRuns: false,
				methodBodiesSerialized: false,
				ownFields: ['id', 'name', 'credit'],
				methods: ['displayName'],
			}),
			expect.objectContaining({
				statePath: 'stateArena.valueClass.customer.credit',
				className: 'MoneyValue',
				tier: 'app-value-class',
				restoreStrategy: 'Object.create+assign',
				constructorRuns: false,
				methodBodiesSerialized: false,
				ownFields: ['amountCents', 'currency'],
				methods: ['format'],
			}),
		]),
	);
});

test('serializer-values fixture emits unsupported diagnostics and secret warnings', async () => {
	const artifact = await fixtureArtifact();

	for (const [statePath, code, valueKind] of [
		['unsupported.domNode', 'ARCADE_SERIALIZE_DOM_NODE', 'HTMLElement'],
		[
			'unsupported.elementHandleInState',
			'ARCADE_SERIALIZE_ELEMENT_HANDLE_IN_STATE',
			'element-handle',
		],
		['unsupported.request', 'ARCADE_SERIALIZE_RUNTIME_VALUE', 'Request'],
		['unsupported.stream', 'ARCADE_SERIALIZE_STREAM', 'ReadableStream'],
		['unsupported.socket', 'ARCADE_SERIALIZE_RUNTIME_VALUE', 'WebSocket'],
		['unsupported.weakState', 'ARCADE_SERIALIZE_WEAK_COLLECTION', 'WeakMap'],
		['unsupported.runtimeBox', 'ARCADE_SERIALIZE_RESOURCE_CLASS', 'RuntimeBox'],
	] as const) {
		expect(diagnostic(artifact, statePath, code)).toMatchObject({
			severity: 'error',
			phase: 'serialization',
			passId: 'serializer-values-planning',
			statePath,
			valueKind,
			docsUrl: `https://arcadejs.com/errors/${code}`,
		});
	}

	for (const statePath of [
		'stateArena.secretWarning.tokenName',
		'stateArena.secretWarning.tokenPreview',
		'unsupported.secretToken',
	]) {
		expect(diagnostic(artifact, statePath, 'ARCADE_SERIALIZE_SECRET_LEAK')).toMatchObject({
			severity: 'warning',
			phase: 'serialization',
			passId: 'serializer-values-planning',
			statePath,
			suggestions: expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringContaining('Do not store durable secrets'),
				}),
			]),
		});
	}
});
