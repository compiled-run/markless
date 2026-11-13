import { expect, test } from 'vitest';
import { createRuntimeGraph } from '@markless/runtime';
import { createAsyncComputedPlane } from '@markless/runtime/graph-async';
import { createHeldInputsPlane } from '@markless/runtime/graph-held';
import { createPaintHold } from '../src/resume-return-reask.ts';

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function heldGraph(computed: Parameters<typeof createRuntimeGraph>[0]['computed'] = []) {
	const painted = new Map<string, unknown>();
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:label', value: 'Saving' },
			{ graphNodeId: 'state:rows', value: ['a'] },
			{ graphNodeId: 'state:open', value: true },
			{ graphNodeId: 'state:marks', value: { a: true } },
			{ graphNodeId: 'state:draft', value: '' },
		],
		computed,
	});
	const paint = (graphNodeId: string) =>
		graph.subscribe({ id: `paint:${graphNodeId}`, graphNodeId, run: (value) => void painted.set(graphNodeId, value) });
	for (const graphNodeId of ['state:label', 'state:rows', 'state:open', 'state:marks']) paint(graphNodeId);
	const held = new Set(['state:label', 'state:rows', 'state:marks']);
	let holding = true;
	const hold = graph.holdPaint!((internals) => createPaintHold(internals, (graphNodeId) => holding && held.has(graphNodeId)))!;
	const stopHolding = () => (holding = false);
	return { graph, painted, paint, release: hold.release, hold, stopHolding };
}

test('a held write is read back at once and painted only once released', async () => {
	const { graph, painted, release } = heldGraph();
	graph.write({ graphNodeId: 'state:label', value: 'Saved' });
	await macrotask();
	expect(graph.read('state:label')).toBe('Saved');
	expect(painted.get('state:label') ?? 'Saving').toBe('Saving');
	release('state:label');
	await macrotask();
	expect(painted.get('state:label')).toBe('Saved');
});

test('updates, collection calls and deletions are held, and never change the shown value in place', async () => {
	const { graph, painted, release } = heldGraph();
	graph.update({ graphNodeId: 'state:label', update: () => 'Saved' });
	graph.call({ graphNodeId: 'state:rows', method: 'push', args: ['b'] });
	graph.delete({ graphNodeId: 'state:marks', path: ['a'] });
	await macrotask();
	expect([graph.read('state:label'), graph.read('state:rows'), graph.read('state:marks')]).toEqual(['Saved', ['a', 'b'], {}]);
	expect([painted.get('state:label') ?? 'Saving', painted.get('state:rows') ?? ['a'], painted.get('state:marks') ?? { a: true }]).toEqual([
		'Saving',
		['a'],
		{ a: true },
	]);
	for (const graphNodeId of ['state:label', 'state:rows', 'state:marks']) release(graphNodeId);
	await macrotask();
	expect([painted.get('state:label'), painted.get('state:rows'), painted.get('state:marks')]).toEqual(['Saved', ['a', 'b'], {}]);
});

test('a write the hold declines paints at once, and clearing the hold paints every held state', async () => {
	const { graph, painted } = heldGraph();
	graph.write({ graphNodeId: 'state:open', value: false });
	graph.write({ graphNodeId: 'state:label', value: 'Saved' });
	await macrotask();
	expect([painted.get('state:open'), painted.get('state:label') ?? 'Saving']).toEqual([false, 'Saving']);
	graph.holdPaint!(undefined);
	await macrotask();
	expect(painted.get('state:label')).toBe('Saved');
});

test('a computed over a held state answers code from the written value and paints from the shown one', async () => {
	const { graph, painted, paint, release } = heldGraph([
		{
			graphNodeId: 'computed:both',
			dependencies: [{ graphNodeId: 'state:label' }, { graphNodeId: 'state:draft' }],
			compute: (read) => `${read('state:label') as string} ${read('state:draft') as string}`,
		},
	]);
	paint('computed:both');
	graph.write({ graphNodeId: 'state:label', value: 'Saved' });
	await macrotask();
	expect(graph.read('computed:both')).toBe('Saved ');
	graph.write({ graphNodeId: 'state:draft', value: 'x' });
	await macrotask();
	// The other state shows at once; the held one keeps its earlier value beside it.
	expect(painted.get('computed:both')).toBe('Saving x');
	expect(graph.read('computed:both')).toBe('Saved x');
	release('state:label');
	await macrotask();
	expect(painted.get('computed:both')).toBe('Saved x');
});

test('a write the hold declines lands on the shown value at its path, and a whole value ends the showing', async () => {
	const { graph, painted, release, stopHolding } = heldGraph();
	graph.delete({ graphNodeId: 'state:marks', path: ['a'] });
	stopHolding();
	graph.write({ graphNodeId: 'state:marks', path: ['b'], value: true });
	await macrotask();
	expect(painted.get('state:marks')).toEqual({ a: true, b: true });
	expect(graph.read('state:marks')).toEqual({ b: true });
	graph.write({ graphNodeId: 'state:marks', value: { c: true } });
	await macrotask();
	expect(painted.get('state:marks')).toEqual({ c: true });
	release('state:marks');
	await macrotask();
	expect(painted.get('state:marks')).toEqual({ c: true });
});

test('values derived while a state is shown paint what they were derived from, until nothing is shown', async () => {
	const { graph, painted, paint, release, hold } = heldGraph();
	graph.write({ graphNodeId: 'state:label', value: 'Saved' });
	expect(hold.showing()).toBe(true);
	paint('state:open');
	// The painted pass reads the held label's shown value through the read it is handed.
	hold.derived(graph, 'state:open', false, (painted) => (painted(graph.read)('state:label') === 'Saving' ? 'shown' : 'live'), 'skip');
	await macrotask();
	expect([graph.read('state:open'), painted.get('state:open'), hold.readShown('state:open')]).toEqual([false, 'shown', 'shown']);
	release('state:label');
	await macrotask();
	expect([hold.showing(), painted.get('state:open')]).toEqual([false, false]);
});

test('an async value first read while painting a held state loads once, with the written value', async () => {
	const keys: unknown[] = [];
	const graph = createRuntimeGraph({
		async: createAsyncComputedPlane,
		held: createHeldInputsPlane,
		cells: [{ graphNodeId: 'state:picked', value: 'none' }],
		asyncComputed: [
			{
				graphNodeId: 'computed:detail',
				dependencies: [{ graphNodeId: 'state:picked', path: [] }],
				key: (read) => read('state:picked'),
				run: ({ key }: { key: unknown }) => (keys.push(key), Promise.resolve({ key })),
			},
		],
	} as never);
	const hold = graph.holdPaint!((internals) => createPaintHold(internals, (graphNodeId) => graphNodeId === 'state:picked'))!;
	graph.write({ graphNodeId: 'state:picked', value: 'b' });
	hold.readShown('computed:detail', ['status']);
	await macrotask();
	hold.release('state:picked');
	await macrotask();
	expect(keys).toEqual(['b']);
});
