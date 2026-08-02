import { ASYNC_BOUNDARY_ARM, ASYNC_PROTOCOL_VERSION } from '@markless/serializer';
import { describe, expect, test } from 'vitest';
import { compareSsrHtml, renderSsrData } from '../../src/ssr-data/renderer.ts';

describe('renderSsrData', () => {
	test('interleaves encoded residue and emits protocol scripts with build coordinates', async () => {
		const state = { version: ASYNC_PROTOCOL_VERSION, cells: [], computed: [] };
		const view = {
			version: ASYNC_PROTOCOL_VERSION,
			locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [], asyncBoundaries: [],
		};
		const output = await renderSsrData({
			renderData: {
				root: { componentName: 'Card', templateId: 'template:Card' },
				chunks: [
					{
						id: 'template:Card',
						kind: 'template',
						componentName: 'Card',
						statics: ['<article title="', '"><!--markless-slot:1-->', '</article>'],
						hosts: [
							{
								hostNodeId: 'h0',
								tagName: 'article',
								coordinate: { kind: 'child-index', path: [0] },
							},
						],
						slots: [
							{
								kind: 'attribute',
								name: 'title',
								staticIndex: 0,
								coordinate: { kind: 'child-index', path: [0] },
								residue: { kind: 'graph-read', graphNodeId: 'state:title', path: [] },
							},
							{
								kind: 'text',
								staticIndex: 1,
								coordinate: { kind: 'comment-anchor', path: [0, 0] },
								residue: { kind: 'graph-read', graphNodeId: 'state:body', path: [] },
							},
						],
					},
				],
				boundaries: [],
				repeats: [],
			},
			state,
			view,
			read: (residue) =>
				residue.kind === 'graph-read' && residue.graphNodeId === 'state:title'
					? 'A&B'
					: '<ready>',
		});

		expect(output.html).toBe('<article title="A&amp;B">&lt;ready&gt;</article>');
		expect(output.payloadScripts?.state).toBe(state);
		expect(output.payloadScripts?.view).toBe(view);
		expect(output.coordinates.locators).toEqual([
			{
				chunkId: 'template:Card',
				hostNodeId: 'h0',
				tagName: 'article',
				coordinate: { kind: 'child-index', path: [0] },
			},
		]);
	});

	test('uses the recorded served arm without deriving it from runner state', async () => {
		const output = await renderSsrData({
			renderData: {
				root: { componentName: 'Feed', templateId: 'template:Feed' },
				chunks: [
					{
						id: 'template:Feed', kind: 'template', componentName: 'Feed',
						statics: ['<main><!--markless-slot:0-->', '</main>'], hosts: [],
						slots: [{
							kind: 'async', boundaryId: 'boundary:feed', staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							armTemplateIds: { try: 'try', pending: 'pending', catch: 'catch' },
						}],
					},
					...(['try', 'pending', 'catch'] as const).map((id) => ({
						id, kind: 'async-arm' as const, componentName: 'Feed',
						statics: [`<p>${id}</p>`], hosts: [], slots: [],
					})),
				],
				boundaries: [{
					boundaryId: 'boundary:feed', runnerGraphNodeId: 'computed:feed',
					initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
					armChunkIds: { try: 'try', pending: 'pending', catch: 'catch' },
				}],
				repeats: [],
			},
			view: {
				version: ASYNC_PROTOCOL_VERSION,
				locators: [], events: [], domUpdates: [], behaviors: [], elementHandles: [],
				asyncBoundaries: [{
					id: 'boundary:feed',
					runnerGraphNodeId: 'computed:feed',
					initiallyServedArm: ASYNC_BOUNDARY_ARM.catch,
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [],
				}],
			},
			read: () => ({ status: 'fulfilled' }),
		});

		expect(output.html).toBe(
			'<main><!--markless:async:boundary:feed--><p>catch</p><!--/markless:async:boundary:feed--></main>',
		);
	});

	test('creates at most one dynamic host with embedded static payload', async () => {
		const render = (tag: unknown) => renderSsrData({
			renderData: {
				root: { componentName: 'Dynamic', templateId: 'template:Dynamic' },
				chunks: [
					{
						id: 'template:Dynamic', kind: 'template', componentName: 'Dynamic',
						statics: ['<section><!--markless-slot:0-->', '</section>'], hosts: [],
						slots: [{
							kind: 'dynamic-host', hostNodeId: 'h1', cardinality: 'zero-or-one',
							nullishTag: 'omit', staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
							tag: { kind: 'graph-read', graphNodeId: 'state:tag', path: [] },
							staticAttributes: { class: 'card', title: 'A&B' },
							attributeSlots: [], childChunkId: 'dynamic:children',
						}],
					},
					{
						id: 'dynamic:children', kind: 'dynamic-host-children', componentName: 'Dynamic',
						statics: ['<b>Body</b>'], hosts: [], slots: [],
					},
				], boundaries: [], repeats: [],
			},
			read: () => tag,
		});

		expect((await render('article')).html).toBe(
			'<section><article class="card" title="A&amp;B"><b>Body</b></article></section>',
		);
		expect((await render(null)).html).toBe('<section></section>');
	});

	test('fails loudly when a child renderer omits structural records', async () => {
		const renderData = {
			root: { componentName: 'Parent', templateId: 'template:Parent' },
			chunks: [{
				id: 'template:Parent', kind: 'template' as const, componentName: 'Parent',
				statics: ['<!--markless-slot:0-->'], hosts: [],
				slots: [{
					kind: 'child-component' as const, componentEdgeId: 'component-edge:0',
					childComponentName: 'Child', childTemplateId: 'template:Child', staticIndex: 0,
					coordinate: { kind: 'comment-anchor' as const, path: [0] },
				}],
			}],
			boundaries: [], repeats: [],
		};

		await expect(renderSsrData({
			renderData,
			read: () => undefined,
			renderChild: async () => ({ html: '<p>unstructured</p>' }),
		})).rejects.toThrow('MARKLESS_SSR_DATA_CHILD_STRUCTURE_MISSING: component-edge:0');
	});
});

test('the shadow comparator reports a deliberate mutation as DIFFERENT', () => {
	expect(compareSsrHtml('<main>same</main>', '<main>same</main>')).toEqual({ equal: true });
	expect(compareSsrHtml('<main>same</main>', '<main>changed</main>')).toMatchObject({
		equal: false,
		actual: '<main>changed</main>',
		expected: '<main>same</main>',
	});
});
