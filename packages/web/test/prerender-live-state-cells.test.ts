import { expect, test } from 'vitest';
import { renderPrerenderBoundary } from '../src/prerender/evaluator.ts';

// Escalated arm re-settles (an @if arm containing a component has no parts-based
// update module, so a state write re-renders the WHOLE arm through this
// evaluator). The arm must render what the interaction wrote: authored state
// cells read from the live graph, never from the compile-time initial value the
// component definition seeds.

const emptyArm = {
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	branches: [],
};

function escalatedArmSurface() {
	return {
		rootComponentName: 'Panel',
		renderData: {
			root: { componentName: 'Panel', templateId: 'template:Panel' },
			chunks: [
				{
					id: 'template:Panel',
					kind: 'template',
					componentName: 'Panel',
					statics: ['<main><!--markless-slot:0-->', '</main>'],
					hosts: [],
					slots: [
						{
							kind: 'async',
							boundaryId: 'boundary:0',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							armTemplateIds: { try: 'try', pending: 'pending', catch: 'catch' },
						},
					],
				},
				{
					id: 'try',
					kind: 'async-arm',
					componentName: 'Panel',
					statics: ['<div><!--markless-slot:0-->', '</div>'],
					hosts: [],
					slots: [
						{
							kind: 'branch',
							branchSiteId: 'branch-site:0',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							armTemplateIds: ['open-arm', 'closed-arm'],
						},
					],
				},
				{
					id: 'open-arm',
					kind: 'branch-arm',
					componentName: 'Panel',
					statics: ['<span data-open><!--markless-slot:0-->', '</span>'],
					hosts: [],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							residue: { kind: 'graph-read', graphNodeId: 'state:label', path: [] },
						},
					],
				},
				{
					id: 'closed-arm',
					kind: 'branch-arm',
					componentName: 'Panel',
					statics: [''],
					hosts: [],
					slots: [],
				},
				...['pending', 'catch'].map((id) => ({
					id,
					kind: 'async-arm',
					componentName: 'Panel',
					statics: [`<p>${id}</p>`],
					hosts: [],
					slots: [],
				})),
			],
			boundaries: [
				{
					boundaryId: 'boundary:0',
					runnerGraphNodeId: 'computed:report',
					initiallyServedArm: 1,
					armChunkIds: { try: 'try', pending: 'pending', catch: 'catch' },
				},
			],
			branches: [{ branchSiteId: 'branch-site:0', asyncBoundaryId: 'boundary:0' }],
			repeats: [],
		},
		components: {
			Panel: {
				name: 'Panel',
				state: {
					version: 1,
					cells: [
						{ graphNodeId: 'state:open', name: 'open', valueKind: 'boolean' },
						{ graphNodeId: 'state:label', name: 'label', valueKind: 'string' },
					],
					computed: [{ graphNodeId: 'computed:report', name: 'report', async: true }],
				},
				view: {
					version: 1,
					locators: [],
					events: [],
					domUpdates: [],
					behaviors: [],
					elementHandles: [],
					asyncBoundaries: [
						{
							id: 'boundary:0',
							runnerGraphNodeId: 'computed:report',
							initiallyServedArm: 1,
							startAnchor: { strategy: 'dom-order-comment', index: 0 },
							endAnchor: { strategy: 'dom-order-comment', index: 1 },
							asyncReads: [],
							armRecords: emptyArm,
						},
					],
				},
				rootChunkId: 'template:Panel',
				stateGraphNodeIds: ['state:open', 'state:label', 'computed:report'],
				branches: [
					{
						branchSiteId: 'branch-site:0',
						testReads: [{ source: 'open', graphNodeId: 'state:open', path: [] }],
					},
				],
				boundaries: [
					{
						boundaryId: 'boundary:0',
						runnerGraphNodeId: 'computed:report',
						initiallyServedArm: 1,
					},
				],
				// The authored initial values: `open` starts closed, `label` starts empty.
				initialValues: [
					{ graphNodeId: 'state:open', value: { kind: 'constant', value: false } },
					{ graphNodeId: 'state:label', value: { kind: 'constant', value: '' } },
				],
				edges: [],
				propCellId: null,
			},
		},
		imports: {},
	};
}

function graphAfterInteraction(open: boolean) {
	return {
		read(graphNodeId: string, path: ReadonlyArray<string> = []) {
			if (graphNodeId === 'state:open') return open;
			if (graphNodeId === 'state:label') return 'Q3 report';
			if (graphNodeId === 'computed:report')
				return path.length === 0
					? { status: 'fulfilled', version: 1, key: null, value: { title: 'Q3 report' } }
					: undefined;
			return undefined;
		},
	};
}

test('an escalated arm re-render reads authored state cells from the live graph, not the initial values', async () => {
	const rendered = await renderPrerenderBoundary(
		escalatedArmSurface() as never,
		'boundary:0',
		'fulfilled',
		graphAfterInteraction(true) as never,
		async () => undefined,
	);

	// Both facts come from the live graph: the branch takes the open arm
	// (state:open was written true) and the text renders the written label.
	expect(rendered.html).toContain('data-open');
	expect(rendered.html).toContain('Q3 report');
});

test('the same arm renders its closed branch when the live graph still holds the initial value', async () => {
	const rendered = await renderPrerenderBoundary(
		escalatedArmSurface() as never,
		'boundary:0',
		'fulfilled',
		graphAfterInteraction(false) as never,
		async () => undefined,
	);

	expect(rendered.html).not.toContain('data-open');
});
