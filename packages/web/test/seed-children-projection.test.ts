import { expect, test } from 'vitest';
import { staticProjectionChildren } from '../src/prerender/children-projection.ts';
import type { PrerenderDataSurface } from '../src/prerender/evaluator.ts';

// The CSR seed pass runs before the projection renders, so the only children it
// can hand a part are children already spelled in the compiled chunk. The
// compiler asks the same question of the same chunks in
// `staticProjectionChildren` (packages/compiler public-render/shared-seed-pass).
function surface(chunks: ReadonlyArray<unknown>): PrerenderDataSurface {
	return { renderData: { chunks } } as unknown as PrerenderDataSurface;
}

const placement = {
	id: 'template:Page',
	kind: 'template',
	componentName: 'Page',
	statics: ['<!--markless-slot:0-->', ''],
	hosts: [],
	slots: [
		{
			kind: 'child-component',
			componentEdgeId: 'component-edge:2',
			childComponentName: 'MeterLabel',
			childTemplateId: 'template:MeterLabel',
			projectionChunkId: 'projection:component-edge:2',
			coordinate: { kind: 'comment-anchor', path: [1] },
			staticIndex: 0,
		},
	],
};

function projection(overrides: Record<string, unknown>) {
	return {
		id: 'projection:component-edge:2',
		kind: 'component-projection',
		componentName: 'Page',
		statics: [],
		hosts: [],
		slots: [],
		...overrides,
	};
}

test('a projection of static text alone answers with that text', () => {
	expect(
		staticProjectionChildren(
			surface([placement, projection({ statics: ['30 of 100 rows'] })]),
			'component-edge:2',
		),
	).toBe('30 of 100 rows');
});

test('a projection carrying an element answers with nothing', () => {
	expect(
		staticProjectionChildren(
			surface([
				placement,
				projection({
					statics: ['<em>30</em> of 100'],
					hosts: [
						{ hostNodeId: 'h4', tagName: 'em', coordinate: { kind: 'child-index', path: [0] } },
					],
				}),
			]),
			'component-edge:2',
		),
	).toBeUndefined();
});

test('a projection carrying a read answers with nothing', () => {
	expect(
		staticProjectionChildren(
			surface([
				placement,
				projection({
					statics: ['', ' rows'],
					slots: [
						{
							kind: 'text',
							residue: { kind: 'graph-read', graphNodeId: 'state:count', path: [] },
							coordinate: { kind: 'comment-anchor', path: [0] },
							staticIndex: 0,
						},
					],
				}),
			]),
			'component-edge:2',
		),
	).toBeUndefined();
});

test('a placement with no projection answers with nothing', () => {
	expect(
		staticProjectionChildren(
			surface([
				{
					...placement,
					slots: [{ ...placement.slots[0], projectionChunkId: undefined }],
				},
			]),
			'component-edge:2',
		),
	).toBeUndefined();
});

test('an edge this module never placed answers with nothing', () => {
	expect(
		staticProjectionChildren(
			surface([placement, projection({ statics: ['30 of 100 rows'] })]),
			'component-edge:9',
		),
	).toBeUndefined();
});
