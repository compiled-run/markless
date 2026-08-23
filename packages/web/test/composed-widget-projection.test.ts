import { expect, test } from 'vitest';
import {
	protocolInstanceSegment,
	protocolProjectionSegment,
	protocolRowSegment,
} from '../../serializer/src/protocol.ts';
import {
	marklessComposeState,
	marklessComposedWidgetRegistry,
} from '../src/fns/composition.ts';
import {
	marklessComposedGraphNodeId,
	marklessInstanceScopedGraph,
} from '../src/fns/instance-scope.ts';

// A widget family whose root a composing component places around its own
// children: the shape every headless family ships as (`checklist.root` composing
// `CheckboxRoot`, `GroupRoot` composing `PwrRoot`).
const DEFINITION = 'shared:src/pwr.tsrx#pwr';
const CELL = `${DEFINITION}/state:s`;

// One composed child as the composition seam sees it: the group root's own
// render output, which already carries the family root it composed at `c0:`.
function groupRootChild(symbolPrefix: string) {
	return {
		hostPrefix: symbolPrefix,
		symbolPrefix,
		childrenWidgetRoot: protocolInstanceSegment(0),
		output: {
			state: {
				cells: [{ graphNodeId: `${protocolInstanceSegment(0)}${CELL}` }],
				computed: [],
				sharedDefinitions: [
					{
						id: `${protocolInstanceSegment(0)}${DEFINITION}`,
						name: 'pwr',
						exportedName: 'pwr',
						scope: 'widget',
						version: 0,
						graphNodeIds: [`${protocolInstanceSegment(0)}${CELL}`],
					},
				],
			},
		},
	};
}

// The part a consumer wrote inside the group root renders BESIDE the family root
// the group composed, so its instance path is a projection segment under the
// group, never a prefix of the root's path.
function partPath(sitePath: string) {
	return `${sitePath}${protocolProjectionSegment(1)}`;
}

test('two placements of one composing component root two widgets, not one', () => {
	const first = protocolInstanceSegment(0);
	const second = protocolInstanceSegment(3);
	const composed = marklessComposeState({ cells: [], computed: [] }, [
		groupRootChild(first),
		groupRootChild(second),
	]);

	// Each placement's cells land under its own path: the already-composed widget
	// id keeps taking the instance path when it is composed again.
	expect(composed.cells.map((cell) => cell.graphNodeId)).toEqual([
		`${first}${protocolInstanceSegment(0)}${CELL}`,
		`${second}${protocolInstanceSegment(0)}${CELL}`,
	]);

	// And each placement's projected parts read that placement's cells. The
	// registry is asked for by name: widget roots belong to the render that made
	// them, so a reader outside the compose says WHICH render it means.
	const widgets = marklessComposedWidgetRegistry(composed);
	expect(marklessComposedGraphNodeId(CELL, partPath(first), widgets)).toBe(
		`${first}${protocolInstanceSegment(0)}${CELL}`,
	);
	expect(marklessComposedGraphNodeId(CELL, partPath(second), widgets)).toBe(
		`${second}${protocolInstanceSegment(0)}${CELL}`,
	);
});

test('a keyed row composes a widget of its own', () => {
	const rows = ['alpha', 'beta'].map(
		(key) => protocolRowSegment(key) + protocolInstanceSegment(0),
	);
	const composed = marklessComposeState({ cells: [], computed: [] }, rows.map(groupRootChild));
	const widgets = marklessComposedWidgetRegistry(composed);

	const [alpha, beta] = rows;
	expect(marklessComposedGraphNodeId(CELL, partPath(alpha!), widgets)).toBe(
		`${alpha}${protocolInstanceSegment(0)}${CELL}`,
	);
	expect(marklessComposedGraphNodeId(CELL, partPath(beta!), widgets)).toBe(
		`${beta}${protocolInstanceSegment(0)}${CELL}`,
	);
	expect(marklessComposedGraphNodeId(CELL, partPath(alpha!), widgets)).not.toBe(
		marklessComposedGraphNodeId(CELL, partPath(beta!), widgets),
	);
});

test('composition writes the projection site into the payload it serves', () => {
	const site = protocolInstanceSegment(7);
	const composed = marklessComposeState({ cells: [], computed: [] }, [groupRootChild(site)]);

	expect(composed.sharedDefinitions).toEqual([
		expect.objectContaining({
			id: `${site}${protocolInstanceSegment(0)}${DEFINITION}`,
			projectionIds: [`${site}${DEFINITION}`],
		}),
	]);
});

// Browser resume has no composition to watch: it registers from the payload
// alone. A part loaded by its own instance path finds the widget only because
// the definition carries the projection site composition wrote it under.
test('resume registers the projection site from the payload, with no render in sight', () => {
	const site = protocolInstanceSegment(9) + protocolInstanceSegment(2);
	const rootPath = `${site}${protocolInstanceSegment(0)}`;
	const graph = {
		read: (graphNodeId: string) => graphNodeId,
		listSharedDefinitions: () => [
			{
				id: `${rootPath}${DEFINITION}`,
				name: 'pwr',
				exportedName: 'pwr',
				scope: 'widget' as const,
				version: 0,
				graphNodeIds: [`${rootPath}${CELL}`],
				projectionIds: [`${site}${DEFINITION}`],
			},
		],
	};
	const scoped = marklessInstanceScopedGraph(graph as never, partPath(site)) as unknown as {
		readonly read: (graphNodeId: string) => unknown;
	};

	expect(scoped.read(CELL)).toBe(`${rootPath}${CELL}`);
});
