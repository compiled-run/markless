import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import {
	assertAsyncNodeMove,
	moveNode,
	NODE_BLOCKED,
	NODE_IDLE,
	NODE_PLANNED,
	NODE_RUNNING,
	NODE_RUNNING_ON_SHOWN,
	NODE_SETTLED,
	type AsyncNodePhase,
} from '../src/graph-async-load.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

const graphOf: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, held: createHeldInputsPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const phases: AsyncNodePhase[] = [
	NODE_IDLE,
	NODE_PLANNED,
	NODE_RUNNING,
	NODE_RUNNING_ON_SHOWN,
	NODE_SETTLED,
	NODE_BLOCKED,
];

// The allowed moves, written out from the lifecycle rather than read from the code under test.
const legal: Record<AsyncNodePhase, ReadonlyArray<AsyncNodePhase>> = {
	[NODE_IDLE]: [NODE_RUNNING, NODE_SETTLED, NODE_BLOCKED],
	[NODE_PLANNED]: [NODE_PLANNED, NODE_RUNNING, NODE_RUNNING_ON_SHOWN, NODE_BLOCKED],
	[NODE_RUNNING]: [NODE_RUNNING, NODE_RUNNING_ON_SHOWN, NODE_SETTLED, NODE_BLOCKED],
	[NODE_RUNNING_ON_SHOWN]: [NODE_RUNNING, NODE_RUNNING_ON_SHOWN, NODE_SETTLED, NODE_BLOCKED],
	[NODE_SETTLED]: [NODE_PLANNED, NODE_RUNNING, NODE_RUNNING_ON_SHOWN, NODE_SETTLED, NODE_BLOCKED],
	[NODE_BLOCKED]: [NODE_PLANNED, NODE_RUNNING, NODE_RUNNING_ON_SHOWN, NODE_BLOCKED],
};

type Run = {
	readonly key: unknown;
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: unknown) => void;
};

function scripted() {
	const runs: Run[] = [];
	return {
		runs,
		run: ({ key }: { key: unknown }) =>
			new Promise((resolve, reject) => runs.push({ key, resolve, reject })),
	};
}

type Graph = ReturnType<typeof graphOf>;
const phaseOf = (graph: Graph, id: string) => graph.asyncPlane!()!.nodes.get(id)!.phase;

function single(initialSnapshot?: unknown) {
	const runner = scripted();
	const graph = graphOf({
		cells: [{ graphNodeId: 'state:id', value: 1 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:id', path: [] }],
				key: (read) => read('state:id'),
				run: runner.run,
				...(initialSnapshot !== undefined && { initialSnapshot }),
			},
		],
	} as never);
	return { graph, runner, plane: graph.asyncPlane!()! };
}

function chained(ordersSnapshot?: unknown) {
	const user = scripted();
	const orders = scripted();
	const graph = graphOf({
		cells: [{ graphNodeId: 'state:id', value: 1 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:id', path: [] }],
				key: (read) => read('state:id'),
				run: user.run,
			},
			{
				graphNodeId: 'computed:orders',
				dependencies: [{ graphNodeId: 'computed:user', path: ['name'] }],
				key: (read) => read('computed:user', ['name']),
				run: orders.run,
				...(ordersSnapshot !== undefined && { initialSnapshot: ordersSnapshot }),
			},
		],
	} as never);
	return { graph, user, orders, plane: graph.asyncPlane!()! };
}

async function settledChain() {
	const setup = chained();
	setup.graph.read('computed:orders', ['status']);
	setup.user.runs[0]!.resolve({ name: 'ada' });
	await tick();
	await setup.graph.flush();
	setup.orders.runs[0]!.resolve(['tea']);
	await tick();
	return setup;
}

async function settledRevenue(boundaryGate = false) {
	const revenue = scripted();
	const converted = scripted();
	const graph = graphOf({
		cells: [
			{ graphNodeId: 'state:range', value: '10d' },
			{ graphNodeId: 'state:currency', value: 'eur' },
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:revenue',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: revenue.run,
			},
			{
				graphNodeId: 'computed:perDay',
				...(boundaryGate && { boundaryGate: true }),
				dependencies: [
					{ graphNodeId: 'computed:revenue', path: ['total'] },
					{ graphNodeId: 'state:range', path: [] },
					{ graphNodeId: 'state:currency', path: [] },
				],
				key: (read) => [
					read('computed:revenue', ['total']),
					read('state:range'),
					read('state:currency'),
				],
				run: converted.run,
			},
		],
	} as never);
	graph.read('computed:perDay', ['status']);
	revenue.runs[0]!.resolve({ total: 10000 });
	await tick();
	converted.runs[0]!.resolve('€1,000');
	await tick();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_SETTLED);
	return { graph, revenue, converted };
}

async function runningOnShown(boundaryGate = false) {
	const setup = await settledRevenue(boundaryGate);
	setup.graph.write({ graphNodeId: 'state:range', value: '20d' });
	await setup.graph.flush();
	expect(phaseOf(setup.graph, 'computed:perDay')).toBe(NODE_BLOCKED);
	setup.graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await setup.graph.flush();
	expect(phaseOf(setup.graph, 'computed:perDay')).toBe(NODE_RUNNING_ON_SHOWN);
	return setup;
}

test('the move check allows exactly the lifecycle table', () => {
	for (const from of phases)
		for (const to of phases) {
			if (legal[from].includes(to)) expect(() => assertAsyncNodeMove(from, to)).not.toThrow();
			else
				expect(() => assertAsyncNodeMove(from, to)).toThrow(
					`Illegal async node phase move ${from} -> ${to}`,
				);
		}
});

test('an illegal move throws in development and leaves the phase alone', () => {
	expect(import.meta.env.DEV).toBe(true);
	const { plane } = single();
	const node = plane.nodes.get('computed:user')!;
	for (const to of [NODE_IDLE, NODE_PLANNED, NODE_RUNNING_ON_SHOWN]) {
		expect(() => moveNode(node, to)).toThrow(
			`Illegal async node phase move ${NODE_IDLE} -> ${to}`,
		);
		expect(node.phase).toBe(NODE_IDLE);
	}
});

test('initial phase: idle, planned for a payload-planned pending value, settled for a served one', () => {
	expect(phaseOf(single().graph, 'computed:user')).toBe(NODE_IDLE);
	expect(phaseOf(single({ status: 'pending', version: 1, key: 1 }).graph, 'computed:user')).toBe(
		NODE_PLANNED,
	);
	expect(
		phaseOf(
			single({ status: 'fulfilled', version: 1, key: 1, value: 'a' }).graph,
			'computed:user',
		),
	).toBe(NODE_SETTLED);
	expect(
		phaseOf(
			single({ status: 'rejected', version: 1, key: 1, error: 'x' }).graph,
			'computed:user',
		),
	).toBe(NODE_SETTLED);
});

test('idle -> running on first read', () => {
	const { graph } = single();
	graph.read('computed:user', ['status']);
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_RUNNING);
});

test('idle -> blocked when its async input is pending', () => {
	const { graph } = chained();
	graph.read('computed:orders', ['status']);
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_RUNNING);
});

test('idle -> settled on a handler rejection', () => {
	const { graph, plane } = single();
	plane.failHandler('computed:user', new Error('handler'));
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_SETTLED);
});

test('planned -> running on demand, on the key it already has', () => {
	const { graph, runner } = single({ status: 'pending', version: 1, key: 1 });
	graph.read('computed:user', ['status']);
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_RUNNING);
	expect(runner.runs.map((run) => run.key)).toEqual([1]);
});

test('planned -> planned on a handler rejection', () => {
	const { graph, plane } = single({ status: 'pending', version: 1, key: 1 });
	plane.failHandler('computed:user', new Error('handler'));
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_PLANNED);
});

test('planned -> blocked when its async input is pending', () => {
	const { graph } = chained({ status: 'pending', version: 1, key: 'ada' });
	graph.read('computed:orders', ['status']);
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
});

test('running -> running when the key moves', () => {
	const { graph, runner } = single();
	graph.read('computed:user', ['status']);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	return graph.flush().then(() => {
		expect(phaseOf(graph, 'computed:user')).toBe(NODE_RUNNING);
		expect(runner.runs).toHaveLength(2);
	});
});

for (const outcome of ['fulfils', 'rejects'] as const)
	test(`running -> settled when the run ${outcome}`, async () => {
		const { graph, runner } = single();
		graph.read('computed:user', ['status']);
		if (outcome === 'fulfils') runner.runs[0]!.resolve('a');
		else runner.runs[0]!.reject(new Error('offline'));
		await tick();
		expect(phaseOf(graph, 'computed:user')).toBe(NODE_SETTLED);
	});

test('running -> settled on a handler rejection', () => {
	const { graph, plane } = single();
	graph.read('computed:user', ['status']);
	plane.failHandler('computed:user', new Error('handler'));
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_SETTLED);
});

test('running -> blocked when its async input starts again', async () => {
	const { graph, user } = chained();
	graph.read('computed:orders', ['status']);
	user.runs[0]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_RUNNING);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
});

test('running -> running on shown inputs when an async input refreshes while its own key moved', async () => {
	const { graph } = await settledRevenue();
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING);
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING_ON_SHOWN);
});

test('settled -> running on shown inputs when its input refreshes and its own key moves in one flush', async () => {
	const { graph } = await settledRevenue();
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING_ON_SHOWN);
});

test('blocked -> running on shown inputs, and running on shown -> running on shown when its key moves again', async () => {
	const { graph, converted } = await runningOnShown();
	graph.write({ graphNodeId: 'state:currency', value: 'gbp' });
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING_ON_SHOWN);
	expect(converted.runs).toHaveLength(3);
});

test('running on shown -> blocked when its run lands', async () => {
	const { graph, converted } = await runningOnShown();
	converted.runs[1]!.resolve('$1,100');
	await tick();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_BLOCKED);
});

test('running on shown -> settled when its run rejects', async () => {
	const { graph, converted } = await runningOnShown();
	converted.runs[1]!.reject(new Error('rate'));
	await tick();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_SETTLED);
});

test('running on shown -> settled on a handler rejection', async () => {
	const { graph } = await runningOnShown();
	graph.asyncPlane!()!.failHandler('computed:perDay', new Error('handler'));
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_SETTLED);
});

test('running on shown -> running once its input lands on a new key', async () => {
	const { graph, revenue } = await runningOnShown();
	revenue.runs[1]!.resolve({ total: 30000 });
	await tick();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING);
});

test('running on shown -> blocked when its input fails under a @try gate', async () => {
	const { graph, revenue } = await runningOnShown(true);
	revenue.runs[1]!.reject(new Error('offline'));
	await tick();
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_BLOCKED);
	expect(graph.read('computed:perDay', ['status'])).toBe('rejected');
});

test('settled -> running when the key moves', async () => {
	const { graph, runner } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_RUNNING);
});

test('settled -> planned -> running on rerun of a rejected value', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.reject(new Error('offline'));
	await tick();
	expect(plane.rerun('computed:user')).toBe(true);
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_RUNNING);
	expect(runner.runs.map((run) => run.key)).toEqual([1, 1]);
});

test('settled -> settled on a handler rejection', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	plane.failHandler('computed:user', new Error('handler'));
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_SETTLED);
});

test('settled -> blocked when its async input starts again', async () => {
	const { graph } = await settledChain();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
});

test('settled -> planned on rerun, which stays planned while its run on shown inputs is already answered, then runs once the input lands', async () => {
	const { graph, revenue, converted } = await runningOnShown();
	converted.runs[1]!.reject(new Error('rate'));
	await tick();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_SETTLED);
	const plane = graph.asyncPlane!()!;
	expect(plane.rerun('computed:perDay')).toBe(true);
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_PLANNED);
	graph.read('computed:perDay', ['status']);
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_PLANNED);
	expect(converted.runs).toHaveLength(2);
	revenue.runs[1]!.resolve({ total: 30000 });
	await tick();
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING);
	expect(converted.runs[2]?.key).toEqual([30000, '20d', 'usd']);
});

async function plannedOnShown() {
	const setup = await runningOnShown();
	setup.converted.runs[1]!.reject(new Error('rate'));
	await tick();
	expect(setup.graph.asyncPlane!()!.rerun('computed:perDay')).toBe(true);
	expect(phaseOf(setup.graph, 'computed:perDay')).toBe(NODE_PLANNED);
	return setup;
}

test('planned -> planned on another rerun', async () => {
	const { graph, converted } = await plannedOnShown();
	expect(graph.asyncPlane!()!.rerun('computed:perDay')).toBe(true);
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_PLANNED);
	expect(converted.runs).toHaveLength(2);
});

test('planned -> running on shown inputs when its own key moves again', async () => {
	const { graph, converted } = await plannedOnShown();
	graph.write({ graphNodeId: 'state:currency', value: 'gbp' });
	await graph.flush();
	expect(phaseOf(graph, 'computed:perDay')).toBe(NODE_RUNNING_ON_SHOWN);
	expect(converted.runs[2]?.key).toEqual([10000, '10d', 'gbp']);
});

test('blocked -> running once its input lands, even on the same key', async () => {
	const { graph, user, orders } = await settledChain();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	user.runs[1]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_RUNNING);
	expect(orders.runs.map((run) => run.key)).toEqual(['ada', 'ada']);
});

test('blocked -> blocked when its input moves from pending to rejected and back', async () => {
	const { graph, user, plane } = chained();
	graph.read('computed:orders', ['status']);
	user.runs[0]!.reject(new Error('offline'));
	await tick();
	await graph.flush();
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
	expect(graph.read('computed:orders', ['status'])).toBe('rejected');
	plane.rerun('computed:user');
	await graph.flush();
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
	expect(graph.read('computed:orders', ['status'])).toBe('pending');
});

test('blocked -> planned -> blocked on rerun while its input is still rejected', async () => {
	const { graph, user, plane } = chained();
	graph.read('computed:orders', ['status']);
	user.runs[0]!.reject(new Error('offline'));
	await tick();
	await graph.flush();
	const version = graph.read('computed:orders', ['version']) as number;
	expect(plane.rerun('computed:orders')).toBe(true);
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
	expect(graph.read('computed:orders', ['version'])).toBe(version + 1);
});

test('blocked -> blocked on a handler rejection', () => {
	const { graph, plane } = chained();
	graph.read('computed:orders', ['status']);
	plane.failHandler('computed:orders', new Error('handler'));
	expect(phaseOf(graph, 'computed:orders')).toBe(NODE_BLOCKED);
});

test('an entry mark and its end leave the phase alone', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	plane.markEntry('computed:user');
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_SETTLED);
	plane.endEntry('computed:user');
	await graph.flush();
	expect(phaseOf(graph, 'computed:user')).toBe(NODE_SETTLED);
});
