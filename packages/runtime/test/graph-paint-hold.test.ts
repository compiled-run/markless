import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function heldGraph() {
	const painted: unknown[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:label', value: 'Saving' },
			{ graphNodeId: 'state:rows', value: ['a'] },
			{ graphNodeId: 'state:open', value: true },
		],
	});
	for (const graphNodeId of ['state:label', 'state:rows', 'state:open'])
		graph.subscribe({
			id: `paint:${graphNodeId}`,
			graphNodeId,
			run: (value) => void painted.push([graphNodeId, value]),
		});
	const parked: Array<[string, ReadonlyArray<string>]> = [];
	graph.holdPaint!(
		(graphNodeId, path) => graphNodeId !== 'state:open' && !!parked.push([graphNodeId, path]),
	);
	const release = () => {
		for (const [graphNodeId, path] of parked.splice(0)) graph.changed({ graphNodeId, path });
	};
	return { graph, painted, parked, release };
}

test('a held write is read back at once and painted only when replayed', async () => {
	const { graph, painted, release } = heldGraph();
	graph.write({ graphNodeId: 'state:label', value: 'Saved' });
	await macrotask();
	expect(graph.read('state:label')).toBe('Saved');
	expect(painted).toEqual([]);
	release();
	await macrotask();
	expect(painted).toEqual([['state:label', 'Saved']]);
});

test('updates, collection calls and deletions are held the same way', async () => {
	const { graph, painted, parked, release } = heldGraph();
	graph.update({ graphNodeId: 'state:label', update: () => 'Saved' });
	graph.call({ graphNodeId: 'state:rows', method: 'push', args: ['b'] });
	graph.delete({ graphNodeId: 'state:rows', path: ['0'] });
	await macrotask();
	expect(parked.map(([graphNodeId]) => graphNodeId)).toEqual([
		'state:label',
		'state:rows',
		'state:rows',
	]);
	expect(painted).toEqual([]);
	release();
	await macrotask();
	expect(painted.map(([graphNodeId]) => graphNodeId)).toEqual(['state:label', 'state:rows']);
});

test('a write the hold declines paints at once, and clearing the hold paints every later write', async () => {
	const { graph, painted } = heldGraph();
	graph.write({ graphNodeId: 'state:open', value: false });
	await macrotask();
	expect(painted).toEqual([['state:open', false]]);
	graph.holdPaint!(undefined);
	graph.write({ graphNodeId: 'state:label', value: 'Saved' });
	await macrotask();
	expect(painted).toEqual([
		['state:open', false],
		['state:label', 'Saved'],
	]);
});
