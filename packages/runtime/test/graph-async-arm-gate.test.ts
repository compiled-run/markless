import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
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
