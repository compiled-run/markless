import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/graph.ts';

test('dependency-only computed records do not scan dependencies during invalidation', async () => {
	let reads = 0;
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'counter', value: 0 }],
		computed: Array.from({ length: 100 }, (_, index) => ({
			graphNodeId: `served:${index}`,
			dependencies: [
				{
					get graphNodeId() {
						reads++;
						return 'counter';
					},
				},
			],
		})),
	});
	for (let value = 1; value <= 3; value++) {
		reads = 0;
		graph.write({ graphNodeId: 'counter', value });
		await graph.flush();
		expect(reads).toBe(0);
	}
});

test('a pull registered for a node runs once, before the next read of it answers', () => {
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'derived', value: 1 }] });
	let pulls = 0;
	graph.pullBeforeRead!('derived', () => {
		pulls++;
		graph.write({ graphNodeId: 'derived', value: 2 });
	});
	expect(pulls).toBe(0);
	expect(graph.read('derived')).toBe(2);
	expect(graph.read('derived')).toBe(2);
	expect(pulls).toBe(1);
});

test('the subscription count follows subscribe and release', () => {
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'count', value: 0 }] });
	expect(graph.subscriptionCount!('count')).toBe(0);
	const release = graph.subscribe({ id: 'a', graphNodeId: 'count', run() {} });
	graph.subscribe({ id: 'b', graphNodeId: 'count', run() {} });
	expect(graph.subscriptionCount!('count')).toBe(2);
	release();
	expect(graph.subscriptionCount!('count')).toBe(1);
});
