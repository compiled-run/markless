import { expect, test } from 'vitest';
import { installMarklessSharedSeedPass } from '../src/fns/shared-seed.ts';
import { sharedSeedPass } from '../src/prerender/shared-seed-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from '../src/prerender/evaluator.ts';

// T052, CSR side: a part an @if arm holds seeds the widget when its arm is the
// taken one. The arm decides whether the part renders; it never decides which
// widget the part belongs to, so the seed lands in the same map the root's does.

function surfaceWithArmHeldPart(): PrerenderDataSurface {
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
			slots: [{ kind: 'branch', branchSiteId: 'b0', armTemplateIds: ['arm:0', 'arm:1'] }],
		},
		{
			id: 'arm:0',
			kind: 'branch-arm',
			componentName: 'Page',
			statics: [''],
			hosts: [],
			slots: [{ kind: 'child-component', componentEdgeId: 'e1' }],
		},
		{ id: 'arm:1', kind: 'branch-arm', componentName: 'Page', statics: [''], hosts: [], slots: [] },
	];
	const part: PrerenderDataDefinition = {
		name: 'Err',
		state: { cells: [], computed: [] },
		view: { domUpdates: [], events: [], behaviors: [], elementHandles: [] },
		rootChunkId: 'template:Err',
		initialValues: [
			{ graphNodeId: 'shared:widget', value: { kind: 'constant', value: { invalid: false } } },
			{ graphNodeId: 'shared:widget', value: { kind: 'symbol-function', symbolId: 'symbol:9' } },
		],
		initialValueKinds: { 'shared:widget': 'shared-seed' },
	} as unknown as PrerenderDataDefinition;
	return {
		rootComponentName: 'Page',
		renderData: { root: null, chunks, repeats: [], boundaries: [] },
		components: { Err: part },
		imports: {},
	} as unknown as PrerenderDataSurface;
}

const pageDefinition = {
	name: 'Page',
	rootChunkId: 'template:Page',
	branches: [{ branchSiteId: 'b0', testReads: [{ graphNodeId: 'state:shown', path: [] }] }],
	edges: [
		{ id: 'e0', childComponentName: 'Root', hostPrefix: 'c0:', symbolPrefix: 'c0:', props: [] },
		{ id: 'e1', childComponentName: 'Err', hostPrefix: 'c1:', symbolPrefix: 'c1:', props: [] },
	],
} as unknown as PrerenderDataDefinition;

async function seedWith(shown: boolean) {
	installMarklessSharedSeedPass();
	const pass = sharedSeedPass();
	if (!pass) throw new Error('The shared-seed pass did not install.');
	const loadedIds: string[] = [];
	const context = {
		surface: surfaceWithArmHeldPart(),
		symbolPrefix: '',
		idPrefix: '',
		loadSymbol(symbolId: string) {
			loadedIds.push(symbolId);
			return (seedContext: { readonly read: (id: string) => unknown }) => ({
				...(seedContext.read('shared:widget') as Record<string, unknown>),
				invalid: true,
			});
		},
	};
	const seeded = await pass(
		context,
		pageDefinition,
		'e0',
		(graphNodeId: string) => (graphNodeId === 'state:shown' ? shown : undefined),
		undefined,
	);
	return { seeded, loadedIds };
}

test('the part an @if arm holds seeds the widget when its arm is taken', async () => {
	const { seeded, loadedIds } = await seedWith(true);

	expect(seeded?.get('shared:widget')).toEqual({ invalid: true });
	// Asked for under the part's own instance segment, the way an unconditional
	// part is: the arm changed nothing about which widget it belongs to.
	expect(loadedIds).toEqual(['c1:symbol:9']);
});

test('the part an @if arm does not take seeds nothing', async () => {
	const { seeded, loadedIds } = await seedWith(false);

	expect(seeded?.has('shared:widget')).toBe(false);
	expect(loadedIds).toEqual([]);
});
