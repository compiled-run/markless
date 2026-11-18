import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '@markless/runtime';
import { createAsyncComputedPlane } from '@markless/runtime/graph-async';
import { marklessCatchReset } from '../src/fns/catch-reset.ts';

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

// The compiler lists a block's async values upstream first, each followed by the async values it reads.
test('a reset through a derived value re-runs the rejected input it reads, once', async () => {
	const runs = scriptedRuns();
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:team', value: 'core' }],
		computed: [
			{
				graphNodeId: 'computed:headline',
				dependencies: [{ graphNodeId: 'computed:members', path: [] }],
				compute: (read: (id: string, path?: string[]) => unknown) => `${read('computed:members', ['length'])} people`,
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:members',
				dependencies: [{ graphNodeId: 'state:team', path: [] }],
				key: (read) => read('state:team'),
				run: runs.run,
			},
			{
				graphNodeId: 'computed:roster',
				dependencies: [{ graphNodeId: 'computed:members', path: [] }],
				key: (read) => read('computed:members', ['length']),
				run: async ({ read }: { read: (id: string, path?: string[]) => unknown }) => ({ size: read('computed:members', ['length']) }),
			},
		],
	} as never);
	graph.read('computed:roster', ['status']);
	runs.settles[0]!.reject(new Error('directory down'));
	await tick();
	await graph.flush();
	expect(graph.read('computed:roster', ['status'])).toBe('rejected');

	marklessCatchReset(graph, [['computed:members'], ['computed:roster', 'computed:members']]);
	expect(runs.settles).toHaveLength(2);
	runs.settles[1]!.resolve(['ada', 'lin']);
	await tick();
	await graph.flush();
	await tick();
	expect(graph.read('computed:roster', ['size'])).toBe(2);
	marklessCatchReset(graph, [['computed:members']]);
	expect(runs.settles).toHaveLength(2);
});
