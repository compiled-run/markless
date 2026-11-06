import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '@markless/runtime';
import { createAsyncComputedPlane } from '@markless/runtime/graph-async';
import { marklessHandlerCatch } from '../src/fns/handler-catch.ts';
import { marklessCatchReset } from '../src/fns/catch-reset.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a handler's rejection fails only its boundary's gate, and reset clears it without refetching the value", async () => {
	let runs = 0;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:days', value: 7 }],
		asyncComputed: [
			{
				graphNodeId: 'computed:report',
				dependencies: [{ graphNodeId: 'state:days', path: [] }],
				key: (read) => read('state:days'),
				run: async () => {
					runs += 1;
					return { days: 7 };
				},
			},
			{
				graphNodeId: 'computed:gate',
				dependencies: [{ graphNodeId: 'computed:report', path: [] }],
				key: (read) => read('computed:report'),
				run: ({ read }) => [read('computed:report')],
			},
		],
	} as never);

	graph.read('computed:gate', ['status']);
	await tick();
	await tick();
	expect(graph.read('computed:gate', ['status'])).toBe('fulfilled');
	expect(runs).toBe(1);

	marklessHandlerCatch(graph, 'computed:gate', new Error('could not save 7'));
	expect(graph.read('computed:gate', ['status'])).toBe('rejected');
	expect((graph.read('computed:gate', []) as { error: Error }).error.message).toBe('could not save 7');
	expect(graph.read('computed:report', ['status'])).toBe('fulfilled');
	expect(graph.read('computed:report', ['days'])).toBe(7);

	marklessCatchReset(graph, [['computed:report'], ['computed:gate', 'computed:report']]);
	await tick();
	await tick();
	expect(graph.read('computed:gate', ['status'])).toBe('fulfilled');
	expect(runs).toBe(1);
});

test('without a graph that can fail a handler, marklessHandlerCatch is a no-op rather than throwing', () => {
	expect(() => marklessHandlerCatch(undefined, 'computed:report', new Error('boom'))).not.toThrow();
});
