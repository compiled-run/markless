import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scriptedRuns() {
	const settles: Array<{ key: unknown; resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
	return {
		settles,
		run: ({ key }: { key: unknown }) =>
			new Promise((resolve, reject) => settles.push({ key, resolve, reject })),
	};
}

// `people` is read by `count`, keyed by the number of people.
function chainGraph(people: ReturnType<typeof scriptedRuns>, count: ReturnType<typeof scriptedRuns>) {
	return createRuntimeGraph({
		cells: [{ graphNodeId: 'state:team', value: 'blue' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:people',
				dependencies: [{ graphNodeId: 'state:team', path: [] }],
				key: (read) => read('state:team'),
				run: people.run,
			},
			{
				graphNodeId: 'computed:count',
				dependencies: [{ graphNodeId: 'computed:people', path: ['value', 'length'] }],
				key: (read) => read('computed:people', ['value', 'length']),
				run: count.run,
			},
		],
	} as never);
}

const versions = (graph: ReturnType<typeof createRuntimeGraph>, ...ids: string[]) =>
	new Map(ids.map((id) => [id, graph.asyncPlane!()!.nodes.get(id)!.version]));

async function settledChain() {
	const people = scriptedRuns();
	const count = scriptedRuns();
	const graph = chainGraph(people, count);
	graph.read('computed:count', ['status']);
	people.settles[0]!.resolve(['Ada']);
	await tick();
	count.settles[0]!.resolve(1);
	await tick();
	return { graph, people, count };
}

test('a write refresh re-asks a settled value loudly, on the key it already has', async () => {
	const { graph, people } = await settledChain();
	graph.asyncPlane!()!.refreshAfterWrite(versions(graph, 'computed:people'));
	expect(people.settles).toHaveLength(2);
	expect(people.settles[1]!.key).toBe('blue');
	const shown = graph.read('computed:people', []) as { status: string; quiet?: true; value: unknown };
	expect(shown).toMatchObject({ status: 'pending', value: ['Ada'] });
	expect(shown.quiet).toBeUndefined();
});

test('a value that ran again since the writes settled is not re-asked', async () => {
	const { graph, people } = await settledChain();
	const settledAt = versions(graph, 'computed:people');
	graph.write({ graphNodeId: 'state:team', path: [], value: 'red' });
	await graph.flush();
	expect(people.settles).toHaveLength(2);
	graph.asyncPlane!()!.refreshAfterWrite(settledAt);
	expect(people.settles).toHaveLength(2);
});

test('a read still in flight from before the writes settled starts over, and its old answer never lands', async () => {
	const people = scriptedRuns();
	const count = scriptedRuns();
	const graph = chainGraph(people, count);
	graph.read('computed:people', ['status']);
	graph.asyncPlane!()!.refreshAfterWrite(versions(graph, 'computed:people'));
	expect(people.settles).toHaveLength(2);
	people.settles[0]!.resolve(['Ada']);
	await tick();
	expect(graph.read('computed:people', ['status'])).toBe('pending');
	people.settles[1]!.resolve(['Ada', 'Grace']);
	await tick();
	expect(graph.read('computed:people', ['value'])).toEqual(['Ada', 'Grace']);
});

test('a read that started after the writes settled is left to its own run', async () => {
	const { graph, people } = await settledChain();
	const settledAt = versions(graph, 'computed:people');
	graph.write({ graphNodeId: 'state:team', path: [], value: 'red' });
	await graph.flush();
	await tick();
	expect(people.settles).toHaveLength(2);
	graph.asyncPlane!()!.refreshAfterWrite(settledAt);
	expect(people.settles).toHaveLength(2);
});

test('withInputs lists the async values a value reads through sync computeds, inputs first', () => {
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:team', value: 'blue' }],
		computed: [
			{
				graphNodeId: 'computed:label',
				dependencies: [{ graphNodeId: 'computed:user', path: [] }],
				compute: (read: (id: string) => unknown) => String(read('computed:user')),
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:user',
				dependencies: [{ graphNodeId: 'state:team', path: [] }],
				key: (read) => read('state:team'),
				run: async () => 'Ada',
			},
			{
				graphNodeId: 'computed:orders',
				dependencies: [{ graphNodeId: 'computed:label', path: [] }],
				key: (read) => read('computed:label'),
				run: async () => [],
			},
		],
	} as never);
	expect(graph.asyncPlane!()!.withInputs(['computed:orders']).map((node) => node.graphNodeId)).toEqual([
		'computed:user',
		'computed:orders',
	]);
});

test('a reader listed before its async input waits for the input and runs once, on the new key', async () => {
	const { graph, people, count } = await settledChain();
	graph.asyncPlane!()!.refreshAfterWrite(versions(graph, 'computed:count', 'computed:people'));
	expect(people.settles).toHaveLength(2);
	expect(count.settles).toHaveLength(1);
	people.settles[1]!.resolve(['Ada', 'Grace']);
	await tick();
	expect(count.settles.map((run) => run.key)).toEqual([1, 2]);
});
