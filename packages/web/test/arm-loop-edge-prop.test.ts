import { describe, expect, test } from 'vitest';
import { renderSsrData, type SsrDataChunk, type SsrDataSlot } from '../src/ssr-data/renderer.ts';

/**
 * U127: a component edge whose prop reads the `@for` binding resolves when the
 * edge is a DIRECT child of the row, and loses the row when the same edge sits
 * inside an `@if` arm inside that row. The arm is the only difference between
 * the two shapes below, so a row missing under the arm is the arm dropping it.
 */

const childSlot = (edgeId: string, staticIndex: number): SsrDataSlot => ({
	kind: 'child-component',
	componentEdgeId: edgeId,
	childComponentName: 'Trigger',
	childTemplateId: 'template:Trigger',
	staticIndex,
	coordinate: { kind: 'comment-anchor', path: [0, staticIndex] },
});

// `@for (entry of entries) { ... }` over a page-list, with one row template.
const repeatChunks = (rowSlots: ReadonlyArray<SsrDataSlot>, extra: ReadonlyArray<SsrDataChunk>) =>
	[
		{
			id: 'template:Pagination',
			kind: 'template' as const,
			componentName: 'Pagination',
			statics: ['<nav><!--markless-slot:0-->', '</nav>'],
			hosts: [],
			slots: [
				{
					kind: 'repeat' as const,
					repeatId: 'repeat:pages',
					rowTemplateId: 'row:pages',
					staticIndex: 0,
					coordinate: { kind: 'comment-anchor' as const, path: [0, 0] },
				},
			],
		},
		{
			id: 'row:pages',
			kind: 'repeat-row' as const,
			componentName: 'Pagination',
			statics: ['<!--markless-slot:0-->', ''],
			hosts: [],
			slots: rowSlots,
		},
		...extra,
	] satisfies ReadonlyArray<SsrDataChunk>;

const entries = [{ value: 1 }, { value: 2 }, { value: 3 }];

// The edge prop the pagination scenario writes: `value={entry.value}`, an
// authored expression over the row binding, answered from the read context.
const render = (chunks: ReadonlyArray<SsrDataChunk>, seen: Array<unknown>) =>
	renderSsrData({
		renderData: {
			root: { componentName: 'Pagination', templateId: 'template:Pagination' },
			chunks,
			repeats: [
				{
					repeatId: 'repeat:pages',
					collectionGraphNodeId: 'state:entries',
					keyPath: ['value'],
					rowChunkId: 'row:pages',
				},
			],
			boundaries: [],
			branches: [{ branchSiteId: 'branch:0', testReads: [{ graphNodeId: 'state:shown', path: [] }] }],
		},
		read: (residue) =>
			residue.kind === 'graph-read' && residue.graphNodeId === 'state:entries' ? entries : true,
		selectBranchArm: () => 0,
		renderChild: (_slot, context) => {
			seen.push(context.repeatItem);
			const value = (context.repeatItem as { readonly value: number } | undefined)?.value;
			if (value === undefined) throw new Error('MARKLESS_TEST_ROW_MISSING');
			return { html: `<button>${value}</button>`, elementCount: 1 };
		},
	});

describe('a component edge prop reading the @for binding', () => {
	test('resolves when the edge is a direct child of the row', async () => {
		const seen: Array<unknown> = [];
		const output = await render(repeatChunks([childSlot('component-edge:0', 0)], []), seen);

		expect(seen).toEqual(entries);
		expect(output.html).toBe('<nav><button>1</button><button>2</button><button>3</button></nav>');
	});

	// PINNED - the arm renders its chunk with an EMPTY read context
	// (`renderChunk(armChunkId, {})`, packages/web/src/ssr-data/renderer.ts:370),
	// so everything under the arm loses `repeatItem`/`repeatIndex`/`repeatKey`
	// and `sharedSeeds`. The direct-child row above shares every other input and
	// passes, so the arm frame is the whole difference. The projection path
	// (renderer.ts:324) and the async-arm path (renderer.ts:429) already forward
	// the row; the branch arm is the one that does not. Un-pin with that fix.
	test.fails('resolves when the edge sits inside an @if arm inside the row', async () => {
		const seen: Array<unknown> = [];
		const output = await render(
			repeatChunks(
				[
					{
						kind: 'branch',
						branchSiteId: 'branch:0',
						armTemplateIds: ['arm:0', 'arm:1'],
						staticIndex: 0,
						coordinate: { kind: 'comment-anchor', path: [0, 0] },
					},
				],
				[
					{
						id: 'arm:0',
						kind: 'branch-arm',
						componentName: 'Pagination',
						statics: ['<!--markless-slot:0-->', ''],
						hosts: [],
						slots: [childSlot('component-edge:0', 0)],
					},
					{
						id: 'arm:1',
						kind: 'branch-arm',
						componentName: 'Pagination',
						statics: [''],
						hosts: [],
						slots: [],
					},
				],
			),
			seen,
		);

		// The arm decides WHETHER the edge renders, never which row it is inside.
		expect(seen).toEqual(entries);
		expect(output.html).toContain('<button>1</button>');
		expect(output.html).toContain('<button>3</button>');
	});

	// PINNED on the same renderer.ts:370 cause: the index and key travel in the
	// same read context the arm drops.
	test.fails('carries the row index and key through the arm, as a direct child does', async () => {
		const indices: Array<number | undefined> = [];
		const keys: Array<unknown> = [];
		await renderSsrData({
			renderData: {
				root: { componentName: 'Pagination', templateId: 'template:Pagination' },
				chunks: repeatChunks(
					[
						{
							kind: 'branch',
							branchSiteId: 'branch:0',
							armTemplateIds: ['arm:0'],
							staticIndex: 0,
							coordinate: { kind: 'comment-anchor', path: [0, 0] },
						},
					],
					[
						{
							id: 'arm:0',
							kind: 'branch-arm',
							componentName: 'Pagination',
							statics: ['<!--markless-slot:0-->', ''],
							hosts: [],
							slots: [childSlot('component-edge:0', 0)],
						},
					],
				),
				repeats: [
					{
						repeatId: 'repeat:pages',
						collectionGraphNodeId: 'state:entries',
						keyPath: ['value'],
						rowChunkId: 'row:pages',
					},
				],
				boundaries: [],
				branches: [
					{ branchSiteId: 'branch:0', testReads: [{ graphNodeId: 'state:shown', path: [] }] },
				],
			},
			read: (residue) =>
				residue.kind === 'graph-read' && residue.graphNodeId === 'state:entries' ? entries : true,
			selectBranchArm: () => 0,
			renderChild: (_slot, context) => {
				indices.push(context.repeatIndex);
				keys.push(context.repeatKey);
				return { html: '<button></button>', elementCount: 1 };
			},
		});

		expect(indices).toEqual([0, 1, 2]);
		expect(keys).toEqual([1, 2, 3]);
	});
});
