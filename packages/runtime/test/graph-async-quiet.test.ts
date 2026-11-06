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

test('a write made outside markUserActionStart/End starts a quiet refresh', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.write({ graphNodeId: 'state:reload', value: 1 });
	expect(graph.read('computed:orders', []) as object).toMatchObject({ status: 'pending', quiet: true });
	runs.settles[1]!.resolve({ rows: [] });
	await tick();
	expect(graph.read('computed:orders', []) as object).toMatchObject({ status: 'fulfilled', quiet: true });
});

test('a write made inside markUserActionStart/End starts a loud refresh', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markUserActionStart!();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	graph.markUserActionEnd!();
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
	runs.settles[1]!.resolve({ rows: [] });
	await tick();
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
});

test('a write that stays loud across an await still counts as a user action', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markUserActionStart!();
	await Promise.resolve();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	graph.markUserActionEnd!();
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
});

test('nested marks (two concurrent handlers) only clear once the outer one ends', async () => {
	const runs = scriptedRuns();
	const graph = pollGraph(runs.run);
	graph.read('computed:orders', ['status']);
	runs.settles[0]!.resolve({ rows: [] });
	await tick();

	graph.markUserActionStart!();
	graph.markUserActionStart!();
	graph.markUserActionEnd!();
	graph.write({ graphNodeId: 'state:reload', value: 1 });
	expect(graph.read('computed:orders', []) as { quiet?: boolean }).not.toHaveProperty('quiet');
	graph.markUserActionEnd!();
});
