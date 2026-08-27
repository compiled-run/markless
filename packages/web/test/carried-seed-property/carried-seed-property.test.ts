import { expect, test } from 'vitest';
import { installMarklessSharedSeedPass } from '../../src/fns/shared-seed.ts';
import { sharedSeedPass } from '../../src/prerender/shared-seed-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from '../../src/prerender/evaluator.ts';

// A seed property the compiler could not fold is carried as the authored
// expression, and that carry rides in the same component's `initialValues` beside
// the root's per-instance writes. Both records wear one graph node id, so the
// kinds map keys them by SYMBOL id: read per node, the factory default was
// classified as a per-instance seed, ran on top of the real ones, and ate them.

const BOX = 'shared:src/box.tsrx#boxState';
const BOX_NODE = `${BOX}/state:box`;

function rooting(name: string, definitionId: string): PrerenderDataDefinition {
	return {
		name,
		state: {
			cells: [{ graphNodeId: `${definitionId}/state:own` }],
			computed: [],
			sharedDefinitions: [{ id: definitionId, scope: 'widget' }],
		},
		view: { domUpdates: [], events: [], behaviors: [], elementHandles: [] },
		rootChunkId: `template:${name}`,
	} as unknown as PrerenderDataDefinition;
}

function writer(
	initialValues: ReadonlyArray<unknown>,
	initialValueKinds: Readonly<Record<string, string>>,
): PrerenderDataDefinition {
	return {
		name: 'Writer',
		state: { cells: [], computed: [] },
		view: { domUpdates: [], events: [], behaviors: [], elementHandles: [] },
		rootChunkId: 'template:Writer',
		initialValues,
		initialValueKinds,
	} as unknown as PrerenderDataDefinition;
}

function surface(part: PrerenderDataDefinition): PrerenderDataSurface {
	const chunks = [
		{
			id: 'template:Page',
			kind: 'template',
			componentName: 'Page',
			statics: [''],
			hosts: [],
			slots: [{ kind: 'child-component', componentEdgeId: 'e0', projectionChunkId: 'proj:e0' }],
		},
		{
			id: 'proj:e0',
			kind: 'template',
			componentName: 'Page',
			statics: [''],
			hosts: [],
			slots: [{ kind: 'child-component', componentEdgeId: 'e1' }],
		},
	];
	return {
		rootComponentName: 'Page',
		renderData: { root: null, chunks, repeats: [], boundaries: [] },
		components: { Box: rooting('Box', BOX), Writer: part },
		imports: {},
	} as unknown as PrerenderDataSurface;
}

const pageDefinition = {
	name: 'Page',
	rootChunkId: 'template:Page',
	edges: [
		{ id: 'e0', childComponentName: 'Box', hostPrefix: 'c0:', symbolPrefix: 'c0:', props: [] },
		{
			id: 'e1',
			childComponentName: 'Writer',
			hostPrefix: 'c1:',
			symbolPrefix: 'c1:',
			props: [{ kind: 'serializable', name: 'name', value: 'frame' }],
		},
	],
} as unknown as PrerenderDataDefinition;

// The carry evaluates to the whole authored default; the per-instance seed writes
// one property onto whatever base it is handed.
function symbolFor(symbolId: string) {
	if (symbolId.endsWith('symbol:init')) {
		return () => ({ name: '', width: 40, maxWidth: Number.POSITIVE_INFINITY });
	}
	return (seedContext: {
		readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	}) => ({
		...(seedContext.read(BOX_NODE) as Record<string, unknown>),
		name: seedContext.read('prop:name') as string,
	});
}

async function seed(part: PrerenderDataDefinition) {
	installMarklessSharedSeedPass();
	const pass = sharedSeedPass();
	if (!pass) throw new Error('The shared-seed pass did not install.');
	const loadedIds: string[] = [];
	const seeded = await pass(
		{
			surface: surface(part),
			symbolPrefix: '',
			idPrefix: '',
			loadSymbol(symbolId: string) {
				loadedIds.push(symbolId);
				return symbolFor(symbolId);
			},
		},
		pageDefinition,
		{ componentEdgeId: 'e0', projectionChunkId: 'proj:e0' },
		() => undefined,
		undefined,
	);
	return { seeded, loadedIds };
}

const carriedRecords = [
	{ graphNodeId: BOX_NODE, value: { kind: 'constant', value: { name: '', width: 40 } } },
	{ graphNodeId: BOX_NODE, value: { kind: 'symbol-function', symbolId: 'symbol:init' } },
	{ graphNodeId: BOX_NODE, value: { kind: 'symbol-function', symbolId: 'symbol:seed' } },
];

const carriedKinds = { 'symbol:init': 'state-initializer', 'symbol:seed': 'shared-seed' };

test('the merge base is the folded constant plus the carried property', async () => {
	const { seeded } = await seed(writer(carriedRecords, carriedKinds));

	expect(seeded?.get(BOX_NODE)).toEqual({
		name: 'frame',
		width: 40,
		maxWidth: Number.POSITIVE_INFINITY,
	});
});

// Order is the whole point: the carry is the base the per-instance write lands
// on, never a value replayed over it.
test('the carried default is applied before the per-instance seed runs', async () => {
	const { loadedIds } = await seed(writer(carriedRecords, carriedKinds));

	expect(loadedIds).toEqual(['c1:symbol:init', 'c1:symbol:seed']);
});

// The factory record is not a seed. Classified as one, it ran last and its
// authored default replaced the name the root had already written.
test('a factory default is not run as a per-instance seed', async () => {
	const { seeded } = await seed(writer(carriedRecords, carriedKinds));

	const value = seeded?.get(BOX_NODE) as { readonly name: string } | undefined;

	expect(value?.name).not.toBe('');
});

// A folded-only seed offers one symbol record per node, so its kinds stay keyed
// by graph node id and the reader falls back to that key.
test('a folded seed still primes from its constant under the node-id key', async () => {
	const { seeded, loadedIds } = await seed(
		writer(
			[
				{
					graphNodeId: BOX_NODE,
					value: { kind: 'constant', value: { name: '', width: 40, maxWidth: 9 } },
				},
				{ graphNodeId: BOX_NODE, value: { kind: 'symbol-function', symbolId: 'symbol:seed' } },
			],
			{ [BOX_NODE]: 'shared-seed' },
		),
	);

	expect(seeded?.get(BOX_NODE)).toEqual({ name: 'frame', width: 40, maxWidth: 9 });
	expect(loadedIds).toEqual(['c1:symbol:seed']);
});
