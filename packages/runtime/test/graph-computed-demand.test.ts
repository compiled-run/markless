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
