import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

import { createDerivedReconcilePlane } from '../src/graph-reconcile.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, held: createHeldInputsPlane, ...input });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function scripted() {
	const runs: Array<{ key: unknown; resolve: (value: unknown) => void }> = [];
	return {
		runs,
		run: ({ key }: { key: unknown }) => new Promise((resolve) => runs.push({ key, resolve })),
	};
}

function revenueGraph(options: { reconcile?: boolean; served?: boolean } = {}) {
	const revenue = scripted();
	const costs = scripted();
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:range', value: '10d' },
			{ graphNodeId: 'state:currency', value: 'eur' },
		],
		computed: [
			{
				graphNodeId: 'computed:perDay',
				dependencies: [
					{ graphNodeId: 'computed:revenue', path: ['total'] },
					{ graphNodeId: 'state:range', path: [] },
					{ graphNodeId: 'state:currency', path: [] },
				],
				compute: (read) =>
					`${(read('computed:revenue', ['total']) as number) / (read('state:range') === '10d' ? 10 : 20)} ${read('state:currency')}`,
			},
			{
				graphNodeId: 'computed:profit',
				dependencies: [
					{ graphNodeId: 'computed:revenue', path: ['total'] },
					{ graphNodeId: 'computed:costs', path: ['total'] },
				],
				compute: (read) =>
					(read('computed:revenue', ['total']) as number) - (read('computed:costs', ['total']) as number),
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:revenue',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: revenue.run,
				...(options.served && {
					initialSnapshot: { status: 'fulfilled', version: 1, key: '10d', value: { total: 10000 } },
				}),
			},
			{
				graphNodeId: 'computed:costs',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: costs.run,
				...(options.served && {
					initialSnapshot: { status: 'fulfilled', version: 1, key: '10d', value: { total: 5000 } },
				}),
			},
		],
		...(options.reconcile && { reconcile: createDerivedReconcilePlane }),
	} as never);
	return { graph, revenue, costs };
}

test('a derived value reads an input in the refreshing key as the shown value was fetched with it', async () => {
	const { graph, revenue, costs } = revenueGraph();
	graph.read('computed:profit');
	revenue.runs[0]!.resolve({ total: 10000 });
	costs.runs[0]!.resolve({ total: 5000 });
	await tick();
	expect(graph.read('computed:perDay')).toBe('1000 eur');

	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	expect(graph.read('state:range')).toBe('20d');
	expect(graph.read('computed:perDay')).toBe('1000 eur');

	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(graph.read('computed:perDay')).toBe('1000 usd');

	revenue.runs[1]!.resolve({ total: 30000 });
	await tick();
	expect(graph.read('computed:perDay')).toBe('1500 usd');
});

test('a value over two refreshes fetched for different inputs keeps its last result until both land', async () => {
	const { graph, revenue, costs } = revenueGraph({ served: true });
	expect(graph.read('computed:profit')).toBe(5000);
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	costs.runs[0]!.resolve({ total: 10000 });
	await tick();
	expect(graph.read('computed:profit')).toBe(5000);
	revenue.runs[0]!.resolve({ total: 30000 });
	await tick();
	expect(graph.read('computed:profit')).toBe(20000);
});

test('the read reaches through a chain: an input of the value a key read is held too', async () => {
	const orders = scripted();
	const past = scripted();
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:storeId', value: 'A' },
			{ graphNodeId: 'state:query', value: 'mugs' },
		],
		computed: [
			{
				graphNodeId: 'computed:heading',
				dependencies: [
					{ graphNodeId: 'computed:past', path: ['length'] },
					{ graphNodeId: 'state:storeId', path: [] },
				],
				compute: (read) => `${read('computed:past', ['length'])} in ${read('state:storeId')}`,
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:orders',
				dependencies: [{ graphNodeId: 'state:storeId', path: [] }],
				key: (read) => read('state:storeId'),
				run: orders.run,
			},
			{
				graphNodeId: 'computed:past',
				dependencies: [
					{ graphNodeId: 'state:query', path: [] },
					{ graphNodeId: 'computed:orders', path: ['value'] },
				],
				key: (read) => [read('state:query'), read('computed:orders', ['value'])],
				run: past.run,
			},
		],
	} as never);
	graph.read('computed:heading');
	orders.runs[0]!.resolve(['a1']);
	await tick();
	past.runs[0]!.resolve(Array.from({ length: 12 }, () => 'p'));
	await tick();
	expect(graph.read('computed:heading')).toBe('12 in A');

	graph.write({ graphNodeId: 'state:storeId', value: 'B' });
	await graph.flush();
	expect(graph.read('computed:heading')).toBe('12 in A');
	orders.runs[1]!.resolve(['b1']);
	await tick();
	expect(graph.read('computed:heading')).toBe('12 in A');
	past.runs[1]!.resolve(Array.from({ length: 3 }, () => 'p'));
	await tick();
	expect(graph.read('computed:heading')).toBe('3 in B');
});

test('a chained async value whose own input moved fetches at once on the inputs the screen shows', async () => {
	const revenue = scripted();
	const converted = scripted();
	const graph = createRuntimeGraph({
		cells: [
			{ graphNodeId: 'state:range', value: '10d' },
			{ graphNodeId: 'state:currency', value: 'eur' },
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:revenue',
				dependencies: [{ graphNodeId: 'state:range', path: [] }],
				key: (read) => read('state:range'),
				run: revenue.run,
			},
			{
				graphNodeId: 'computed:perDay',
				dependencies: [
					{ graphNodeId: 'computed:revenue', path: ['total'] },
					{ graphNodeId: 'state:range', path: [] },
					{ graphNodeId: 'state:currency', path: [] },
				],
				key: (read) => [read('computed:revenue', ['total']), read('state:range'), read('state:currency')],
				run: converted.run,
			},
		],
	} as never);
	graph.read('computed:perDay', ['status']);
	revenue.runs[0]!.resolve({ total: 10000 });
	await tick();
	converted.runs[0]!.resolve('€1,000');
	await tick();
	expect(graph.read('computed:perDay', [])).toMatchObject({ status: 'fulfilled', value: '€1,000' });

	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	expect(converted.runs).toHaveLength(1);
	expect(graph.read('computed:perDay', ['status'])).toBe('pending');

	graph.write({ graphNodeId: 'state:currency', value: 'usd' });
	await graph.flush();
	expect(converted.runs.map((run) => run.key)).toEqual([
		[10000, '10d', 'eur'],
		[10000, '10d', 'usd'],
	]);
	converted.runs[1]!.resolve('$1,100');
	await tick();
	expect(graph.read('computed:perDay', [])).toMatchObject({ status: 'pending', value: '$1,100' });

	revenue.runs[1]!.resolve({ total: 30000 });
	await tick();
	expect(converted.runs[2]?.key).toEqual([30000, '20d', 'usd']);
	converted.runs[2]!.resolve('$1,650');
	await tick();
	expect(graph.read('computed:perDay', [])).toMatchObject({ status: 'fulfilled', value: '$1,650' });
});

test('readers held at the old inputs move on when the new value lands equal to the old', async () => {
	const { graph, revenue } = revenueGraph({ reconcile: true, served: true });
	const seen: unknown[] = [];
	graph.subscribe({ id: 'per-day', graphNodeId: 'computed:perDay', run: (value) => void seen.push(value) });
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	await graph.flush();
	expect(graph.read('computed:perDay')).toBe('1000 eur');
	revenue.runs[0]!.resolve({ total: 10000 });
	await tick();
	await graph.flush();
	expect(graph.read('computed:perDay')).toBe('500 eur');
	expect(seen.at(-1)).toBe('500 eur');
});

test('a value that reads no async value is never held', async () => {
	const { graph } = revenueGraph({ served: true });
	const read = graph.shownRead!([{ graphNodeId: 'state:range', path: [] }]);
	graph.write({ graphNodeId: 'state:range', value: '20d' });
	expect(read).toBeUndefined();
	expect(graph.shownRead!([{ graphNodeId: 'state:range', path: [] }])).toBeUndefined();
});

test('after a refresh fails, a value reading the whole input object follows it again', async () => {
	for (const [cell, field, other] of [
		['state:view', 'page', 'usd'],
		['state:filters', 'offset', 'dense'],
	] as const) {
		const list = scripted();
		const graph = createRuntimeGraph({
			cells: [{ graphNodeId: cell, value: { [field]: 1, [other]: false } }],
			computed: [
				{
					graphNodeId: 'computed:label',
					dependencies: [
						{ graphNodeId: 'computed:list', path: ['rows'] },
						{ graphNodeId: cell, path: [] },
					],
					compute: (read) => {
						const shown = read(cell) as Record<string, unknown>;
						return `${(read('computed:list', ['rows']) as string[] | undefined)?.join(',')} ${shown[other] ? 'on' : 'off'}`;
					},
				},
			],
			asyncComputed: [
				{
					graphNodeId: 'computed:list',
					dependencies: [{ graphNodeId: cell, path: [field] }],
					key: (read) => read(cell, [field]),
					run: list.run,
				},
			],
		} as never);
		graph.read('computed:label');
		list.runs[0]!.resolve({ rows: ['a', 'b'] });
		await tick();
		expect(graph.read('computed:label')).toBe('a,b off');

		graph.write({ graphNodeId: cell, path: [field], value: 2 });
		await graph.flush();
		graph.write({ graphNodeId: cell, path: [other], value: true });
		await graph.flush();
		expect(graph.read('computed:label')).toBe('a,b off');

		list.runs[1]!.resolve(Promise.reject(new Error('offline')));
		await tick();
		await graph.flush();
		expect(graph.read('computed:list', ['status'])).toBe('rejected');
		expect(graph.read('computed:label')).toBe('a,b on');

		graph.write({ graphNodeId: cell, path: [other], value: false });
		await graph.flush();
		expect(graph.read('computed:label')).toBe('a,b off');
	}
});
