import { expect, test } from 'vitest';
import {
	marklessRowBoundCallbackId,
	marklessRowBoundGraphNodeId,
	marklessRowBoundPath,
	marklessRowBoundCallbackGraph,
	marklessRowLocal,
} from '../src/fns/row-bound-path.ts';
import { marklessRecordRowScope, marklessRowPath } from '../src/fns/instance-scope.ts';

// A part two edges down a projection, inside one keyed repeat: host ids spell it c1:r:<key>:c0:, instance paths c1:p2:<row>c0:.
const bound = {
	instancePath: 'c1:p2:c0:',
	rowPieces: [
		['c1:', 'c1:p2:', 0],
		['c0:', 'c0:', 1],
	] as const,
};

test('a keyed bound row takes the row the dispatching record names', () => {
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c1:r:5:c0:' })).toBe(
		'c1:p2:r:5:c0:',
	);
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c1:r:banana:c0:' })).toBe(
		'c1:p2:r:banana:c0:',
	);
});

test('outer instances and the part own rows around the matched edges stay out of the path', () => {
	expect(
		marklessRowBoundPath(bound, { marklessRowHostPath: 'm0:c3:r:k%3A1:c1:r:5:c0:r:inner:' }),
	).toBe('c1:p2:r:5:c0:');
	expect(
		marklessRowBoundPath(
			{ instancePath: 'c1:p2:c0:c4:', rowPieces: bound.rowPieces },
			{ marklessRowHostPath: 'c1:r:5:c0:' },
		),
	).toBe('c1:p2:r:5:c0:c4:');
});

test('a host path the row edges do not describe keeps the build-time path', () => {
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c2:r:5:c0:' })).toBe('c1:p2:c0:');
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: 'c1:c0:' })).toBe('c1:p2:c0:');
	expect(marklessRowBoundPath(bound, undefined)).toBe('c1:p2:c0:');
	expect(marklessRowBoundPath({ instancePath: 'c1:' }, { marklessRowHostPath: 'c1:r:5:' })).toBe(
		'c1:',
	);
});

test('only a row-local id takes the row; widget and page ids keep the row-free path', () => {
	expect(marklessRowBoundGraphNodeId('state:own', 'c1:p2:c0:', 'c1:p2:r:5:c0:')).toBe(
		'c1:p2:r:5:c0:state:own',
	);
	expect(marklessRowBoundGraphNodeId('shared:family/open', 'c1:p2:c0:', 'c1:p2:r:5:c0:')).toBe(
		'c1:p2:c0:shared:family/open',
	);
});

test('a forwarded record takes its row from the instance one edge above its host', () => {
	const scope = marklessRecordRowScope('c1:r:light:c0:c0:h0', undefined, true);
	expect(scope?.[0]?.withRows).toBe('c1:r:light:c0:');
	expect(marklessRowBoundPath(bound, { marklessRowHostPath: scope?.[0]?.withRows })).toBe(
		'c1:p2:r:light:c0:',
	);
	expect(marklessRecordRowScope('c1:r:light:c0:c0:h0')?.[0]?.withRows).toBe('c1:r:light:c0:c0:');
});

// The sidebar shape: a page's @for renders a component, which hands a callback to a child two edges down.
const rowComponent = {
	instancePath: 'c7:c2:',
	rowPieces: [
		['c0:', 'c7:', 1],
		['c0:', 'c2:', 0],
	] as const,
};

test('a callback prop answers in the row of the component that wrote it', () => {
	const graph = { marklessRowHostPath: 'r:two:c0:c0:' };
	expect(marklessRowBoundCallbackId(rowComponent, graph, 'c7:symbol:2')).toBe(
		'r:two:c7:symbol:2',
	);
	expect(marklessRowBoundCallbackId(rowComponent, graph, 'c7:c2:symbol:4')).toBe(
		'r:two:c7:c2:symbol:4',
	);
});

test('a callback with no row to take keeps the id the instance path already gives it', () => {
	expect(marklessRowBoundCallbackId(rowComponent, undefined, 'c7:symbol:2')).toBe('c7:symbol:2');
	expect(
		marklessRowBoundCallbackId(
			rowComponent,
			{ marklessRowHostPath: 'r:two:c0:c0:' },
			'symbol:2',
		),
	).toBe('symbol:2');
	expect(
		marklessRowBoundCallbackId(
			rowComponent,
			{ marklessRowHostPath: 'r:two:c0:c0:', marklessInstancePath: 'r:two:' },
			'c7:symbol:2',
		),
	).toBe('r:two:c7:symbol:2');
});

test("a callback written by the module whose @for row holds the edge runs in that module's space", () => {
	expect(
		marklessRowBoundCallbackId(rowComponent, { marklessInstancePath: 'r:two:' }, 'symbol:2'),
	).toBe('symbol:2');
	expect(
		marklessRowBoundCallbackId(rowComponent, { marklessInstancePath: 'c3:r:two:r:a:' }, 'symbol:2'),
	).toBe('c3:symbol:2');
});

// Two nested keyed @for loops place one component: the inner rows of every outer row share one parent, so the item is found by key.
const GROUPS = [
	{ name: 'a', items: [{ id: 'x' }, { id: 'y w' }] },
	{ name: 'b', items: [{ id: 'x' }, { id: 'y w' }] },
];
const nestedRows = { instancePath: 'c0:', rowPieces: [['c0:', 'c0:', 2]] as const };
const groupGraph = (host: string) => ({
	marklessRowHostPath: host,
	read: (graphNodeId: string) => (graphNodeId === 'computed:groups' ? GROUPS : undefined),
});
const outerStep = { rowIndex: 0, keyPath: ['name'], graphNodeId: 'computed:groups', collectionPath: [] };
const innerStep = { rowIndex: 1, keyPath: ['id'], itemPath: ['items'] };

test('an item in nested rows is the one each row key names, outermost first', () => {
	const graph = groupGraph('r:b:r:y%20w:c0:');
	expect(marklessRowLocal(nestedRows, graph, { rowPiece: 0, rows: [outerStep] })).toBe(GROUPS[1]);
	expect(marklessRowLocal(nestedRows, graph, { rowPiece: 0, rows: [outerStep, innerStep] })).toBe(
		GROUPS[1]!.items[1],
	);
});

test('a row key that names no item, or a path the rows do not describe, answers undefined', () => {
	const route = { rowPiece: 0, rows: [outerStep, innerStep] };
	expect(marklessRowLocal(nestedRows, groupGraph('r:c:r:x:c0:'), route)).toBeUndefined();
	expect(marklessRowLocal(nestedRows, groupGraph('r:b:c0:'), route)).toBeUndefined();
	expect(marklessRowLocal(nestedRows, groupGraph('r:b:r:x:c1:'), route)).toBeUndefined();
});

test('an index-keyed row names its item by position', () => {
	const graph = groupGraph('r:1:r:0:c0:');
	const byIndex = { rowIndex: 0, keyPath: [], indexKey: true as const, graphNodeId: 'computed:groups' };
	expect(marklessRowLocal(nestedRows, graph, { rowPiece: 0, rows: [byIndex, innerStep] })).toBeUndefined();
	expect(
		marklessRowLocal(nestedRows, graph, {
			rowPiece: 0,
			rows: [byIndex, { rowIndex: 1, keyPath: [], indexKey: true as const, itemPath: ['items'] }],
		}),
	).toBe(GROUPS[1]!.items[0]);
});

test('a placed child takes a segment for every keyed row around it', () => {
	const outer = { repeatId: 'repeat:0', repeatKey: 'b' };
	expect(marklessRowPath({ repeatId: 'repeat:1', repeatKey: 'y w', repeatOuter: outer })).toBe(
		'r:b:r:y%20w:',
	);
	expect(marklessRowPath({ repeatId: 'repeat:1', repeatKey: 'x', repeatOuter: { repeatId: 'repeat:0' } })).toBeUndefined();
	expect(marklessRowPath({})).toBe('');
});

// A page's @for places Group, Group places Leaf twice, and Leaf's callback is called from Press one edge further down.
const pressRow = {
	instancePath: 'c3:c2:c0:',
	rowPieces: [
		['c0:', 'c3:', 1],
		['c1:', 'c2:', 0],
		['c0:', 'c0:', 0],
	] as const,
};

test("a callback's own keyed row reads its rows from the instance that wrote it", () => {
	const graph = marklessRowBoundCallbackGraph(pressRow, { marklessRowHostPath: 'r:b:c0:c1:c0:' }, 2);
	expect(graph.marklessRowHostPath).toBe('r:b:c0:c1:');
	expect(
		marklessRowBoundPath(
			{ instancePath: 'c3:c2:', rowPieces: pressRow.rowPieces.slice(0, 2) },
			graph,
		),
	).toBe('r:b:c3:c2:');
});

test('a host path the handler row does not describe is handed on unchanged', () => {
	const graph = { marklessRowHostPath: 'r:b:c0:c1:c4:' };
	expect(marklessRowBoundCallbackGraph(pressRow, graph, 2)).toBe(graph);
	expect(marklessRowBoundCallbackGraph({ instancePath: 'c3:' }, graph, 0)).toBe(graph);
});
