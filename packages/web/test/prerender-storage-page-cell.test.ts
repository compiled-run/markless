import { expect, test } from 'vitest';
import { evaluatePrerenderDataComponent } from '../src/prerender/evaluator.ts';

// One component an arm places afresh: its own state() and a storage() key other modules may also declare.
const surface = {
	rootComponentName: 'Window',
	renderData: {
		root: { componentName: 'Window', templateId: 'template:Window' },
		chunks: [
			{
				id: 'template:Window',
				kind: 'template',
				componentName: 'Window',
				statics: ['<p><!--markless-slot:0-->', '</p><p><!--markless-slot:1-->', '</p>'],
				hosts: [],
				slots: [
					{
						kind: 'text',
						staticIndex: 0,
						coordinate: { kind: 'comment-anchor', path: [0, 0] },
						residue: { kind: 'graph-read', graphNodeId: 'storage:room', path: [] },
					},
					{
						kind: 'text',
						staticIndex: 1,
						coordinate: { kind: 'comment-anchor', path: [1, 0] },
						residue: { kind: 'graph-read', graphNodeId: 'state:taps', path: [] },
					},
				],
			},
		],
		boundaries: [],
		repeats: [],
	},
	components: {
		Window: {
			name: 'Window',
			state: {
				version: 2,
				cells: [
					{ graphNodeId: 'storage:room', name: 'glow', valueKind: 'scalar' },
					{ graphNodeId: 'state:taps', name: 'taps', valueKind: 'scalar' },
				],
				computed: [],
				storage: [{ graphNodeId: 'storage:room', key: 'room' }],
			},
			view: { version: 1, locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [] },
			rootChunkId: 'template:Window',
			stateGraphNodeIds: ['storage:room', 'state:taps'],
			initialValues: [
				{ graphNodeId: 'storage:room', value: { kind: 'constant', value: 'off' } },
				{ graphNodeId: 'state:taps', value: { kind: 'constant', value: 0 } },
			],
			boundaries: [],
			edges: [],
			propCellId: null,
		},
	},
	imports: {},
};

function renderFresh(live: ReadonlyMap<string, unknown>) {
	const reads: string[] = [];
	const freshCellIds = new Set<string>();
	const graph = {
		read(graphNodeId: string) {
			reads.push(graphNodeId);
			return live.get(graphNodeId);
		},
	};
	const rendered = evaluatePrerenderDataComponent({
		surface: surface as never,
		componentName: 'Window',
		props: {},
		idPrefix: 'c1:',
		symbolPrefix: 'c1:',
		loadSymbol: () => Promise.reject(new Error('no symbols')),
		graph: graph as never,
		requireHtml: true,
		freshInstance: true,
		freshCellIds,
	});
	return { rendered, reads, freshCellIds };
}

test('a component an arm places reads a storage() key the page already holds, under no instance path', async () => {
	const { rendered, reads, freshCellIds } = renderFresh(
		new Map([
			['storage:room', 'on'],
			['c1:state:taps', 7],
		]),
	);

	expect((await rendered).html).toBe('<p>on</p><p>0</p>');
	expect(reads).not.toContain('c1:storage:room');
	expect([...freshCellIds]).toEqual(['c1:state:taps']);
});

test('a component an arm places seeds a storage() key nothing on the page holds yet as the page cell', async () => {
	const { rendered, freshCellIds } = renderFresh(new Map());

	expect((await rendered).html).toBe('<p>off</p><p>0</p>');
	expect([...freshCellIds].sort()).toEqual(['c1:state:taps', 'storage:room']);
});
