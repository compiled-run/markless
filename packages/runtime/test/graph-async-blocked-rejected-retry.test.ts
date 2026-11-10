import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, held: createHeldInputsPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scripted() {
	const settles: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> =
		[];
	return {
		settles,
		run: () => new Promise((resolve, reject) => settles.push({ resolve, reject })),
	};
}

function chainedGraph(boundaryGate: boolean) {
	const user = scripted();
	const orders = scripted();
	const graph = createRuntimeGraph({
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
	return { graph, user, orders };
}

for (const boundaryGate of [true, false])
	test(`an async value blocked by a failed input shows pending while that input retries${boundaryGate ? ' (a @try gate)' : ''}`, async () => {
		const { graph, user, orders } = chainedGraph(boundaryGate);
		graph.read('computed:orders', ['status']);
		user.settles[0]!.reject(new Error('offline'));
		await tick();
		await graph.flush();
		expect(graph.read('computed:orders', ['status'])).toBe('rejected');

		expect(graph.asyncPlane!()!.rerun('computed:user')).toBe(true);
		await graph.flush();
		expect(graph.read('computed:user', ['status'])).toBe('pending');
		expect(graph.read('computed:orders', ['status'])).toBe('pending');

		user.settles[1]!.resolve({ name: 'ada' });
		await tick();
		await graph.flush();
		expect(orders.settles).toHaveLength(1);
		orders.settles[0]!.resolve(['tea']);
		await tick();
		expect(graph.read('computed:orders', [])).toMatchObject({
			status: 'fulfilled',
			value: ['tea'],
		});
	});
