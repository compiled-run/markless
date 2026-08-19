import { expect, test } from 'vitest';
import type { SemanticComponentEdge } from '../src/artifacts.ts';
import {
	componentEdgeInstancePaths,
	componentEdgeInstanceSegment,
} from '../src/component-edge-instance.ts';

function edge(index: number, span: [number, number], importSource?: string): SemanticComponentEdge {
	return {
		id: `component-edge:${index}`,
		parentComponentName: 'Page',
		childComponentName: `Child${index}`,
		...(importSource ? { importSource } : {}),
		sourceSpan: { filename: 'src/Page.tsrx', start: span[0], end: span[1] },
		props: [],
		children: { childCount: 0 },
		branchScopeIds: [],
		keyedRepeatScopeIds: [],
	};
}

test('a projected child nests under the component it was projected into', () => {
	// <Root><Trigger/></Root><Other/>
	const edges = [edge(0, [0, 40], './ui'), edge(1, [10, 25], './ui'), edge(2, [50, 60], './ui')];
	const paths = componentEdgeInstancePaths(edges);

	expect(paths.get('component-edge:0')).toBe('c0:');
	expect(paths.get('component-edge:1')).toBe('c0:p1:');
	expect(paths.get('component-edge:2')).toBe('c2:');
});

test('a projected child never collides with the host component own edges', () => {
	const edges = [edge(0, [0, 40], './ui'), edge(1, [10, 25], './ui')];
	const projected = componentEdgeInstanceSegment(edges[1], edges);
	// Root's own second edge is numbered inside Root's module, so the page sees
	// it as 'c0:' + 'c1:'. The projected segment kind keeps the two apart.
	expect(projected).toBe('c0:p1:');
	expect(projected).not.toBe('c0:c1:');
});

test('a child declared in the same module carries no instance path', () => {
	const edges = [edge(0, [0, 40])];
	expect(componentEdgeInstanceSegment(edges[0], edges)).toBe('');
});

test('nested projection keeps one projected segment per enclosing component', () => {
	// <Root><Content><Item/></Content></Root>
	const edges = [edge(0, [0, 60], './ui'), edge(1, [10, 50], './ui'), edge(2, [20, 40], './ui')];
	const paths = componentEdgeInstancePaths(edges);

	expect(paths.get('component-edge:2')).toBe('c0:p1:p2:');
});
