import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

test('an async computed reached through two computeds restarts once per write', async () => {
	const runs: unknown[] = [];
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:query', value: 'a' }],
		computed: [
			{
				graphNodeId: 'computed:upper',
				dependencies: [{ graphNodeId: 'state:query' }],
				compute: (read) => String(read('state:query')).toUpperCase(),
			},
			{
				graphNodeId: 'computed:length',
				dependencies: [{ graphNodeId: 'state:query' }],
				compute: (read) => String(read('state:query')).length,
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'async:search',
				dependencies: [{ graphNodeId: 'computed:upper' }, { graphNodeId: 'computed:length' }],
				key: (read) => `${read('computed:upper')}:${read('computed:length')}`,
				run: ({ key }) => {
					runs.push(key);
					return key;
				},
			},
		],
	});

	graph.read('async:search');
	await graph.flush();
	runs.length = 0;

	graph.write({ graphNodeId: 'state:query', value: 'ab' });
	await graph.flush();

	expect(runs).toEqual(['AB:2']);
});

test('a write wakes only the computeds and subscriptions that read it', async () => {
	const computes = new Map<string, number>();
	const cells = Array.from({ length: 50 }, (_, index) => ({
		graphNodeId: `state:${index}`,
		value: index,
	}));
	const graph = createRuntimeGraph({
		cells,
		computed: cells.map((cell, index) => ({
			graphNodeId: `computed:${index}`,
			dependencies: [{ graphNodeId: cell.graphNodeId }],
			compute: (read) => {
				computes.set(`computed:${index}`, (computes.get(`computed:${index}`) ?? 0) + 1);
				return (read(cell.graphNodeId) as number) * 2;
			},
		})),
	});
	const woken: string[] = [];
	for (let index = 0; index < 50; index++)
		graph.subscribe({
			id: `dom-update:${index}`,
			graphNodeId: `computed:${index}`,
			run: (value) => {
				woken.push(`${index}=${value}`);
			},
		});
	for (let index = 0; index < 50; index++) graph.read(`computed:${index}`);
	computes.clear();

	graph.write({ graphNodeId: 'state:7', value: 100 });
	await graph.flush();

	expect(woken).toEqual(['7=200']);
	expect([...computes]).toEqual([['computed:7', 1]]);
});

test('the synchronous subscriptions of one pass run without yielding between them', async () => {
	const order: string[] = [];
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:count', value: 0 }] });
	for (const id of ['first', 'second', 'third'])
		graph.subscribe({
			id,
			graphNodeId: 'state:count',
			run: () => {
				order.push(id);
				queueMicrotask(() => order.push(`after ${id}`));
			},
		});

	graph.write({ graphNodeId: 'state:count', value: 1 });
	await graph.flush();

	expect(order.slice(0, 3)).toEqual(['first', 'second', 'third']);
});

test('subscriptions on different nodes run in the order they subscribed', async () => {
	const order: string[] = [];
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:a', value: 0 },
			{ graphNodeId: 'state:b', value: 0 },
		],
	});
	for (const [id, graphNodeId] of [
		['b-first', 'state:b'],
		['a-second', 'state:a'],
		['b-third', 'state:b'],
	] as const)
		graph.subscribe({ id, graphNodeId, run: () => void order.push(id) });

	graph.write({ graphNodeId: 'state:a', value: 1 });
	graph.write({ graphNodeId: 'state:b', value: 1 });
	await graph.flush();

	expect(order).toEqual(['b-first', 'a-second', 'b-third']);
});

test('a pass skips a subscription disposed by an earlier one and runs one added during it', async () => {
	const order: string[] = [];
	const graph = createRuntimeGraph({ cells: [{ graphNodeId: 'state:open', value: false }] });
	let disposeInner: () => void = () => {};
	graph.subscribe({
		id: 'branch',
		graphNodeId: 'state:open',
		run: () => {
			order.push('branch');
			disposeInner();
			graph.subscribe({
				id: 'fresh-arm',
				graphNodeId: 'state:open',
				run: (value) => void order.push(`fresh-arm=${value}`),
			});
		},
	});
	disposeInner = graph.subscribe({
		id: 'old-arm',
		graphNodeId: 'state:open',
		run: () => void order.push('old-arm'),
	});
	graph.subscribe({ id: 'sibling', graphNodeId: 'state:open', run: () => void order.push('sibling') });

	graph.write({ graphNodeId: 'state:open', value: true });
	await graph.flush();

	expect(order).toEqual(['branch', 'sibling', 'fresh-arm=true']);
});
