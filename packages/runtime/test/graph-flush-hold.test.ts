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

test('releasing a hold twice does not stop later writes from flushing', async () => {
	const { graph, texts } = textGraph();

	const release = graph.holdFlush!();
	release();
	release();
	graph.write({ graphNodeId: 'state:open', value: false });
	await macrotask();

	expect(texts).toEqual([[false]]);
});

test('a repeated release does not lift another holder', async () => {
	const { graph, texts } = textGraph();

	const first = graph.holdFlush!();
	const second = graph.holdFlush!();
	first();
	first();
	graph.write({ graphNodeId: 'state:open', value: false });
	await macrotask();
	expect(texts).toEqual([]);
	second();
	await macrotask();

	expect(texts).toEqual([[false]]);
});

// pendingFlush names the pass that will paint pending writes without starting it, so a hold still applies.
test('pendingFlush while scheduled and held: settles only after the release, with the writes', async () => {
	const { graph, texts } = textGraph();

	graph.write({ graphNodeId: 'state:open', value: false });
	const release = graph.holdFlush!();
	const pending = graph.pendingFlush!();
	let settled = false;
	void pending!.then(() => (settled = true));
	await macrotask();
	expect(settled).toBe(false);
	expect(texts).toEqual([]);
	graph.write({ graphNodeId: 'state:closes', value: 1 });
	release();
	await pending;

	expect(texts).toEqual([[false, 1]]);
});

test('pendingFlush while scheduled and not held: the same pass flush() runs', async () => {
	const { graph, texts } = textGraph();

	graph.write({ graphNodeId: 'state:open', value: false });
	const pending = graph.pendingFlush!();
	expect(pending).toBeDefined();
	expect(graph.pendingFlush!()).toBe(pending);
	await pending;

	expect(texts).toEqual([[false]]);
	expect(graph.pendingFlush!()).toBeUndefined();
});

test('pendingFlush while a pass runs: that pass, which also paints a write made during it', async () => {
	const texts: unknown[] = [];
	let answer!: () => void;
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:slow', value: 0 },
			{ graphNodeId: 'state:open', value: true },
		],
	});
	graph.subscribe({
		id: 'dom-update:slow',
		graphNodeId: 'state:slow',
		run: async (value) => {
			await new Promise<void>((resolve) => (answer = resolve));
			return { type: 'setText', locator: 'slow', value };
		},
	});
	graph.subscribe({
		id: 'dom-update:open',
		graphNodeId: 'state:open',
		run: (value) => ({ type: 'setText', locator: 'open', value }),
	});
	graph.subscribeJournal((entries) => {
		texts.push(...entries.map((entry) => (entry as { value: unknown }).value));
	});

	graph.write({ graphNodeId: 'state:slow', value: 1 });
	const running = graph.flush();
	expect(graph.pendingFlush!()).toBe(running);
	graph.write({ graphNodeId: 'state:open', value: false });
	answer();
	await running;

	expect(texts).toEqual([1, false]);
	expect(graph.pendingFlush!()).toBeUndefined();
});

test('pendingFlush while idle with nothing pending: undefined', () => {
	const { graph } = textGraph();

	expect(graph.pendingFlush!()).toBeUndefined();
});
