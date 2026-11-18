import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';
import { createDerivedReconcilePlane } from '../src/graph-reconcile.ts';

// A value blocked on an async input that re-runs runs again once the input settles, also when the answer is the same.

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({
		async: createAsyncComputedPlane,
		held: createHeldInputsPlane,
		reconcile: createDerivedReconcilePlane,
		...input,
	});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scriptedRuns() {
	const settles: Array<{ key: unknown; resolve: (value: unknown) => void }> = [];
	return {
		settles,
		run: ({ key }: { key: unknown }) =>
			new Promise((resolve) => settles.push({ key, resolve })),
	};
}

// `gate` reads all of `people`, as a @try's own gate reads the values it shows; reconcile on, as in the browser.
async function settledGate() {
	const people = scriptedRuns();
	const gate = scriptedRuns();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:team', value: 'blue' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:people',
				dependencies: [{ graphNodeId: 'state:team', path: [] }],
				key: (read) => read('state:team'),
				run: people.run,
			},
			{
				graphNodeId: 'computed:gate',
				dependencies: [{ graphNodeId: 'computed:people', path: ['value'] }],
				key: (read) => read('computed:people', ['value']),
				run: gate.run,
			},
		],
	} as never);
	graph.read('computed:gate', ['status']);
	people.settles[0]!.resolve(['Ada']);
	await tick();
	gate.settles[0]!.resolve('shown');
	await tick();
	return { graph, people, gate };
}

const status = (graph: { read(id: string, path: string[]): unknown }) =>
	graph.read('computed:gate', ['status']);

test('a refresh after a click’s save that answers the same data settles the value waiting on it', async () => {
	const { graph, people, gate } = await settledGate();
	const plane = graph.asyncPlane!()!;
	const versions = new Map(
		['computed:people', 'computed:gate'].map((id) => [id, plane.nodes.get(id)!.version]),
	);
	let landed = false;
	void plane.refreshAfterWrite(versions).then(() => (landed = true));
	people.settles[1]!.resolve(['Ada']);
	await tick();
	gate.settles.at(-1)!.resolve('shown');
	await tick();
	expect(status(graph)).toBe('fulfilled');
	expect(landed).toBe(true);
});

test('a poll that asks again and gets the same data settles the value waiting on it', async () => {
	const { graph, people, gate } = await settledGate();
	const plane = graph.asyncPlane!()!;
	expect(plane.rerun('computed:people', true)).toBe(true);
	plane.rerun('computed:gate', true);
	people.settles.at(-1)!.resolve(['Ada']);
	await tick();
	gate.settles.at(-1)!.resolve('shown');
	await tick();
	expect(status(graph)).toBe('fulfilled');
});
