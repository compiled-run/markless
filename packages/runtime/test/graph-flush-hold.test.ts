import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function textGraph() {
	const texts: unknown[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:open', value: true },
			{ graphNodeId: 'state:closes', value: 0 },
		],
	});
	for (const graphNodeId of ['state:open', 'state:closes'])
		graph.subscribe({
			id: `dom-update:${graphNodeId}`,
			graphNodeId,
			run: (value) => ({ type: 'setText', locator: graphNodeId, value }),
		});
	graph.subscribeJournal((entries) => {
		texts.push(entries.map((entry) => (entry as { value: unknown }).value));
	});
	return { graph, texts };
}

test('a held graph lands the writes before and after the hold in one flush', async () => {
	const { graph, texts } = textGraph();

	graph.write({ graphNodeId: 'state:open', value: false });
	const release = graph.holdFlush!();
	await macrotask();
	expect(texts).toEqual([]);
	graph.write({ graphNodeId: 'state:closes', value: 1 });
	release();
	await macrotask();

	expect(texts).toEqual([[false, 1]]);
});

test('a flush held twice waits for both releases', async () => {
	const { graph, texts } = textGraph();

	const first = graph.holdFlush!();
	const second = graph.holdFlush!();
	graph.write({ graphNodeId: 'state:open', value: false });
	first();
	await macrotask();
	expect(texts).toEqual([]);
	second();
	await macrotask();

	expect(texts).toEqual([[false]]);
});

test('an explicit flush still runs while the graph is held', async () => {
	const { graph, texts } = textGraph();

	const release = graph.holdFlush!();
	graph.write({ graphNodeId: 'state:closes', value: 1 });
	await graph.flush();
	release();

	expect(texts).toEqual([[1]]);
});
