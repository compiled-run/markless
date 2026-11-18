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

test('a revalidation started outside any quiet turn is still quiet', async () => {
	const runs = scriptedRuns();
	const graph = quoteGraph(runs.run);
	graph.read('computed:quote', ['status']);
	runs.settles[0]!.resolve('first');
	await tick();

	graph.asyncPlane!()!.rerun('computed:quote', true);
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
