import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';
import { assertHoldMove, HOLD_ENDING, HOLD_MARKING } from '../src/graph-async-load.ts';

// Pins what an async value does through its life, as seen from reads, runs and abort signals.

const plain: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, ...input });
const held: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, held: createHeldInputsPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type Run = {
	readonly key: unknown;
	readonly signal: AbortSignal;
	readonly resolve: (value: unknown) => void;
	readonly reject: (error: unknown) => void;
};

function scripted() {
	const runs: Run[] = [];
	return {
		runs,
		run: ({ key, signal }: { key: unknown; signal: AbortSignal }) =>
			new Promise((resolve, reject) => runs.push({ key, signal, resolve, reject })),
	};
}

function single(options: { initialSnapshot?: unknown } = {}) {
	const runner = scripted();
	const graph = plain({
		cells: [{ graphNodeId: 'state:id', value: 1 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:id', path: [] }],
				key: (read) => read('state:id'),
				run: runner.run,
				...(options.initialSnapshot !== undefined && {
					initialSnapshot: options.initialSnapshot,
				}),
			},
		],
	} as never);
	return { graph, runner, plane: graph.asyncPlane!()! };
}

function chained(boundaryGate = false) {
	const user = scripted();
	const orders = scripted();
	const graph = plain({
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
				...(boundaryGate && { boundaryGate: true }),
				dependencies: [{ graphNodeId: 'computed:user', path: ['name'] }],
				key: (read) => read('computed:user', ['name']),
				run: orders.run,
			},
		],
	} as never);
	return { graph, user, orders, plane: graph.asyncPlane!()! };
}

const snapshot = (graph: ReturnType<typeof plain>, id: string) =>
	graph.read(id, []) as Record<string, unknown>;

test('an idle value reads idle without a run until first read, then runs once and fulfils', async () => {
	const { graph, runner } = single();
	expect(runner.runs).toHaveLength(0);
	expect(graph.read('computed:user', ['status'])).toBe('pending');
	expect(runner.runs.map((run) => run.key)).toEqual([1]);
	expect(graph.read('computed:user', ['status'])).toBe('pending');
	expect(runner.runs).toHaveLength(1);
	runner.runs[0]!.resolve({ name: 'ada' });
	await tick();
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'fulfilled',
		version: 1,
		key: 1,
		value: { name: 'ada' },
	});
});

test('a payload-planned pending value starts its runner on first read, once, with the current key', async () => {
	const { graph, runner } = single({
		initialSnapshot: { status: 'pending', version: 3, key: 1 },
	});
	expect(runner.runs).toHaveLength(0);
	graph.read('computed:user', ['status']);
	expect(runner.runs.map((run) => run.key)).toEqual([1]);
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'pending',
		version: 4,
		key: 1,
	});
	graph.read('computed:user', ['status']);
	expect(runner.runs).toHaveLength(1);
	runner.runs[0]!.resolve('ok');
	await tick();
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'fulfilled',
		version: 4,
		key: 1,
		value: 'ok',
	});
});

test('a served settled value never runs on read', async () => {
	const { graph, runner } = single({
		initialSnapshot: { status: 'fulfilled', version: 2, key: 1, value: 'served' },
	});
	expect(graph.read('computed:user', ['value'])).toBe('served');
	graph.write({ graphNodeId: 'state:id', value: 1 });
	await graph.flush();
	expect(runner.runs).toHaveLength(0);
});

test('a write that leaves the key alone does not restart a run in flight or a settled one', async () => {
	const runner = scripted();
	const graph = plain({
		cells: [
			{ graphNodeId: 'state:id', value: 1 },
			{ graphNodeId: 'state:noise', value: 0 },
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [
					{ graphNodeId: 'state:id', path: [] },
					{ graphNodeId: 'state:noise', path: [] },
				],
				key: (read) => read('state:id'),
				run: runner.run,
			},
		],
	} as never);
	graph.read('computed:user', ['status']);
	graph.write({ graphNodeId: 'state:noise', value: 1 });
	await graph.flush();
	expect(runner.runs).toHaveLength(1);
	expect(runner.runs[0]!.signal.aborted).toBe(false);
	runner.runs[0]!.resolve('a');
	await tick();
	graph.write({ graphNodeId: 'state:noise', value: 2 });
	await graph.flush();
	expect(runner.runs).toHaveLength(1);
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'fulfilled',
		version: 1,
		value: 'a',
	});
});

test('a key change restarts: the old run aborts and its late settle is ignored', async () => {
	const { graph, runner } = single();
	graph.read('computed:user', ['status']);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(runner.runs.map((run) => run.key)).toEqual([1, 2]);
	expect(runner.runs[0]!.signal.aborted).toBe(true);
	expect(runner.runs[1]!.signal.aborted).toBe(false);
	runner.runs[0]!.resolve('stale');
	await tick();
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'pending',
		version: 2,
		key: 2,
	});
	runner.runs[1]!.resolve('fresh');
	await tick();
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'fulfilled',
		version: 2,
		key: 2,
		value: 'fresh',
	});
	runner.runs[0]!.reject(new Error('late'));
	await tick();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'fulfilled', value: 'fresh' });
});

test("a settled run's signal still aborts when the next run starts", async () => {
	const { graph, runner } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	expect(runner.runs[0]!.signal.aborted).toBe(false);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(runner.runs[0]!.signal.aborted).toBe(true);
});

test('a re-run keeps the last good value readable while pending and after a failure', async () => {
	const { graph, runner } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'pending',
		key: 2,
		value: 'a',
		valueKey: 1,
	});
	const error = new Error('offline');
	runner.runs[1]!.reject(error);
	await tick();
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'rejected',
		version: 2,
		key: 2,
		error,
		value: 'a',
		valueKey: 1,
	});
});

test('a run that throws synchronously rejects', async () => {
	const error = new Error('sync');
	const graph = plain({
		cells: [{ graphNodeId: 'state:id', value: 1 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:id', path: [] }],
				key: (read) => read('state:id'),
				run: () => {
					throw error;
				},
			},
		],
	} as never);
	graph.read('computed:user', ['status']);
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'rejected',
		version: 1,
		key: 1,
		error,
	});
});

test('rerun re-runs a rejected value on the same key, and only a rejected one unless revalidating', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	expect(plane.rerun('computed:user')).toBe(false);
	runner.runs[0]!.reject(new Error('offline'));
	await tick();
	expect(plane.rerun('computed:user', true)).toBe(false);
	expect(plane.rerun('computed:user')).toBe(true);
	expect(runner.runs.map((run) => run.key)).toEqual([1, 1]);
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'pending',
		key: 1,
		version: 2,
	});
	runner.runs[1]!.resolve('a');
	await tick();
	expect(plane.rerun('computed:user')).toBe(false);
	expect(plane.rerun('computed:user', true)).toBe(true);
	expect(runner.runs.map((run) => run.key)).toEqual([1, 1, 1]);
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'pending',
		quiet: true,
		value: 'a',
	});
	runner.runs[2]!.resolve('b');
	await tick();
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'fulfilled',
		version: 3,
		key: 1,
		value: 'b',
		quiet: true,
	});
});

test('a value whose async input is pending shows pending without running, then runs once the input lands', async () => {
	const { graph, user, orders } = chained();
	expect(graph.read('computed:orders', ['status'])).toBe('pending');
	expect(user.runs).toHaveLength(1);
	expect(orders.runs).toHaveLength(0);
	const blocked = snapshot(graph, 'computed:orders');
	graph.write({ graphNodeId: 'state:id', value: 1 });
	await graph.flush();
	expect(snapshot(graph, 'computed:orders')).toBe(blocked);
	user.runs[0]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	expect(orders.runs.map((run) => run.key)).toEqual(['ada']);
	orders.runs[0]!.resolve(['tea']);
	await tick();
	expect(snapshot(graph, 'computed:orders')).toMatchObject({
		status: 'fulfilled',
		key: 'ada',
		value: ['tea'],
	});
});

test('a value blocked by a rejected input takes its error, and the same error again publishes nothing', async () => {
	const { graph, user, orders } = chained();
	graph.read('computed:orders', ['status']);
	const error = new Error('offline');
	user.runs[0]!.reject(error);
	await tick();
	await graph.flush();
	expect(snapshot(graph, 'computed:orders')).toMatchObject({ status: 'rejected', error });
	expect(orders.runs).toHaveLength(0);
	const rejected = snapshot(graph, 'computed:orders');
	graph.read('computed:orders', ['status']);
	graph.write({ graphNodeId: 'state:id', value: 1 });
	await graph.flush();
	expect(snapshot(graph, 'computed:orders')).toBe(rejected);
});

test('a re-block on a settled value aborts its run and keeps its last good value', async () => {
	const { graph, user, orders } = chained();
	graph.read('computed:orders', ['status']);
	user.runs[0]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	orders.runs[0]!.resolve(['tea']);
	await tick();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(orders.runs[0]!.signal.aborted).toBe(true);
	expect(snapshot(graph, 'computed:orders')).toMatchObject({
		status: 'pending',
		key: 'ada',
		value: ['tea'],
		valueKey: 'ada',
	});
	user.runs[1]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	expect(orders.runs.map((run) => run.key)).toEqual(['ada', 'ada']);
});

for (const boundaryGate of [false, true])
	test(`a value blocked by a failed input goes pending while that input retries, then runs${boundaryGate ? ' (a @try gate)' : ''}`, async () => {
		const { graph, user, orders, plane } = chained(boundaryGate);
		graph.read('computed:orders', ['status']);
		user.runs[0]!.reject(new Error('offline'));
		await tick();
		await graph.flush();
		expect(graph.read('computed:orders', ['status'])).toBe('rejected');
		expect(plane.rerun('computed:user')).toBe(true);
		await graph.flush();
		expect(graph.read('computed:orders', ['status'])).toBe('pending');
		user.runs[1]!.resolve({ name: 'ada' });
		await tick();
		await graph.flush();
		expect(orders.runs.map((run) => run.key)).toEqual(['ada']);
		orders.runs[0]!.resolve(['tea']);
		await tick();
		expect(snapshot(graph, 'computed:orders')).toMatchObject({
			status: 'fulfilled',
			value: ['tea'],
		});
	});

test('rerun on a value blocked by a rejected input re-blocks it with a fresh snapshot', async () => {
	const { graph, user, orders, plane } = chained();
	graph.read('computed:orders', ['status']);
	const error = new Error('offline');
	user.runs[0]!.reject(error);
	await tick();
	await graph.flush();
	const before = snapshot(graph, 'computed:orders');
	expect(plane.rerun('computed:orders')).toBe(true);
	const after = snapshot(graph, 'computed:orders');
	expect(after).not.toBe(before);
	expect(after).toMatchObject({
		status: 'rejected',
		error,
		version: (before.version as number) + 1,
	});
	expect(orders.runs).toHaveLength(0);
});

test('a handler rejection publishes rejected over a run in flight, aborts it, and the run cannot land', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	const error = new Error('handler');
	plane.failHandler('computed:user', error);
	expect(runner.runs[1]!.signal.aborted).toBe(true);
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'rejected',
		version: 3,
		key: 2,
		error,
		value: 'a',
		valueKey: 1,
	});
	runner.runs[1]!.resolve('late');
	await tick();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'rejected', error });
	graph.write({ graphNodeId: 'state:noise', value: 1 });
	expect(plane.rerun('computed:user')).toBe(true);
	expect(runner.runs.map((run) => run.key)).toEqual([1, 2, 2]);
});

test('a handler rejection on an idle value settles it without a run', async () => {
	const { graph, runner, plane } = single();
	const error = new Error('handler');
	plane.failHandler('computed:user', error);
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'rejected',
		version: 1,
		key: undefined,
		error,
	});
	graph.read('computed:user', ['status']);
	expect(runner.runs).toHaveLength(0);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(runner.runs.map((run) => run.key)).toEqual([2]);
});

test('a handler rejection on a planned value keeps it planned: the next read still starts its runner', async () => {
	const { graph, runner, plane } = single({
		initialSnapshot: { status: 'pending', version: 1, key: 1 },
	});
	plane.failHandler('computed:user', new Error('handler'));
	expect(graph.read('computed:user', ['status'])).toBe('pending');
	expect(runner.runs.map((run) => run.key)).toEqual([1]);
});

test('a handler rejection on a blocked value keeps it blocked: the input landing still runs it', async () => {
	const { graph, user, orders, plane } = chained();
	graph.read('computed:orders', ['status']);
	plane.failHandler('computed:orders', new Error('handler'));
	expect(graph.read('computed:orders', ['status'])).toBe('rejected');
	user.runs[0]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	expect(orders.runs.map((run) => run.key)).toEqual(['ada']);
});

test('an entry mark shows a settled value busy and the last of its holders to end restores it when no run started', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	const settled = snapshot(graph, 'computed:user');
	plane.markEntry('computed:user');
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'pending',
		version: 2,
		key: 1,
		value: 'a',
		valueKey: 1,
	});
	plane.markEntry('computed:user');
	expect(snapshot(graph, 'computed:user')).toMatchObject({ version: 2 });
	// A second holder (a save sent by the same handler) keeps the mark until it ends too.
	plane.endEntry('computed:user');
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'pending', version: 2 });
	plane.endEntry('computed:user');
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toBe(settled);
	expect(runner.runs).toHaveLength(1);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(runner.runs.map((run) => run.key)).toEqual([1, 2]);
	expect(snapshot(graph, 'computed:user')).toMatchObject({
		status: 'pending',
		version: 3,
		key: 2,
	});
});

test('a mark with no write behind it ends at once, even while its own flush is still pending', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	await graph.flush();
	const settled = snapshot(graph, 'computed:user');
	plane.markEntry('computed:user');
	expect(graph.hasPendingFlush?.()).toBe(true);
	plane.endEntry('computed:user', true);
	expect(snapshot(graph, 'computed:user')).toBe(settled);
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toBe(settled);
	expect(runner.runs).toHaveLength(1);
});

test('a run that lands while a save holds the value is kept until the save ends, then superseded by a newer run', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	plane.markEntry('computed:user', true);
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	runner.runs[1]!.resolve('b');
	await tick();
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'pending', value: 'a' });
	plane.endEntry('computed:user', 'saved');
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'fulfilled', value: 'b' });
	expect(snapshot(graph, 'computed:user')).not.toHaveProperty('writeFailed');
});

test('a failed save on a value already loading tags the landing of that run, and only that one', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	plane.markEntry('computed:user', true);
	plane.endEntry('computed:user', 'failed');
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'pending' });
	runner.runs[0]!.resolve('a');
	await tick();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'fulfilled', value: 'a', writeFailed: true });
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	runner.runs[1]!.resolve('b');
	await tick();
	expect(snapshot(graph, 'computed:user')).not.toHaveProperty('writeFailed');
});

test('a save that sent the page elsewhere ends its mark silently, and a later failure still says so', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	plane.markEntry('computed:user', true);
	plane.endEntry('computed:user', 'left');
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'fulfilled', value: 'a', pageLeft: true });
	expect(snapshot(graph, 'computed:user')).not.toHaveProperty('writeFailed');
	plane.markEntry('computed:user', true);
	plane.endEntry('computed:user', 'failed');
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'fulfilled', writeFailed: true });
	expect(snapshot(graph, 'computed:user')).not.toHaveProperty('pageLeft');
});

test('a hold whose holders are gone with a run in flight is ending until that run lands, and a new holder makes it marking again', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	const node = plane.nodes.get('computed:user')!;
	plane.markEntry('computed:user', true);
	plane.endEntry('computed:user', 'failed');
	expect(node.entryHold).toMatchObject({ phase: HOLD_ENDING, holders: 0, writing: 0 });
	plane.markEntry('computed:user', true);
	expect(node.entryHold).toMatchObject({ phase: HOLD_MARKING, writing: 1 });
	plane.endEntry('computed:user', 'saved');
	expect(node.entryHold).toMatchObject({ phase: HOLD_ENDING });
	runner.runs[0]!.resolve('a');
	await tick();
	expect(node.entryHold).toBeUndefined();
	expect(snapshot(graph, 'computed:user')).toMatchObject({ status: 'fulfilled', writeFailed: true });
	expect(() => assertHoldMove(HOLD_ENDING, HOLD_ENDING)).toThrow(/no move/);
});

test('an entry mark whose handler wrote the key is replaced by the real run, loud, and its end changes nothing', async () => {
	const { graph, runner, plane } = single();
	graph.read('computed:user', ['status']);
	runner.runs[0]!.resolve('a');
	await tick();
	plane.markEntry('computed:user');
	graph.write({ graphNodeId: 'state:id', value: 2 });
	await graph.flush();
	expect(runner.runs.map((run) => run.key)).toEqual([1, 2]);
	const running = snapshot(graph, 'computed:user');
	expect(running).toMatchObject({ status: 'pending', version: 3, key: 2, value: 'a' });
	expect(running).not.toHaveProperty('quiet');
	plane.endEntry('computed:user');
	await graph.flush();
	expect(snapshot(graph, 'computed:user')).toBe(running);
	runner.runs[1]!.resolve('b');
	await tick();
	expect(snapshot(graph, 'computed:user')).toEqual({
		status: 'fulfilled',
		version: 3,
		key: 2,
		value: 'b',
	});
});

test('an entry mark on an idle or pending value does nothing', async () => {
	const { graph, runner, plane } = single();
	plane.markEntry('computed:user');
	expect(plane.nodes.get('computed:user')!.snapshot).toEqual({ status: 'idle', version: 0 });
	expect(runner.runs).toHaveLength(0);
	graph.read('computed:user', ['status']);
	const pending = snapshot(graph, 'computed:user');
	plane.markEntry('computed:user');
	expect(snapshot(graph, 'computed:user')).toBe(pending);
});

test('an entry mark on a rejected value blocked by its input restores it, and the input landing still runs it', async () => {
	const { graph, user, orders, plane } = chained();
	graph.read('computed:orders', ['status']);
	user.runs[0]!.reject(new Error('offline'));
	await tick();
	await graph.flush();
	const rejected = snapshot(graph, 'computed:orders');
	plane.markEntry('computed:orders');
	expect(graph.read('computed:orders', ['status'])).toBe('pending');
	plane.endEntry('computed:orders');
	await graph.flush();
	expect(snapshot(graph, 'computed:orders')).toBe(rejected);
	expect(plane.rerun('computed:user')).toBe(true);
	user.runs[1]!.resolve({ name: 'ada' });
	await tick();
	await graph.flush();
	expect(orders.runs.map((run) => run.key)).toEqual(['ada']);
});

function revenueGraph() {
	const revenue = scripted();
	const converted = scripted();
	const graph = held({
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
	return { graph, revenue, converted };
}

async function settledRevenue() {
	const setup = revenueGraph();
	setup.graph.read('computed:perDay', ['status']);
	setup.revenue.runs[0]!.resolve({ total: 10000 });
	await tick();
	setup.converted.runs[0]!.resolve('€1,000');
	await tick();
	return setup;
}

test('a run on shown inputs lands pending with its value, is not restarted for the same key, and re-runs once its input settles', async () => {
	const { graph, revenue, converted } = await settledRevenue();
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	expect(converted.runs).toHaveLength(1);
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(converted.runs.map((run) => run.key)).toEqual([
		[10000, '10d', 'eur'],
		[10000, '10d', 'usd'],
	]);
	expect(converted.runs[0]!.signal.aborted).toBe(true);
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(converted.runs).toHaveLength(2);
	converted.runs[1]!.resolve('$1,100');
	await tick();
	expect(snapshot(graph, 'computed:perDay')).toMatchObject({
		status: 'pending',
		value: '$1,100',
		valueKey: [10000, '10d', 'usd'],
	});
	graph.read('computed:perDay', ['status']);
	expect(converted.runs).toHaveLength(2);
	revenue.runs[1]!.resolve({ total: 30000 });
	await tick();
	expect(converted.runs[2]?.key).toEqual([30000, '20d', 'usd']);
	converted.runs[2]!.resolve('$1,650');
	await tick();
	expect(snapshot(graph, 'computed:perDay')).toMatchObject({
		status: 'fulfilled',
		value: '$1,650',
	});
});

test('a run on shown inputs that fails settles rejected and is not restarted for the same key', async () => {
	const { graph, converted } = await settledRevenue();
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	const error = new Error('rate');
	converted.runs[1]!.reject(error);
	await tick();
	expect(snapshot(graph, 'computed:perDay')).toMatchObject({
		status: 'rejected',
		error,
		value: '€1,000',
	});
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(converted.runs).toHaveLength(2);
});

test('a re-block while a run on shown inputs is in flight aborts it and its landing is ignored', async () => {
	const { graph, revenue, converted } = await settledRevenue();
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	const error = new Error('offline');
	revenue.runs[1]!.reject(error);
	await tick();
	await graph.flush();
	expect(converted.runs[1]!.signal.aborted).toBe(false);
	converted.runs[1]!.resolve('$1,100');
	await tick();
	expect(snapshot(graph, 'computed:perDay')).toMatchObject({
		status: 'pending',
		value: '$1,100',
	});
});

function pinnedPast(boundaryGate: boolean) {
	const items = scripted();
	const reader = scripted();
	const graph = held({
		cells: [
			{ graphNodeId: 'state:filter', value: '' },
			{ graphNodeId: 'state:page', value: 1 },
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:items',
				dependencies: [{ graphNodeId: 'state:filter', path: [] }],
				key: (read) => read('state:filter'),
				run: items.run,
			},
			{
				graphNodeId: 'computed:reader',
				...(boundaryGate && { boundaryGate: true }),
				dependencies: [
					{ graphNodeId: 'computed:items', path: ['value'] },
					{ graphNodeId: 'state:page', path: [] },
				],
				key: (read) => [read('computed:items', ['value']), read('state:page')],
				run: reader.run,
			},
		],
	} as never);
	return { graph, items, reader };
}

for (const boundaryGate of [false, true])
	test(`a reader pinned past a failed refresh ${boundaryGate ? 'is rejected when it is a @try gate' : 'keeps its value and runs on its pin when its own input moves'}`, async () => {
		const { graph, items, reader } = pinnedPast(boundaryGate);
		graph.read('computed:reader', ['status']);
		items.runs[0]!.resolve(['a']);
		await tick();
		reader.runs[0]!.resolve('page 1 of a');
		await tick();
		graph.write({ graphNodeId: 'state:filter', value: 'x' });
		await graph.flush();
		const error = new Error('offline');
		items.runs[1]!.reject(error);
		await tick();
		await graph.flush();
		expect(graph.read('computed:items', ['status'])).toBe('rejected');
		if (boundaryGate) {
			expect(snapshot(graph, 'computed:reader')).toMatchObject({ status: 'rejected', error });
			return;
		}
		expect(graph.read('computed:reader', ['status'])).not.toBe('rejected');
		graph.write({ graphNodeId: 'state:page', value: 2 });
		await graph.flush();
		expect(reader.runs.map((run) => run.key)).toEqual([
			[['a'], 1],
			[['a'], 2],
		]);
		reader.runs[1]!.resolve('page 2 of a');
		await tick();
		expect(graph.read('computed:reader', ['value'])).toBe('page 2 of a');
	});

test('a reader with no value of its own blocked past a failed refresh stays pending, and rerun refuses it', async () => {
	const { graph, items, reader } = pinnedPast(false);
	graph.read('computed:reader', ['status']);
	items.runs[0]!.resolve(['a']);
	await tick();
	reader.runs[0]!.reject(new Error('reader'));
	await tick();
	graph.write({ graphNodeId: 'state:filter', value: 'x' });
	await graph.flush();
	const blocked = snapshot(graph, 'computed:reader');
	expect(blocked).toMatchObject({ status: 'pending', version: 3, key: [['a'], 1] });
	items.runs[1]!.reject(new Error('offline'));
	await tick();
	await graph.flush();
	expect(snapshot(graph, 'computed:reader')).toBe(blocked);
	const plane = graph.asyncPlane!()!;
	expect(plane.rerun('computed:reader')).toBe(false);
	graph.read('computed:reader', ['status']);
	expect(reader.runs).toHaveLength(1);
});
