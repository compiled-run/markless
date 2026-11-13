import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Each run settles the way the test says, after it was started.
function scriptedRuns() {
	const settles: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
	return {
		settles,
		run: () => new Promise((resolve, reject) => settles.push({ resolve, reject })),
	};
}

function pollGraph(run: () => unknown) {
	return createRuntimeGraph({
		cells: [{ graphNodeId: 'state:reload', value: 0 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:orders',
				dependencies: [{ graphNodeId: 'state:reload', path: [] }],
				key: (read) => read('state:reload'),
				run,
			},
		],
	} as never);
}

test('a write made outside any quiet turn starts a loud refresh', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.write({ graphNodeId: 'state:reload', value: 1 });
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
	runs.settles[1]!.resolve({ rows: [] });
	await tick();
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
});

test('a write made inside markQuietStart/End starts a quiet refresh', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markQuietStart!();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	graph.markQuietEnd!();
	expect(graph.read('computed:orders', []) as object).toMatchObject({ status: 'pending', quiet: true });
	runs.settles[1]!.resolve({ rows: [] });
	await tick();
	expect(graph.read('computed:orders', []) as object).toMatchObject({ status: 'fulfilled', quiet: true });
});

test('a quiet turn held across an await keeps the write after it quiet', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markQuietStart!();
	await Promise.resolve();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	graph.markQuietEnd!();
	expect(graph.read('computed:orders', []) as object).toMatchObject({ quiet: true });
});

test('nested quiet turns (two overlapping ticks) only end once the outer one ends', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markQuietStart!();
	graph.markQuietStart!();
	graph.markQuietEnd!();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	expect(graph.read('computed:orders', []) as object).toMatchObject({ quiet: true });
	graph.markQuietEnd!();
	expect(graph.isQuiet!()).toBe(false);
});

test('writes in one turn start one refresh, loud when any of them was made outside a quiet turn', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markQuietStart!();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	graph.markQuietEnd!();
	graph.write({ graphNodeId: 'state:reload', value: 2 });
	await Promise.resolve();
	expect(runs.settles).toHaveLength(2);
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
});

function chainGraph(depot: () => unknown, route: () => unknown) {
	return createRuntimeGraph({
		cells: [{ graphNodeId: 'state:region', value: 'north' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:depot',
				dependencies: [{ graphNodeId: 'state:region', path: [] }],
				key: (read) => read('state:region'),
				run: depot,
			},
			{
				graphNodeId: 'computed:route',
				dependencies: [{ graphNodeId: 'computed:depot', path: ['value'] }],
				key: (read) => read('computed:depot', ['value']),
				run: route,
			},
		],
	} as never);
}

async function settledChain() {
	const depot = scriptedRuns();
	const route = scriptedRuns();
	const graph = chainGraph(depot.run, route.run);
	graph.read('computed:route', ['status']);
	depot.settles[0]!.resolve('north-depot');
	await tick();
	route.settles[0]!.resolve('north-route');
	await tick();
	return { graph, depot, route };
}

test('a quiet answer landing outside the tick refreshes the values reading it quietly too', async () => {
	const { graph, depot } = await settledChain();

	graph.markQuietStart!();
	graph.write({ graphNodeId: 'state:region', value: 'south' });
	graph.markQuietEnd!();
	await tick();
	depot.settles.at(-1)!.resolve('south-depot');
	await tick();
	expect(graph.read('computed:route', []) as object).toMatchObject({ status: 'pending', quiet: true });
});

test('a loud answer landing inside a quiet turn still refreshes the values reading it loudly', async () => {
	const { graph, depot } = await settledChain();

	graph.write({ graphNodeId: 'state:region', value: 'south' });
	await tick();
	graph.markQuietStart!();
	depot.settles.at(-1)!.resolve('south-depot');
	await tick();
	graph.markQuietEnd!();
	expect(graph.read('computed:route', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
	expect(graph.read('computed:route', ['status'])).toBe('pending');
});

// A @try gate joins the block's values and fetches nothing, so its own pending never marks content busy.
function gateGraph(first: () => unknown, gate: () => unknown) {
	return createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:version', value: 0 },
			{ graphNodeId: 'state:more', value: 0 },
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:first',
				dependencies: [{ graphNodeId: 'state:version', path: [] }],
				key: (read) => read('state:version'),
				run: first,
			},
			{
				graphNodeId: 'computed:gate',
				boundaryGate: true,
				dependencies: [
					{ graphNodeId: 'computed:first', path: ['value'] },
					{ graphNodeId: 'state:more', path: [] },
				],
				key: (read) => [read('computed:first', ['value']), read('state:more')],
				run: gate,
			},
		],
	} as never);
}

test('a @try gate re-run by a write to a sync input is quiet', async () => {
	const first = scriptedRuns();
	const gate = scriptedRuns();
	const graph = gateGraph(first.run, gate.run);
	graph.read('computed:gate', ['status']);
	first.settles[0]!.resolve({ rows: [] });
	await tick();
	await graph.flush();
	gate.settles[0]!.resolve([]);
	await tick();
	expect(graph.read('computed:gate', ['status'])).toBe('fulfilled');

	graph.write({ graphNodeId: 'state:more', value: 1 });
	await graph.flush();
	expect(graph.read('computed:gate', []) as object).toMatchObject({ status: 'pending', quiet: true });
});

test('a @try gate waiting on a loud refresh is quiet while the value it joins stays loud', async () => {
	const first = scriptedRuns();
	const gate = scriptedRuns();
	const graph = gateGraph(first.run, gate.run);
	graph.read('computed:gate', ['status']);
	first.settles[0]!.resolve({ rows: [] });
	await tick();
	await graph.flush();
	gate.settles[0]!.resolve([]);
	await tick();

	graph.write({ graphNodeId: 'state:version', value: 1 });
	await graph.flush();
	expect(graph.read('computed:first', []) as object).toMatchObject({ status: 'pending' });
	expect(graph.read('computed:first', []) as object).not.toHaveProperty('quiet');
	expect(graph.read('computed:gate', []) as object).toMatchObject({ status: 'pending', quiet: true });
});

test('a @try gate held by a save stays loud, so the whole block is marked with the reload', async () => {
	const first = scriptedRuns();
	const gate = scriptedRuns();
	const graph = gateGraph(first.run, gate.run);
	graph.read('computed:gate', ['status']);
	first.settles[0]!.resolve({ rows: [] });
	await tick();
	await graph.flush();
	gate.settles[0]!.resolve([]);
	await tick();

	graph.asyncPlane!()!.markEntry('computed:gate', true);
	expect(graph.read('computed:gate', []) as object).toMatchObject({ status: 'pending' });
	expect(graph.read('computed:gate', []) as object).not.toHaveProperty('quiet');
});
