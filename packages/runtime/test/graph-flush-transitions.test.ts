import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { createRuntimeGraph, type RuntimeGraph } from '../src/index.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// The numbers peekFlushPhase answers.
const IDLE = 0;
const SCHEDULED = 1;
const RUNNING = 2;
const TAIL = 3;
const REARMED = 4;
const phases = [IDLE, SCHEDULED, RUNNING, TAIL, REARMED];
const legal: ReadonlyArray<readonly [number, number]> = [
	[IDLE, SCHEDULED],
	[IDLE, RUNNING],
	[SCHEDULED, RUNNING],
	[RUNNING, TAIL],
	[TAIL, REARMED],
	[TAIL, IDLE],
	[REARMED, IDLE],
];
const isLegal = (from: number, to: number) =>
	legal.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);

beforeAll(() => {
	(globalThis as { __MARKLESS_DEBUG_ENABLED__?: boolean }).__MARKLESS_DEBUG_ENABLED__ = true;
});
afterAll(() => {
	delete (globalThis as { __MARKLESS_DEBUG_ENABLED__?: boolean }).__MARKLESS_DEBUG_ENABLED__;
});

// Asserts the phase, then that every move out of it the table forbids throws and every one it allows passes.
function expectPhase(graph: RuntimeGraph, phase: number): void {
	expect(graph.peekFlushPhase!()).toBe(phase);
	for (const to of phases) {
		if (isLegal(phase, to)) expect(() => graph.checkFlushMove!(to)).not.toThrow();
		else
			expect(() => graph.checkFlushMove!(to)).toThrow(
				`Illegal flush phase move ${phase} -> ${to}`,
			);
	}
	expect(graph.peekFlushPhase!()).toBe(phase);
}

function graphWithLog() {
	const log: string[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:a', value: 0 },
			{ graphNodeId: 'state:b', value: 0 },
		],
	});
	for (const graphNodeId of ['state:a', 'state:b'])
		graph.subscribe({
			id: `dom-update:${graphNodeId}`,
			graphNodeId,
			run: (value) => {
				log.push(`run:${graphNodeId}=${String(value)}`);
				return { type: 'setText', locator: graphNodeId, value };
			},
		});
	return { graph, log, pending: () => graph.hasPendingFlush!() };
}

test('the graph checks its flush moves in this environment', () => {
	expect(import.meta.env.DEV).toBe(true);
	expect(legal).toHaveLength(7);
});

test('idle: a new graph has nothing pending', () => {
	const { graph, pending } = graphWithLog();

	expectPhase(graph, IDLE);
	expect(pending()).toBe(false);
});

test('idle -> scheduled: a write queues one microtask', () => {
	const { graph, pending } = graphWithLog();
	const queued = vi.spyOn(globalThis, 'queueMicrotask');

	graph.write({ graphNodeId: 'state:a', value: 1 });
	graph.write({ graphNodeId: 'state:a', value: 2 });

	expect(queued).toHaveBeenCalledTimes(1);
	queued.mockRestore();
	expectPhase(graph, SCHEDULED);
	expect(pending()).toBe(true);
});

test('scheduled -> running: the microtask starts the pass when nothing holds it', async () => {
	const { graph, log } = graphWithLog();
	const seen: number[] = [];
	graph.subscribe({
		id: 'phase:a',
		graphNodeId: 'state:a',
		run: () => void seen.push(graph.peekFlushPhase!()),
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await Promise.resolve();

	expect(log).toEqual(['run:state:a=1']);
	expect(seen).toEqual([RUNNING]);
});

test('scheduled stays scheduled while held, and the last release starts the pass', async () => {
	const { graph, log, pending } = graphWithLog();
	const first = graph.holdFlush!();
	const second = graph.holdFlush!();

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();
	expect(log).toEqual([]);
	expectPhase(graph, SCHEDULED);
	expect(pending()).toBe(true);
	first();
	await macrotask();
	expect(log).toEqual([]);
	second();
	await Promise.resolve();

	expect(log).toEqual(['run:state:a=1']);
	await macrotask();
	expectPhase(graph, IDLE);
});

test('idle -> running: an explicit flush starts a pass with nothing scheduled', async () => {
	const { graph, pending } = graphWithLog();
	let journaled = 0;
	graph.subscribeJournal(() => void journaled++);

	const pass = graph.flush();
	expectPhase(graph, TAIL);
	expect(pending()).toBe(true);
	await pass;

	expect(journaled).toBe(0);
	expectPhase(graph, IDLE);
});

test('scheduled -> running: an explicit flush ignores a hold', () => {
	const { graph, log } = graphWithLog();
	const release = graph.holdFlush!();
	const seen: number[] = [];
	graph.subscribe({
		id: 'phase:a',
		graphNodeId: 'state:a',
		run: () => void seen.push(graph.peekFlushPhase!()),
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	void graph.flush();

	expect(log).toEqual(['run:state:a=1']);
	expect(seen).toEqual([RUNNING]);
	release();
});

test('running: a write joins the pass, schedules nothing and hides from write observers', async () => {
	const { graph, log } = graphWithLog();
	const heard: unknown[] = [];
	graph.subscribeWrite!({
		graphNodeId: 'state:b',
		run: () => void heard.push(graph.read('state:b')),
	});
	graph.subscribe({
		id: 'chain:a',
		graphNodeId: 'state:a',
		run: (value) => {
			graph.write({ graphNodeId: 'state:b', value });
			expectPhase(graph, RUNNING);
		},
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	const queued = vi.spyOn(globalThis, 'queueMicrotask');
	await graph.flush();
	expect(queued).not.toHaveBeenCalled();
	queued.mockRestore();

	expect(log).toEqual(['run:state:a=1', 'run:state:b=1']);
	expect(heard).toEqual([]);
});

test('running -> tail: journal listeners run after the loop, still pending, with write observers back on', async () => {
	const { graph, log, pending } = graphWithLog();
	const heard: unknown[] = [];
	graph.subscribeWrite!({
		graphNodeId: 'state:b',
		run: () => void heard.push(graph.read('state:b')),
	});
	let tailWrote = false;
	graph.subscribeJournal(() => {
		if (tailWrote) return;
		tailWrote = true;
		expectPhase(graph, TAIL);
		log.push(`tail:pending=${pending()}`);
		graph.write({ graphNodeId: 'state:b', value: 'tail' });
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'tail:pending=true', 'run:state:b=tail']);
	expect(heard).toEqual(['tail']);
});

test('tail -> idle: a clean pass end settles and queues nothing', async () => {
	const { graph, pending } = graphWithLog();
	graph.write({ graphNodeId: 'state:a', value: 1 });
	await graph.flush();
	const queued = vi.spyOn(globalThis, 'queueMicrotask');

	await macrotask();

	expect(queued).not.toHaveBeenCalled();
	queued.mockRestore();
	expectPhase(graph, IDLE);
	expect(pending()).toBe(false);
});

test('tail -> rearmed -> idle -> scheduled: a tail write runs in a second pass nobody called', async () => {
	const { graph, log, pending } = graphWithLog();
	const tailFlushes: Promise<void>[] = [];
	const queue = globalThis.queueMicrotask;
	// The phase each microtask was queued in: the tail write's, then the pass end's re-arm.
	const queuedIn: number[] = [];
	let queued: { mockRestore(): void } | undefined;
	graph.subscribeJournal(() => {
		if (tailFlushes.length > 0) return;
		queued = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((task) => {
			queuedIn.push(graph.peekFlushPhase!());
			queue(task);
		});
		graph.write({ graphNodeId: 'state:b', value: 1 });
		graph.write({ graphNodeId: 'state:b', value: 2 });
		expectPhase(graph, REARMED);
		tailFlushes.push(graph.flush());
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	const first = graph.flush();
	await first;
	expect(tailFlushes[0]).toBe(first);
	await macrotask();
	queued!.mockRestore();

	expect(queuedIn).toEqual([REARMED, SCHEDULED]);
	expect(log).toEqual(['run:state:a=1', 'run:state:b=2']);
	expectPhase(graph, IDLE);
	expect(pending()).toBe(false);
});

test('rearmed: a release during the tail queues the next pass', async () => {
	const { graph, log } = graphWithLog();
	const release = graph.holdFlush!();
	let released = false;
	graph.subscribeJournal(() => {
		if (released) return;
		released = true;
		graph.write({ graphNodeId: 'state:b', value: 1 });
		release();
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await graph.flush();
	await macrotask();

	expect(log).toEqual(['run:state:a=1', 'run:state:b=1']);
	expectPhase(graph, IDLE);
});

test('a pass whose subscription rejects still reaches idle', async () => {
	const { graph, pending } = graphWithLog();
	graph.subscribe({
		id: 'reject:a',
		graphNodeId: 'state:a',
		run: async () => {
			throw new Error('rejected');
		},
	});

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await expect(graph.flush()).rejects.toThrow('rejected');

	expectPhase(graph, IDLE);
	expect(pending()).toBe(false);
});
