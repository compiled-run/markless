import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scriptedRuns() {
	const settles: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
	return {
		settles,
		run: () => new Promise((resolve, reject) => settles.push({ resolve, reject })),
	};
}

function quoteGraph(run: () => unknown) {
	return createRuntimeGraph({
		cells: [{ graphNodeId: 'state:id', value: 1 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:quote',
				dependencies: [{ graphNodeId: 'state:id', path: [] }],
				key: (read) => read('state:id'),
				run,
			},
		],
	} as never);
}

test('revalidating a fulfilled value re-runs it with the same key, quietly', async () => {
	const runs = scriptedRuns();
	const graph = quoteGraph(runs.run);
	graph.read('computed:quote', ['status']);
	runs.settles[0]!.resolve('first');
	await tick();

	expect(graph.asyncPlane!()!.rerun('computed:quote', true)).toBe(true);
	expect(runs.settles).toHaveLength(2);
	expect(graph.read('computed:quote', []) as object).toMatchObject({ status: 'pending', key: 1, quiet: true });
	runs.settles[1]!.resolve('second');
	await tick();
	expect(graph.read('computed:quote', []) as object).toMatchObject({
		status: 'fulfilled',
		value: 'second',
		quiet: true,
	});
});

test('a revalidation started inside a user action is still quiet', async () => {
	const runs = scriptedRuns();
	const graph = quoteGraph(runs.run);
	graph.read('computed:quote', ['status']);
	runs.settles[0]!.resolve('first');
	await tick();

	graph.markUserActionStart!();
	graph.asyncPlane!()!.rerun('computed:quote', true);
	graph.markUserActionEnd!();
	expect(graph.read('computed:quote', []) as object).toMatchObject({ status: 'pending', quiet: true });
});

test('revalidation refuses a value that is not fulfilled, and a reset still re-runs only a rejected one', async () => {
	const runs = scriptedRuns();
	const graph = quoteGraph(runs.run);
	graph.read('computed:quote', ['status']);
	expect(graph.asyncPlane!()!.rerun('computed:quote', true)).toBe(false);
	runs.settles[0]!.reject(new Error('down'));
	await tick();
	expect(graph.asyncPlane!()!.rerun('computed:quote', true)).toBe(false);
	expect(graph.asyncPlane!()!.rerun('computed:quote')).toBe(true);
	expect(runs.settles).toHaveLength(2);
});

test('a value a user action fetched is marked as such; a later quiet refresh of it is not', async () => {
	const runs = scriptedRuns();
	const graph = quoteGraph(runs.run);
	graph.read('computed:quote', ['status']);
	runs.settles[0]!.resolve('first');
	await tick();
	expect(graph.read('computed:quote', []) as object).not.toHaveProperty('action');

	graph.markUserActionStart!();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	graph.markUserActionEnd!();
	runs.settles[1]!.resolve('second');
	await tick();
	expect(graph.read('computed:quote', []) as object).toMatchObject({ status: 'fulfilled', action: true });

	graph.write({ graphNodeId: 'state:id', value: 3 });
	runs.settles[2]!.resolve('third');
	await tick();
	expect(graph.read('computed:quote', []) as object).not.toHaveProperty('action');
});

test('a value first fetched inside a user action stays marked through every later run', async () => {
	const runs = scriptedRuns();
	const graph = quoteGraph(runs.run);
	graph.markUserActionStart!();
	graph.read('computed:quote', ['status']);
	graph.markUserActionEnd!();
	runs.settles[0]!.resolve('draft');
	await tick();
	expect(graph.read('computed:quote', []) as object).toMatchObject({ status: 'fulfilled', action: true });

	graph.asyncPlane!()!.rerun('computed:quote', true);
	runs.settles[1]!.resolve('saved');
	await tick();
	expect(graph.read('computed:quote', []) as object).toMatchObject({
		status: 'fulfilled',
		value: 'saved',
		action: true,
	});
});
