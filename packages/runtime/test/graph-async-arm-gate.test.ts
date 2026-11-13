import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { NODE_DROPPED, NODE_RUNNING, NODE_SETTLED, assertAsyncNodeMove } from '../src/graph-async-load.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

// A value an @if or @switch arm owns runs only while that arm shows: a write that closes the arm starts nothing,
// and dropping the closed arm's values aborts a run in flight and lets a reopen define them afresh.

type Run = { readonly key: unknown; readonly signal: AbortSignal; readonly resolve: (value: unknown) => void };

function gatedGraph() {
	const runs: Run[] = [];
	const asyncValue = (graphNodeId: string) => ({
		graphNodeId,
		dependencies: [{ graphNodeId: 'state:open', path: [] }],
		key: (read: (id: string) => unknown) => read('state:open'),
		run: ({ key, signal }: { key: unknown; signal: AbortSignal }) =>
			new Promise((resolve) => runs.push({ key, signal, resolve })),
	});
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:open', value: 1 }],
		asyncComputed: [asyncValue('c0:computed:item'), asyncValue('computed:outside')],
		async: createAsyncComputedPlane,
		held: createHeldInputsPlane,
	} as never);
	// The arm flips inside the pass, as a branch's test subscription does.
	let shows = true;
	graph.subscribe({ id: 'branch-test', graphNodeId: 'state:open', run: (open) => void (shows = open !== null) });
	graph.gateArms!((graphNodeId) => (graphNodeId.startsWith('c0:') ? shows : undefined));
	return { graph, runs, asyncValue };
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a write that closes the arm starts nothing for the value it owns, and still starts a value no arm owns', async () => {
	const { graph, runs } = gatedGraph();
	graph.read('c0:computed:item');
	graph.read('computed:outside');
	expect(runs.map((run) => run.key)).toEqual([1, 1]);
	graph.write({ graphNodeId: 'state:open', value: null });
	await graph.flush();
	await turn();
	expect(runs.map((run) => run.key)).toEqual([1, 1, null]);
	expect(graph.armShown!('c0:computed:item')).toBe(false);
	expect(graph.armShown!('computed:outside')).toBeUndefined();
});

test('a write that keeps the arm open starts the owned value once the pass has decided the arm', async () => {
	const { graph, runs } = gatedGraph();
	graph.read('c0:computed:item');
	graph.write({ graphNodeId: 'state:open', value: 2 });
	await graph.flush();
	await turn();
	expect(runs.map((run) => run.key)).toEqual([1, 2]);
	expect(runs[0]!.signal.aborted).toBe(true);
});

test('dropping a closed arm aborts its run in flight, lands nothing, and a reopen defines the value afresh', async () => {
	const { graph, runs, asyncValue } = gatedGraph();
	graph.read('c0:computed:item', ['status']);
	graph.asyncPlane!()!.drop((graphNodeId) => graphNodeId.startsWith('c0:'));
	expect(runs[0]!.signal.aborted).toBe(true);
	runs[0]!.resolve({ name: 'stale' });
	await turn();
	expect(graph.read('c0:computed:item', ['name'])).toBeUndefined();
	expect(graph.asyncPlane!()!.nodes.has('c0:computed:item')).toBe(false);
	// A write after the drop reaches nothing the arm owned.
	graph.write({ graphNodeId: 'state:open', value: 3 });
	await graph.flush();
	await turn();
	expect(runs).toHaveLength(1);
	expect(graph.defineAsyncComputed!(asyncValue('c0:computed:item') as never, createAsyncComputedPlane)).toBe(true);
	expect(graph.read('c0:computed:item', ['status'])).toBe('pending');
	expect(runs.map((run) => run.key)).toEqual([1, 3]);
});

test('a value a save marked and its arm then closed publishes nothing more, and the save ending reaches no reopened value', async () => {
	const { graph, runs, asyncValue } = gatedGraph();
	graph.read('c0:computed:item', ['status']);
	runs[0]!.resolve({ name: 'first' });
	await turn();
	const plane = graph.asyncPlane!()!;
	const dropped = plane.nodes.get('c0:computed:item')!;
	plane.markEntry('c0:computed:item', true);
	await turn();
	expect(dropped.snapshot.status).toBe('pending');
	plane.drop((graphNodeId) => graphNodeId.startsWith('c0:'));
	expect(dropped.phase).toBe(NODE_DROPPED);
	expect(dropped.entryHold).toBeUndefined();
	graph.defineAsyncComputed!(asyncValue('c0:computed:item') as never, createAsyncComputedPlane);
	graph.read('c0:computed:item', ['status']);
	runs.at(-1)!.resolve({ name: 'fresh' });
	await turn();
	const reopened = plane.nodes.get('c0:computed:item')!;
	const shown = reopened.snapshot;
	plane.endEntry('c0:computed:item', 'saved');
	await graph.flush();
	await turn();
	expect(reopened.snapshot).toBe(shown);
	expect(graph.read('c0:computed:item', ['name'])).toBe('fresh');
	expect(dropped.snapshot.status).toBe('pending');
});

test('a reload waiting on a re-asked value stops waiting once its arm closes', async () => {
	const { graph, runs } = gatedGraph();
	graph.read('c0:computed:item', ['status']);
	runs[0]!.resolve({ name: 'first' });
	await turn();
	const plane = graph.asyncPlane!()!;
	const node = plane.nodes.get('c0:computed:item')!;
	let done = false;
	void plane.refreshAfterWrite(new Map([['c0:computed:item', node.version]])).then(() => (done = true));
	await turn();
	expect(runs).toHaveLength(2);
	plane.drop((graphNodeId) => graphNodeId.startsWith('c0:'));
	await turn();
	expect(done).toBe(true);
	expect(runs[1]!.signal.aborted).toBe(true);
});

test('a dropped value never moves to another phase', () => {
	expect(() => assertAsyncNodeMove(NODE_DROPPED, NODE_RUNNING)).toThrow();
	expect(() => assertAsyncNodeMove(NODE_DROPPED, NODE_SETTLED)).toThrow();
	expect(() => assertAsyncNodeMove(NODE_RUNNING, NODE_DROPPED)).not.toThrow();
});
