import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, held: createHeldInputsPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// Each run settles the way the test says, after it was started.
function scriptedRuns() {
	const settles: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
	return {
		settles,
		run: () => new Promise((resolve, reject) => settles.push({ resolve, reject })),
	};
}

function pricesGraph(run: () => unknown) {
	return createRuntimeGraph({
		cells: [{ graphNodeId: 'state:currency', value: 'eur' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:prices',
				dependencies: [{ graphNodeId: 'state:currency', path: [] }],
				key: (read) => read('state:currency'),
				run,
			},
		],
	} as never);
}

test('a failed refresh keeps the last good value and the key it was fetched for', async () => {
	const runs = scriptedRuns();
	const graph = pricesGraph(runs.run);
	graph.read('computed:prices', ['status']);
	runs.settles[0]!.resolve({ total: 12 });
	await tick();

	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	runs.settles[1]!.reject(new Error('rates down'));
	await tick();

	expect(graph.read('computed:prices', ['status'])).toBe('rejected');
	expect(graph.read('computed:prices', ['total'])).toBe(12);
	expect(graph.read('computed:prices', [])).toMatchObject({ key: 'usd', valueKey: 'eur' });
});

test('a first-load failure has no value to keep', async () => {
	const runs = scriptedRuns();
	const graph = pricesGraph(runs.run);
	graph.read('computed:prices', ['status']);
	runs.settles[0]!.reject(new Error('rates down'));
	await tick();

	expect(graph.read('computed:prices', ['status'])).toBe('rejected');
	expect(graph.read('computed:prices', ['total'])).toBeUndefined();
	expect('valueKey' in (graph.read('computed:prices', []) as object)).toBe(false);
});

test('rerun re-runs a rejected value with its unchanged key, and leaves a settled one alone', async () => {
	const runs = scriptedRuns();
	const graph = pricesGraph(runs.run);
	graph.read('computed:prices', ['status']);
	runs.settles[0]!.reject(new Error('rates down'));
	await tick();

	expect(graph.rerun!('computed:prices')).toBe(true);
	expect(graph.read('computed:prices', ['status'])).toBe('pending');
	expect(runs.settles).toHaveLength(2);
	runs.settles[1]!.resolve({ total: 30 });
	await tick();
	expect(graph.read('computed:prices', ['total'])).toBe(30);

	expect(graph.rerun!('computed:prices')).toBe(false);
	expect(runs.settles).toHaveLength(2);
});
