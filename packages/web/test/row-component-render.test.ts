import { expect, test } from 'vitest';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import {
	renderRepeatRowComponent,
	type PrerenderDataSurface,
} from '../src/prerender/evaluator.ts';

/**
 * The one-edge render behind a minted component row.
 *
 * A component row has a graph, not a template - one instance per rendered row -
 * so the payload names the edge and the client runs the same render the server
 * ran. What that render has to come back with is what this file pins: markup for
 * the item, records spelled in the row's own identity, and per-row graph nodes,
 * because two rows of one component that shared a node would toggle together.
 */

function surface(): PrerenderDataSurface {
	return {
		rootComponentName: 'Page',
		renderData: {
			root: { componentName: 'Page', templateId: 'page' },
			chunks: [
				{
					id: 'page',
					kind: 'template',
					componentName: 'Page',
					statics: ['<ul>', '</ul>'],
					hosts: [
						{
							hostNodeId: 'list',
							tagName: 'ul',
							coordinate: { kind: 'child-index', path: [0] },
						},
					],
					slots: [],
				},
				{
					id: 'row',
					kind: 'template',
					componentName: 'Row',
					statics: ['<li><span>', '</span><button>x</button></li>'],
					hosts: [
						{
							hostNodeId: 'root',
							tagName: 'li',
							coordinate: { kind: 'child-index', path: [0] },
						},
						{
							hostNodeId: 'act',
							tagName: 'button',
							coordinate: { kind: 'child-index', path: [0, 1] },
						},
					],
					slots: [
						{
							kind: 'text',
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0, 0, 0] },
							residue: { kind: 'graph-read', graphNodeId: 'prop:item', path: ['label'] },
						},
					],
				},
			],
			repeats: [],
			boundaries: [],
		} as unknown as PrerenderDataSurface['renderData'],
		components: {
			Page: {
				name: 'Page',
				rootChunkId: 'page',
				hostNodeIds: ['list'],
				state: { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] },
				view: emptyView(),
				edges: [
					{
						id: 'edge:row',
						childComponentName: 'Row',
						hostPrefix: 'c0:',
						symbolPrefix: 'c0:',
						props: [{ name: 'item', kind: 'serializable', value: undefined }],
					},
				],
			},
			Row: {
				name: 'Row',
				rootChunkId: 'row',
				hostNodeIds: ['root', 'act'],
				state: {
					version: ASYNC_PROTOCOL_VERSION,
					cells: [{ graphNodeId: 'state:open', name: 'open', valueKind: 'boolean' }],
					computed: [],
				},
				initialValues: [
					{ graphNodeId: 'state:open', value: { kind: 'constant', value: false } },
				],
				view: {
					...emptyView(),
					locators: [
						{ hostNodeId: 'root', index: 0, tagName: 'li' },
						{ hostNodeId: 'act', index: 1, tagName: 'button' },
					],
					events: [
						{ hostNodeId: 'act', eventName: 'click', symbolIds: ['symbol:toggle'] },
					],
				},
			},
		} as unknown as PrerenderDataSurface['components'],
		imports: {},
	};
}

function emptyView() {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function renderRow(rowKey: string, label: string) {
	return renderRepeatRowComponent({
		surface: surface(),
		ownerComponentName: 'Page',
		componentEdgeId: 'edge:row',
		itemPropName: 'item',
		item: { id: rowKey, label },
		rowKey,
		rowIndex: 0,
		loadSymbol: () => undefined,
		read: () => undefined,
	});
}

test('a minted row renders the component against the item it was minted for', async () => {
	const rendered = await renderRow('c', 'charlie');

	expect(rendered.html).toContain('charlie');
	expect(rendered.html).toContain('<button>x</button>');
});

test("a minted row's records carry the row's own identity", async () => {
	const rendered = await renderRow('c', 'charlie');

	// `r:<key>:` ahead of the edge prefix: one compile-time edge, one instance per
	// rendered row, and the ids have to say which row this is.
	expect(rendered.view.events.map((event) => event.hostNodeId)).toEqual(['r:c:c0:act']);
	expect(rendered.view.locators.map((locator) => locator.hostNodeId)).toEqual([
		'r:c:c0:root',
		'r:c:c0:act',
	]);
});

test('a minted row indexes its hosts from its own root, not the page', async () => {
	const rendered = await renderRow('c', 'charlie');

	// The row has not joined the document when its hosts are resolved, so 0 is the
	// row root and every later index counts the row's own elements.
	expect(rendered.view.locators.map((locator) => locator.index)).toEqual([0, 1]);
});

test('two minted rows write different graph nodes', async () => {
	const first = await renderRow('c', 'charlie');
	const second = await renderRow('d', 'delta');

	const ids = (state: (typeof first)['state']) =>
		state.cells.map((cell) => cell.graphNodeId).filter((id) => id.endsWith('state:open'));
	expect(ids(first.state)).toEqual(['r:c:c0:state:open']);
	expect(ids(second.state)).toEqual(['r:d:c0:state:open']);
});

test('a row naming an edge this component does not declare refuses', async () => {
	await expect(
		renderRepeatRowComponent({
			surface: surface(),
			ownerComponentName: 'Page',
			componentEdgeId: 'edge:absent',
			item: {},
			rowKey: 'c',
			rowIndex: 0,
			loadSymbol: () => undefined,
			read: () => undefined,
		}),
	).rejects.toThrowError(/MARKLESS_PRERENDER_CHILD_MISSING/);
});
