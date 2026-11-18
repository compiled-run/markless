import { afterEach, expect, test, vi } from 'vitest';
import {
	createRuntimeGraph,
	type AsyncComputedPlane,
	type AsyncComputedPlaneInternals,
	type RuntimeGraph,
} from '../src/index.ts';

// Pins when the flush scheduler runs passes: which microtask, in what order, and
// what hasPendingFlush, holds and the user-action latch answer around each step.

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Queues `count` chained microtasks, each logging its tick: an event logged before
// `tick:n` ran in a microtask queued before that tick was.
function markTicks(log: string[], count: number): void {
	let tick = 0;
	const step = () => {
		log.push(`tick:${++tick}`);
		if (tick < count) queueMicrotask(step);
	};
	queueMicrotask(step);
}

function flushGraph() {
	const log: string[] = [];
	let internals!: AsyncComputedPlaneInternals;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:a', value: 0 },
			{ graphNodeId: 'state:b', value: 0 },
		],
		async: (given) => {
			internals = given;
			return {
				nodes: new Map(),
				wrote() {},
				shownRead: () => undefined,
			} as unknown as AsyncComputedPlane;
		},
	}) as RuntimeGraph & Required<Pick<RuntimeGraph, 'holdFlush' | 'hasPendingFlush'>>;
	for (const graphNodeId of ['state:a', 'state:b'])
		graph.subscribe({
			id: `dom-update:${graphNodeId}`,
			graphNodeId,
			run: (value) => {
				log.push(`run:${graphNodeId}=${String(value)}`);
				return { type: 'setText', locator: graphNodeId, value };
			},
		});
	const journaled: unknown[][] = [];
	graph.subscribeJournal((entries) => {
		journaled.push(entries.map((entry) => (entry as { value: unknown }).value));
		log.push(
			`journal:${entries.map((entry) => (entry as { value: unknown }).value).join(',')}`,
		);
	});
	return { graph, log, journaled, internals: () => internals };
}

let microtasks: ReturnType<typeof vi.spyOn> | undefined;
const countMicrotasks = () => (microtasks = vi.spyOn(globalThis, 'queueMicrotask'));
afterEach(() => {
	microtasks?.mockRestore();
	microtasks = undefined;
});

test('idle: nothing is pending and no microtask is queued', async () => {
	const { graph, log } = flushGraph();
	const queued = countMicrotasks();

	expect(graph.hasPendingFlush()).toBe(false);
	await macrotask();

	expect(queued).not.toHaveBeenCalled();
	expect(log).toEqual([]);
});

test('idle -> scheduled: a write queues one microtask and pends, running nothing yet', () => {
	const { graph, log } = flushGraph();
	const queued = countMicrotasks();

	graph.write({ graphNodeId: 'state:a', value: 1 });
	graph.write({ graphNodeId: 'state:b', value: 1 });
	graph.write({ graphNodeId: 'state:a', value: 2 });

	expect(queued).toHaveBeenCalledTimes(1);
	expect(graph.hasPendingFlush()).toBe(true);
	expect(log).toEqual([]);
});

test('scheduled -> running -> tail -> idle: the pass runs in the write microtask, in subscribe order', async () => {
	const { graph, log } = flushGraph();

	graph.write({ graphNodeId: 'state:b', value: 1 });
	graph.write({ graphNodeId: 'state:a', value: 1 });
	markTicks(log, 4);
	await macrotask();

	expect(log).toEqual([
		'run:state:a=1',
		'run:state:b=1',
		'journal:1,1',
		'tick:1',
		'tick:2',
		'tick:3',
		'tick:4',
	]);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('hasPendingFlush answers true while running and through a synchronous tail, false once settled', async () => {
	const answers: string[] = [];
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:a', value: 0 }] });
	graph.subscribe({
		id: 'dom-update:a',
		graphNodeId: 'state:a',
		run: (value) => {
			answers.push(`running:${graph.hasPendingFlush!()}`);
			return { type: 'setText', locator: 'a', value };
		},
	});
	graph.subscribeJournal(() => {
		answers.push(`tail:${graph.hasPendingFlush!()}`);
	});

	answers.push(`idle:${graph.hasPendingFlush!()}`);
	graph.write({ graphNodeId: 'state:a', value: 1 });
	answers.push(`scheduled:${graph.hasPendingFlush!()}`);
	const pass = graph.flush();
	answers.push(`after-call:${graph.hasPendingFlush!()}`);
	await pass;
	answers.push(`settled:${graph.hasPendingFlush!()}`);

	expect(answers).toEqual([
		'idle:false',
		'scheduled:true',
		'running:true',
		'tail:true',
		'after-call:true',
		'settled:false',
	]);
});

test('scheduled + held: the microtask runs nothing and the graph stays pending', async () => {
	const { graph, log } = flushGraph();
	const queued = countMicrotasks();

	graph.write({ graphNodeId: 'state:a', value: 1 });
	const release = graph.holdFlush();
	await macrotask();
	graph.write({ graphNodeId: 'state:b', value: 1 });
	await macrotask();

	expect(log).toEqual([]);
	expect(graph.hasPendingFlush()).toBe(true);
	expect(queued).toHaveBeenCalledTimes(1);
	release();
	await macrotask();
	expect(log).toEqual(['run:state:a=1', 'run:state:b=1', 'journal:1,1']);
});

test('held -> running: the last release queues the pass one microtask on', async () => {
	const { graph, log } = flushGraph();

	const first = graph.holdFlush();
	const second = graph.holdFlush();
	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();
	const queued = countMicrotasks();
	first();
	expect(queued).not.toHaveBeenCalled();
	second();
	expect(queued).toHaveBeenCalledTimes(1);
	expect(log).toEqual([]);
	markTicks(log, 2);
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'journal:1', 'tick:1', 'tick:2']);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('a release with nothing scheduled queues no microtask', async () => {
	const { graph, log } = flushGraph();
	const release = graph.holdFlush();
	const queued = countMicrotasks();

	release();
	await macrotask();

	expect(queued).not.toHaveBeenCalled();
	expect(log).toEqual([]);
});

test('a hold taken during a pass keeps the next scheduled pass back', async () => {
	const { graph, log } = flushGraph();
	let release: (() => void) | undefined;
	graph.subscribe({
		id: 'hold:a',
		graphNodeId: 'state:a',
		run: () => void (release ??= graph.holdFlush()),
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();
	graph.write({ graphNodeId: 'state:b', value: 1 });
	await macrotask();
	expect(log).toEqual(['run:state:a=1', 'journal:1']);
	release!();
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'journal:1', 'run:state:b=1', 'journal:1']);
});

test('explicit flush from idle runs an empty pass that settles', async () => {
	const { graph, log } = flushGraph();

	await graph.flush();

	expect(log).toEqual([]);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('explicit flush while scheduled runs synchronous subscriptions and listeners before it returns', async () => {
	const { graph, log } = flushGraph();

	graph.write({ graphNodeId: 'state:a', value: 1 });
	const pass = graph.flush();
	log.push('returned');
	markTicks(log, 3);
	await pass;
	log.push('awaited');
	await macrotask();

	expect(log).toEqual([
		'run:state:a=1',
		'journal:1',
		'returned',
		'tick:1',
		'tick:2',
		'tick:3',
		'awaited',
	]);
});

test('explicit flush while held runs, and the release afterwards runs nothing more', async () => {
	const { graph, log } = flushGraph();

	const release = graph.holdFlush();
	graph.write({ graphNodeId: 'state:a', value: 1 });
	await graph.flush();
	expect(log).toEqual(['run:state:a=1', 'journal:1']);
	release();
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'journal:1']);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('flush called during a pass answers that same pass', async () => {
	const { graph } = flushGraph();
	const passes: Promise<void>[] = [];
	graph.subscribe({
		id: 'reflush:a',
		graphNodeId: 'state:a',
		run: () => void passes.push(graph.flush()),
	});
	graph.subscribeJournal(() => void passes.push(graph.flush()));

	graph.write({ graphNodeId: 'state:a', value: 1 });
	const outer = graph.flush();
	await outer;

	expect(passes).toHaveLength(2);
	expect(passes[0]).toBe(outer);
	expect(passes[1]).toBe(outer);
});

test('write during running stays in the pass: the loop picks it up before the journal', async () => {
	const { graph, log } = flushGraph();
	graph.subscribe({
		id: 'chain:a',
		graphNodeId: 'state:a',
		run: (value) => void graph.write({ graphNodeId: 'state:b', value }),
	});
	graph.write({ graphNodeId: 'state:a', value: 1 });
	const queued = countMicrotasks();
	markTicks(log, 3);
	await macrotask();

	expect(log).toEqual([
		'run:state:a=1',
		'run:state:b=1',
		'journal:1,1',
		'tick:1',
		'tick:2',
		'tick:3',
	]);
	expect(queued).toHaveBeenCalledTimes(3);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('write during the tail re-arms: one microtask from the write, one from the pass end, then a second pass', async () => {
	const { graph, log, journaled } = flushGraph();
	let wrote = false;
	graph.subscribeJournal(() => {
		if (wrote) return;
		wrote = true;
		log.push(`tail-write:pending=${graph.hasPendingFlush()}`);
		graph.write({ graphNodeId: 'state:b', value: 2 });
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await Promise.resolve();
	const queued = countMicrotasks();
	markTicks(log, 6);
	await macrotask();

	expect(log).toEqual([
		'run:state:a=1',
		'journal:1',
		'tail-write:pending=true',
		'tick:1',
		'tick:2',
		'tick:3',
		'run:state:b=2',
		'journal:2',
		'tick:4',
		'tick:5',
		'tick:6',
	]);
	expect(journaled).toEqual([[1], [2]]);
	expect(queued).toHaveBeenCalledTimes(8);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('writes during the tail arm once', async () => {
	const { graph, log } = flushGraph();
	let wrote = false;
	let queuedInTail = -1;
	graph.subscribeJournal(() => {
		if (wrote) return;
		wrote = true;
		const queued = vi.spyOn(globalThis, 'queueMicrotask');
		graph.write({ graphNodeId: 'state:b', value: 2 });
		graph.write({ graphNodeId: 'state:a', value: 3 });
		graph.write({ graphNodeId: 'state:b', value: 4 });
		queuedInTail = queued.mock.calls.length;
		queued.mockRestore();
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();

	expect(queuedInTail).toBe(1);
	expect(log).toEqual([
		'run:state:a=1',
		'journal:1',
		'run:state:a=3',
		'run:state:b=4',
		'journal:3,4',
	]);
});

test('a write during a held tail waits for the release', async () => {
	const { graph, log } = flushGraph();
	let release: (() => void) | undefined;
	graph.subscribeJournal(() => {
		if (release) return;
		release = graph.holdFlush();
		graph.write({ graphNodeId: 'state:b', value: 2 });
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();
	await macrotask();
	expect(log).toEqual(['run:state:a=1', 'journal:1']);
	expect(graph.hasPendingFlush()).toBe(true);
	release!();
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'journal:1', 'run:state:b=2', 'journal:2']);
	expect(graph.hasPendingFlush()).toBe(false);
});

test('a release during the tail of a re-armed pass queues the next pass', async () => {
	const { graph, log } = flushGraph();
	const release = graph.holdFlush();
	let wrote = false;
	graph.subscribeJournal(() => {
		if (wrote) return;
		wrote = true;
		graph.write({ graphNodeId: 'state:b', value: 2 });
		const queued = vi.spyOn(globalThis, 'queueMicrotask');
		release();
		log.push(`release-queued:${queued.mock.calls.length}`);
		queued.mockRestore();
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await graph.flush();
	await macrotask();

	expect(log).toEqual([
		'run:state:a=1',
		'journal:1',
		'release-queued:1',
		'run:state:b=2',
		'journal:2',
	]);
});

test('write observers hear writes outside a pass and in its tail, never while it runs', async () => {
	const { graph, log } = flushGraph();
	const heard: string[] = [];
	graph.subscribeWrite!({
		graphNodeId: 'state:b',
		run: () => void heard.push(String(graph.read('state:b'))),
	});
	graph.subscribe({
		id: 'chain:a',
		graphNodeId: 'state:a',
		run: (value) =>
			void graph.write({ graphNodeId: 'state:b', value: `running-${String(value)}` }),
	});
	let tailWrote = true;
	graph.subscribeJournal(() => {
		if (tailWrote) return;
		tailWrote = true;
		graph.write({ graphNodeId: 'state:b', value: 'tail' });
	});

	graph.write({ graphNodeId: 'state:b', value: 'idle' });
	await macrotask();
	tailWrote = false;
	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();

	expect(heard).toEqual(['idle', 'tail']);
	expect(log).toEqual([
		'run:state:b=idle',
		'journal:idle',
		'run:state:a=1',
		'run:state:b=running-1',
		'journal:1,running-1',
		'run:state:b=tail',
		'journal:tail',
	]);
});

test('a rejecting subscription still ends the pass: the next write flushes on its own', async () => {
	const { graph, log } = flushGraph();
	let throws = true;
	graph.subscribe({
		id: 'throw:a',
		graphNodeId: 'state:a',
		run: async () => {
			if (throws) throw new Error('subscription failed');
		},
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await expect(graph.flush()).rejects.toThrow('subscription failed');
	expect(graph.hasPendingFlush()).toBe(false);
	throws = false;
	graph.write({ graphNodeId: 'state:b', value: 1 });
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'run:state:b=1', 'journal:1,1']);
});

