import { expect, test } from 'vitest';
import { widgetRootsOf } from '../../src/prerender/children-projection.ts';
import type { PrerenderDataSurface } from '../../src/prerender/evaluator.ts';

// Why an adopted family's COMPUTED record may travel with a part while its
// CELLS may not: the render-time answer to "does this component root that
// family" is read off the cells the component's payload owns, and nothing looks
// at the computeds. A part carrying a computed record so it can re-derive is
// still no root, so no roster of the family merges across it.

const GAUGE = 'shared:/src/gauge.tsrx#gauge';

function surfaceWith(
	stateCellIndexes: ReadonlyArray<number>,
	stateComputedIndexes: ReadonlyArray<number>,
): PrerenderDataSurface {
	return {
		renderData: { chunks: [], branches: [], repeats: [], boundaries: [], initialValues: [] },
		imports: {},
		components: {
			Mark: {
				name: 'Mark',
				stateCellIndexes,
				stateComputedIndexes,
				stateGraphNodeIds: [`${GAUGE}/state:g`, `${GAUGE}/computed:loud`],
				state: {
					cells: [{ graphNodeId: `${GAUGE}/state:g` }],
					computed: [{ graphNodeId: `${GAUGE}/computed:loud` }],
					sharedDefinitions: [{ id: GAUGE, scope: 'widget' }],
				},
			},
		},
	} as unknown as PrerenderDataSurface;
}

test('a part owning only the family’s computed record roots no widget', () => {
	expect(widgetRootsOf(surfaceWith([], [0]), 'Mark')).toEqual([]);
});

test('a component owning the family’s cell roots the widget', () => {
	expect(widgetRootsOf(surfaceWith([0], [0]), 'Mark')).toEqual([GAUGE]);
});
