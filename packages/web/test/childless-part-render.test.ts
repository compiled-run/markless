/**
 * The render side of childless detection: an `absent` children route must reach
 * the part's guard as `undefined`, so a self-closed placement renders its `@else`
 * arm instead of an empty one.
 *
 * The records here are the ones `packages/compiler` emits for a family root that
 * projects its children and a part that guards on `children` - one placement
 * self-closed, one written into. `renderPrerenderDataSurface` is the client
 * route mount; the server reaches the same `renderSsrData` through the compiled
 * module, so the arm both modes serve is decided by these same routes.
 */
import { expect, test } from 'vitest';
import { renderPrerenderDataSurface } from '../src/prerender/evaluator.ts';

const CHILDREN_READ = { kind: 'graph-read' as const, graphNodeId: 'prop:props', path: ['children'] };

const renderData = {
	root: { componentName: 'Page', templateId: 'template:Page' },
	chunks: [
		{
			id: 'template:Root',
			kind: 'template' as const,
			componentName: 'Root',
			statics: ['<div class="root"><!--markless-slot:0-->', '</div>'],
			hosts: [
				{ hostNodeId: 'h0', tagName: 'div', coordinate: { kind: 'child-index' as const, path: [0] } },
			],
			slots: [
				{
					kind: 'text' as const,
					residue: CHILDREN_READ,
					raw: true,
					coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
					staticIndex: 0,
				},
			],
		},
		{
			id: 'branch:branch-site:0:arm:0',
			kind: 'branch-arm' as const,
			componentName: 'ValueLabel',
			statics: ['<span><!--markless-slot:0-->', '</span>'],
			hosts: [
				{ hostNodeId: 'h2', tagName: 'span', coordinate: { kind: 'child-index' as const, path: [0] } },
			],
			slots: [
				{
					kind: 'text' as const,
					residue: CHILDREN_READ,
					raw: true,
					coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
					staticIndex: 0,
				},
			],
		},
		{
			id: 'branch:branch-site:0:arm:1',
			kind: 'branch-arm' as const,
			componentName: 'ValueLabel',
			statics: ['<span>40</span>'],
			hosts: [
				{ hostNodeId: 'h3', tagName: 'span', coordinate: { kind: 'child-index' as const, path: [0] } },
			],
			slots: [],
		},
		{
			id: 'template:ValueLabel',
			kind: 'template' as const,
			componentName: 'ValueLabel',
			statics: ['<output><!--markless-slot:0-->', '</output>'],
			hosts: [
				{ hostNodeId: 'h1', tagName: 'output', coordinate: { kind: 'child-index' as const, path: [0] } },
			],
			slots: [
				{
					kind: 'branch' as const,
					branchSiteId: 'branch-site:0',
					armTemplateIds: ['branch:branch-site:0:arm:0', 'branch:branch-site:0:arm:1'],
					coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
					staticIndex: 0,
				},
			],
		},
		{
			id: 'projection:component-edge:0',
			kind: 'component-projection' as const,
			componentName: 'Page',
			statics: ['<!--markless-slot:0-->', '<!--markless-slot:1-->', ''],
			hosts: [],
			slots: [
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:1',
					childComponentName: 'ValueLabel',
					childTemplateId: 'template:ValueLabel',
					coordinate: { kind: 'comment-anchor' as const, path: [0] },
					staticIndex: 0,
				},
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:2',
					childComponentName: 'ValueLabel',
					childTemplateId: 'template:ValueLabel',
					projectionChunkId: 'projection:component-edge:2',
					coordinate: { kind: 'comment-anchor' as const, path: [1] },
					staticIndex: 1,
				},
			],
		},
		{
			id: 'projection:component-edge:2',
			kind: 'component-projection' as const,
			componentName: 'Page',
			statics: ['custom'],
			hosts: [],
			slots: [],
		},
		{
			id: 'template:Page',
			kind: 'template' as const,
			componentName: 'Page',
			statics: ['<main><!--markless-slot:0-->', '</main>'],
			hosts: [
				{ hostNodeId: 'h4', tagName: 'main', coordinate: { kind: 'child-index' as const, path: [0] } },
			],
			slots: [
				{
					kind: 'child-component' as const,
					componentEdgeId: 'component-edge:0',
					childComponentName: 'Root',
					childTemplateId: 'template:Root',
					projectionChunkId: 'projection:component-edge:0',
					coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
					staticIndex: 0,
				},
			],
		},
	],
	repeats: [],
	boundaries: [],
	initialValues: [],
};

const emptyState = { version: 1, cells: [], computed: [], sharedDefinitions: [] };

// The one record under test: how each placement routes `children`. Self-closed
// is `absent`; written-into carries the projection the renderer splices.
function surface(selfClosedProps: ReadonlyArray<Record<string, unknown>>) {
	return {
		renderData,
		rootComponentName: 'Page',
		components: {
			Page: {
				name: 'Page',
				state: emptyState,
				view: { version: 1, locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], keyedRepeats: [], branches: [], asyncBoundaries: [] },
				rootChunkId: 'template:Page',
				chunks: renderData.chunks.filter((chunk) => chunk.componentName === 'Page'),
				branches: [],
				repeats: [],
				boundaries: [],
				stateGraphNodeIds: [],
				propCellId: null,
				edges: [
					{
						id: 'component-edge:0',
						childComponentName: 'Root',
						hostPrefix: 'c0:',
						symbolPrefix: 'c0:',
						boundSymbols: {},
						props: [{ name: 'children', kind: 'absent' }],
					},
					{
						id: 'component-edge:1',
						childComponentName: 'ValueLabel',
						hostPrefix: 'c1:',
						symbolPrefix: 'c0:p1:',
						boundSymbols: {},
						props: selfClosedProps,
					},
					{
						id: 'component-edge:2',
						childComponentName: 'ValueLabel',
						hostPrefix: 'c2:',
						symbolPrefix: 'c0:p2:',
						boundSymbols: {},
						props: [{ name: 'children', kind: 'absent' }],
					},
				],
			},
			Root: {
				name: 'Root',
				state: emptyState,
				view: { version: 1, locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], keyedRepeats: [], branches: [], asyncBoundaries: [] },
				rootChunkId: 'template:Root',
				chunks: renderData.chunks.filter((chunk) => chunk.componentName === 'Root'),
				branches: [],
				repeats: [],
				boundaries: [],
				stateGraphNodeIds: [],
				propCellId: null,
				edges: [],
			},
			ValueLabel: {
				name: 'ValueLabel',
				state: emptyState,
				view: { version: 1, locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], keyedRepeats: [], branches: [], asyncBoundaries: [] },
				rootChunkId: 'template:ValueLabel',
				chunks: renderData.chunks.filter((chunk) => chunk.componentName === 'ValueLabel'),
				branches: [
					{
						branchSiteId: 'branch-site:0',
						kind: 'if',
						testSource: 'children',
						testReads: [{ graphNodeId: 'prop:props', path: ['children'] }],
						armChunkIds: ['branch:branch-site:0:arm:0', 'branch:branch-site:0:arm:1'],
						anchorOrder: 0,
						update: 'range',
					},
				],
				repeats: [],
				boundaries: [],
				stateGraphNodeIds: [],
				propCellId: null,
				edges: [],
			},
		},
		imports: {},
	};
}

async function html(selfClosedProps: ReadonlyArray<Record<string, unknown>>) {
	const rendered = await renderPrerenderDataSurface(
		surface(selfClosedProps) as never,
		async () => undefined,
	);
	return rendered.html;
}

test('a self-closed placement reaches its childless arm', async () => {
	const rendered = await html([{ name: 'children', kind: 'absent' }]);

	// The fallback, not an empty arm: an empty one is the silent failure this pins.
	expect(rendered).toContain('<span>40</span>');
	expect(rendered).not.toContain('<span></span>');
});

test('a placement written into reaches its children arm, in the same render', async () => {
	const rendered = await html([{ name: 'children', kind: 'absent' }]);

	expect(rendered).toContain('<span>custom</span>');
});

// A part the invocation never mentions at all - the shape a family gets when the
// consumer writes no attribute and the child declares no `children` parameter -
// takes the same road: nothing passed is nothing to render.
test('a placement with no children route at all still reaches its childless arm', async () => {
	const rendered = await html([]);

	expect(rendered).toContain('<span>40</span>');
	expect(rendered).not.toContain('<span></span>');
});
