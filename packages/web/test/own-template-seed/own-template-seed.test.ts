import { expect, test } from 'vitest';
import { installMarklessSharedSeedPass } from '../../src/fns/shared-seed.ts';
import { sharedSeedPass } from '../../src/prerender/shared-seed-slot.ts';
import { marklessWidgetInstanceKey } from '../../src/prerender/shared-seed-slot.ts';
import type { PrerenderDataDefinition, PrerenderDataSurface } from '../../src/prerender/evaluator.ts';

// A nested widget root may render a part of the ENCLOSING family in its own
// template rather than receive it projected. The served render reaches that part
// through the child's seed forward (`seedForward` in public-render's ssr-module),
// so the client pass has to reach it too — through every composed link down to
// the child's own `children`, whether or not that link roots a widget.

const OUTER = 'shared:src/nested.tsrx#outerState';
const OUTER_NODE = `${OUTER}/state:outer`;
const NESTED = 'shared:src/nested.tsrx#nestedState';

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

// The writer: an ordinary part of the outer family, rooting nothing of its own.
const writer = {
	name: 'Writer',
	state: { cells: [], computed: [] },
	view: { domUpdates: [], events: [], behaviors: [], elementHandles: [] },
	rootChunkId: 'template:Writer',
	initialValues: [
		{ graphNodeId: OUTER_NODE, value: { kind: 'constant', value: { count: 0 } } },
		{ graphNodeId: OUTER_NODE, value: { kind: 'symbol-function', symbolId: 'symbol:7' } },
	],
	initialValueKinds: { [OUTER_NODE]: 'shared-seed' },
} as unknown as PrerenderDataDefinition;

const nested = {
	...rooting('Nested', NESTED),
	edges: [
		{
			id: 'ne0',
			childComponentName: 'Writer',
			hostPrefix: 'n0:',
			symbolPrefix: 'n0:',
			props: [{ kind: 'graph-reference', name: 'index', graphNodeId: 'prop:index' }],
		},
	],
} as unknown as PrerenderDataDefinition;

function surface(): PrerenderDataSurface {
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
		// The nested root's OWN template: it renders the writer itself and puts its
		// own `children` inside it, so nobody projects the writer through it.
		{
			id: 'template:Nested',
			kind: 'template',
			componentName: 'Nested',
			statics: [''],
			hosts: [],
			slots: [{ kind: 'child-component', componentEdgeId: 'ne0', projectionChunkId: 'proj:ne0' }],
		},
		{
			id: 'proj:ne0',
			kind: 'template',
			componentName: 'Nested',
			statics: [''],
			hosts: [],
			slots: [
				{
					kind: 'text',
					residue: { kind: 'graph-read', graphNodeId: 'prop:props', path: ['children'] },
				},
			],
		},
	];
	return {
		rootComponentName: 'Page',
		renderData: { root: null, chunks, repeats: [], boundaries: [] },
		components: { Outer: rooting('Outer', OUTER), Nested: nested, Writer: writer },
		imports: {},
	} as unknown as PrerenderDataSurface;
}

const pageDefinition = {
	name: 'Page',
	rootChunkId: 'template:Page',
	edges: [
		{ id: 'e0', childComponentName: 'Outer', hostPrefix: 'c0:', symbolPrefix: 'c0:', props: [] },
		{
			id: 'e1',
			childComponentName: 'Nested',
			hostPrefix: 'c1:',
			symbolPrefix: 'c1:',
			props: [{ kind: 'serializable', name: 'index', value: 2 }],
		},
	],
} as unknown as PrerenderDataDefinition;

async function seed(
	slot: { componentEdgeId: string; projectionChunkId?: string },
	inherited?: ReadonlyMap<string, unknown>,
) {
	installMarklessSharedSeedPass();
	const pass = sharedSeedPass();
	if (!pass) throw new Error('The shared-seed pass did not install.');
	const loadedIds: string[] = [];
	const seeded = await pass(
		{
			surface: surface(),
			symbolPrefix: '',
			idPrefix: '',
			loadSymbol(symbolId: string) {
				loadedIds.push(symbolId);
				return (seedContext: {
					readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
				}) => ({
					...(seedContext.read(OUTER_NODE) as Record<string, unknown>),
					count: (seedContext.read('prop:index') as number) + 1,
				});
			},
		},
		pageDefinition,
		slot,
		() => undefined,
		inherited,
	);
	return { seeded, loadedIds };
}

test('a writer the nested root renders in its own template seeds the outer instance', async () => {
	const { seeded, loadedIds } = await seed({ componentEdgeId: 'e0', projectionChunkId: 'proj:e0' });

	expect(seeded?.get(OUTER_NODE)).toEqual({ count: 3 });
	// Asked for under the nested root's own instance segment and then the writer's:
	// the write ran from inside that root's template, in the outer root's map.
	expect(loadedIds).toEqual(['c1:n0:symbol:7']);
	expect(seeded?.get(marklessWidgetInstanceKey(OUTER))).toBe('c0:');
});

test('the nested root’s own pass leaves that write to the outer instance', async () => {
	const { seeded, loadedIds } = await seed(
		{ componentEdgeId: 'e1' },
		new Map<string, unknown>([[marklessWidgetInstanceKey(OUTER), 'c0:']]),
	);

	// Reaching the writer must not mint a private copy per nested widget: the
	// family's filed token names the outer instance, which this pass does not root.
	expect(seeded?.has(OUTER_NODE)).toBe(false);
	expect(loadedIds).toEqual([]);
	expect(seeded?.get(marklessWidgetInstanceKey(NESTED))).toBe('c1:');
});
