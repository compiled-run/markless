import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';
import {
	createDerivedReconcilePlane,
	type DerivedReconcilePlaneFactory,
} from '../src/graph-reconcile.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const IDLE = 0;

let unhandled: unknown[] = [];
const recordUnhandled = (reason: unknown) => void unhandled.push(reason);

beforeAll(() => {
	(globalThis as { __MARKLESS_DEBUG_ENABLED__?: boolean }).__MARKLESS_DEBUG_ENABLED__ = true;
});
afterAll(() => {
	delete (globalThis as { __MARKLESS_DEBUG_ENABLED__?: boolean }).__MARKLESS_DEBUG_ENABLED__;
});
beforeEach(() => {
	unhandled = [];
	process.on('unhandledRejection', recordUnhandled);
});
afterEach(() => {
	process.off('unhandledRejection', recordUnhandled);
});

function graphWithLog(options: { throwOnce?: Error; reconcile?: DerivedReconcilePlaneFactory } = {}) {
	const log: string[] = [];
	let throwOnce = options.throwOnce;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:a', value: 0 }],
		reconcile: options.reconcile,
	});
	graph.subscribe({
		id: 'dom-update:state:a',
		graphNodeId: 'state:a',
		run: (value) => {
			if (throwOnce) {
				const error = throwOnce;
				throwOnce = undefined;
				throw error;
			}
			log.push(`run:${String(value)}`);
			return { type: 'setText', locator: 'state:a', value };
		},
	});
	return { graph, log };
}

test('the graph checks its flush moves in this environment', () => {
	expect(import.meta.env.DEV).toBe(true);
});

test('a subscription that throws synchronously rejects the promise flush() returns', async () => {
	const boom = new Error('subscription boom');
	const { graph, log } = graphWithLog({ throwOnce: boom });

	graph.write({ graphNodeId: 'state:a', value: 1 });
	const pass = graph.flush();

	expect(pass).toBeInstanceOf(Promise);
	await expect(pass).rejects.toBe(boom);
	await macrotask();
	expect(unhandled).toEqual([]);
	expect(graph.peekFlushPhase!()).toBe(IDLE);

	graph.write({ graphNodeId: 'state:a', value: 2 });
	await macrotask();
	expect(log).toEqual(['run:2']);
});

test('settleBaselines throwing at the pass end surfaces its own error and leaves the flush idle', async () => {
	const boom = new Error('baseline boom');
	let settles = 0;
	const reconcile: DerivedReconcilePlaneFactory = (internals) => {
		const plane = createDerivedReconcilePlane(internals);
		return {
			...plane,
			settleBaselines() {
				plane.settleBaselines();
				if (settles++ === 0) throw boom;
			},
		};
	};
	const { graph, log } = graphWithLog({ reconcile });

	graph.write({ graphNodeId: 'state:a', value: 1 });
	await expect(graph.flush()).rejects.toBe(boom);
	await macrotask();
	expect(unhandled).toEqual([]);
	expect(graph.peekFlushPhase!()).toBe(IDLE);

	graph.write({ graphNodeId: 'state:a', value: 2 });
	await macrotask();
	expect(log).toEqual(['run:1', 'run:2']);
	expect(graph.hasPendingFlush!()).toBe(false);
});
