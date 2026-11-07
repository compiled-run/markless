import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane, type RuntimeAsyncComputedNode } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

function instrumentedAsyncPlane() {
	let nodes: ReadonlyMap<string, RuntimeAsyncComputedNode> | undefined;
	const factory: typeof createAsyncComputedPlane = (internals, asyncComputed) => {
		const plane = createAsyncComputedPlane(internals, asyncComputed);
		nodes = plane.nodes;
		return plane;
	};
	return { factory, nodes: () => nodes! };
}

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ held: createHeldInputsPlane, ...input } as never);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scripted() {
	const runs: Array<{ key: unknown; resolve: (value: unknown) => void }> = [];
	return { runs, run: ({ key }: { key: unknown }) => new Promise((resolve) => runs.push({ key, resolve })) };
}

test('a source nobody pins keeps no old answer across 1,000 refreshes', async () => {
	const instrumented = instrumentedAsyncPlane();
	const prices = scripted();
	const graph = createRuntimeGraph({
		async: instrumented.factory,
		cells: [{ graphNodeId: 'state:currency', value: 'v0' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:prices',
				dependencies: [{ graphNodeId: 'state:currency', path: [] }],
				key: (read) => read('state:currency'),
				run: prices.run,
			},
		],
	} as never);

	graph.read('computed:prices', ['status']);
	prices.runs[0]!.resolve({ total: 0 });
	await tick();

	for (let i = 1; i <= 1000; i++) {
		graph.write({ graphNodeId: 'state:currency', value: `v${i}` });
		await graph.flush();
		prices.runs[i]!.resolve({ total: i });
		await tick();
	}

	expect(graph.read('computed:prices', ['total'])).toBe(1000);
	expect(instrumented.nodes().get('computed:prices')!.priorAnswers ?? []).toHaveLength(0);
});

test('a long-pinned reader keeps only the one answer it reads, across 200 unrelated refreshes of its sibling', async () => {
	const instrumented = instrumentedAsyncPlane();
	const revenue = scripted();
	const costs = scripted();
	const graph = createRuntimeGraph({
		async: instrumented.factory,
		cells: [
			{ graphNodeId: 'state:range', value: '10d' },
			{ graphNodeId: 'state:filter', value: 'f0' },
		],
		computed: [
			{
				graphNodeId: 'computed:profit',
				dependencies: [
					{ graphNodeId: 'computed:revenue', path: ['total'] },
					{ graphNodeId: 'computed:costs', path: ['total'] },
				],
				compute: (read: (id: string, path?: string[]) => unknown) =>
					(read('computed:revenue', ['total']) as number) - (read('computed:costs', ['total']) as number),
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:revenue',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: revenue.run,
			},
			{
				graphNodeId: 'computed:costs',
				dependencies: [
					{ graphNodeId: 'state:range', path: [] },
					{ graphNodeId: 'state:filter', path: [] },
				],
				key: (read) => [read('state:range'), read('state:filter')],
				run: costs.run,
			},
		],
	} as never);

	const costsNode = () => instrumented.nodes().get('computed:costs')!;

	// Both land at 10d/f0: no mismatch, nothing pinned yet.
	graph.read('computed:profit');
	revenue.runs[0]!.resolve({ total: 10000 });
	costs.runs[0]!.resolve({ total: 5000 });
	await tick();
	expect(graph.read('computed:profit')).toBe(5000);

	// revenue moves to 20d and never lands again; costs moves to 20d too (same shared input) and
	// keeps churning on an unrelated input (filter) after that. Reading profit pins both at 10d.
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	graph.read('computed:profit');

	costs.runs[1]!.resolve({ total: 10000 });
	await tick();
	expect(costsNode().priorAnswers).toHaveLength(1);
	expect(graph.read('computed:profit')).toBe(5000);

	for (let i = 1; i <= 200; i++) {
		graph.write({ graphNodeId: 'state:filter', value: `f${i}` });
		await graph.flush();
		costs.runs[costs.runs.length - 1]!.resolve({ total: 10000 + i });
		await tick();
		graph.read('computed:profit');

		expect(costsNode().priorAnswers).toHaveLength(1);
		expect(costsNode().priorAnswers![0]!.value).toMatchObject({ total: 5000 });
		expect(graph.read('computed:profit')).toBe(5000);
	}

	// revenue finally lands at 20d: nothing reads the 10d answer any more, so it is released at once.
	revenue.runs[1]!.resolve({ total: 30000 });
	await tick();
	expect(costsNode().priorAnswers ?? []).toHaveLength(0);
	expect(graph.read('computed:profit')).toBe(19800);
});

test('a source that outruns its sibling by two switches keeps only the answer the sibling still matches', async () => {
	const instrumented = instrumentedAsyncPlane();
	const revenue = scripted();
	const costs = scripted();
	const graph = createRuntimeGraph({
		async: instrumented.factory,
		cells: [{ graphNodeId: 'state:range', value: '10d' }],
		computed: [
			{
				graphNodeId: 'computed:profit',
				dependencies: [
					{ graphNodeId: 'computed:revenue', path: ['total'] },
					{ graphNodeId: 'computed:costs', path: ['total'] },
				],
				compute: (read: (id: string, path?: string[]) => unknown) =>
					(read('computed:revenue', ['total']) as number) - (read('computed:costs', ['total']) as number),
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:revenue',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: revenue.run,
			},
			{
				graphNodeId: 'computed:costs',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: costs.run,
			},
		],
	} as never);
	const costsNode = () => instrumented.nodes().get('computed:costs')!;

	graph.read('computed:profit');
	revenue.runs[0]!.resolve({ total: 10000 });
	costs.runs[0]!.resolve({ total: 5000 });
	await tick();

	for (const [range, total] of [
		['20d', 10000],
		['30d', 15000],
	] as const) {
		graph.write({ graphNodeId: 'state:range', value: range });
		await graph.flush();
		graph.read('computed:profit');
		costs.runs[costs.runs.length - 1]!.resolve({ total });
		await tick();
		expect(graph.read('computed:profit')).toBe(5000);
	}
	expect(costsNode().priorAnswers?.map((answer) => answer.value)).toEqual([{ total: 5000 }]);
});
