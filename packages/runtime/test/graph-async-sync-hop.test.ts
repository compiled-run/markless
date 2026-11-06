import { expect, test } from 'vitest';
import { createRuntimeGraph as createGraph } from '../src/index.ts';
import { createAsyncComputedPlane } from '../src/graph-async.ts';
import { createHeldInputsPlane } from '../src/graph-held.ts';

const createRuntimeGraph: typeof createGraph = (input) =>
	createGraph({ async: createAsyncComputedPlane, held: createHeldInputsPlane, ...input });

function deferred<T>(): {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (error: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return { promise, resolve, reject };
}

async function drainMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

test('async computed demand gates across a sync computed dependency hop', async () => {
	const kilnRequests = [deferred<{ tone: string }>(), deferred<{ tone: string }>()];
	const kilnKeys: unknown[] = [];
	const labelKeys: unknown[] = [];
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'state:sampleId', value: 'first' }],
		computed: [
			{
				graphNodeId: 'computed:catalogCard',
				dependencies: [{ graphNodeId: 'computed:kilnSample', path: ['tone'] }],
				compute: (read) => ({
					caption: `Catalog: ${String(read('computed:kilnSample', ['tone']))}`,
				}),
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:kilnSample',
				dependencies: [{ graphNodeId: 'state:sampleId', path: [] }],
				key: (read) => read('state:sampleId'),
				run: ({ key }) => {
					kilnKeys.push(key);
					return kilnRequests[kilnKeys.length - 1]!.promise;
				},
			},
			{
				graphNodeId: 'computed:exhibitLabel',
				dependencies: [{ graphNodeId: 'computed:catalogCard', path: ['caption'] }],
				key: (read) => read('computed:catalogCard', ['caption']),
				run: ({ key }) => {
					labelKeys.push(key);
					return `Exhibit: ${String(key)}`;
				},
			},
		],
	});

	expect(graph.read('computed:exhibitLabel', ['status'])).toBe('pending');
	expect(kilnKeys).toEqual(['first']);
	expect(labelKeys).toEqual([]);

	kilnRequests[0]!.resolve({ tone: 'ember' });
	await drainMicrotasks();
	await graph.flush();
	expect(labelKeys).toEqual(['Catalog: ember']);
	expect(graph.read('computed:exhibitLabel', ['value'])).toBe('Exhibit: Catalog: ember');

	graph.write({ graphNodeId: 'state:sampleId', value: 'second' });
	await graph.flush();
	expect(kilnKeys).toEqual(['first', 'second']);
	expect(labelKeys).toEqual(['Catalog: ember']);

	kilnRequests[1]!.resolve({ tone: 'clay' });
	await drainMicrotasks();
	await graph.flush();
	expect(kilnKeys).toEqual(['first', 'second']);
	expect(labelKeys).toEqual(['Catalog: ember', 'Catalog: clay']);
	expect(graph.read('computed:exhibitLabel', ['value'])).toBe('Exhibit: Catalog: clay');
});

test('async computed rejection propagates across a sync computed dependency hop', async () => {
	const kilnRequest = deferred<{ tone: string }>();
	const failure = new Error('Kiln unavailable');
	let kilnRuns = 0;
	let labelRuns = 0;
	const graph = createRuntimeGraph({
		cells: [],
		computed: [
			{
				graphNodeId: 'computed:catalogCard',
				dependencies: [{ graphNodeId: 'computed:kilnSample', path: ['tone'] }],
				compute: (read) => ({ caption: read('computed:kilnSample', ['tone']) }),
			},
		],
		asyncComputed: [
			{
				graphNodeId: 'computed:kilnSample',
				dependencies: [],
				key: () => 'sample',
				run: () => {
					kilnRuns++;
					return kilnRequest.promise;
				},
			},
			{
				graphNodeId: 'computed:exhibitLabel',
				dependencies: [{ graphNodeId: 'computed:catalogCard', path: ['caption'] }],
				key: (read) => read('computed:catalogCard', ['caption']),
				run: () => {
					labelRuns++;
					return 'unexpected';
				},
			},
		],
	});

	expect(graph.read('computed:exhibitLabel', ['status'])).toBe('pending');
	expect({ kilnRuns, labelRuns }).toEqual({ kilnRuns: 1, labelRuns: 0 });

	kilnRequest.reject(failure);
	await drainMicrotasks();
	await graph.flush();
	expect(graph.read('computed:exhibitLabel', ['status'])).toBe('rejected');
	expect(graph.read('computed:exhibitLabel', ['error'])).toBe(failure);
	expect(labelRuns).toBe(0);
});

// In the browser a sync hop is a plain cell its derive writes, so the graph cannot walk through it.
function cellHopGraph(options: { readonly gateOnSources?: boolean } = {}) {
	const kiln = deferred<{ tone: string }>();
	const runs = { sample: 0, label: 0 };
	const graph = createRuntimeGraph({
		cells: [{ graphNodeId: 'computed:catalogCard', value: undefined }],
		computed: [],
		asyncComputed: [
			{
				graphNodeId: 'computed:kilnSample',
				dependencies: [],
				initialSnapshot: { status: 'pending', version: 1, key: null },
				key: () => 'sample',
				run: () => (runs.sample++, kiln.promise),
			},
			{
				graphNodeId: 'computed:exhibitLabel',
				dependencies: [{ graphNodeId: 'computed:catalogCard', path: ['caption'] }],
				syncHops: [
					{
						graphNodeId: 'computed:catalogCard',
						dependencies: [{ graphNodeId: 'computed:kilnSample', path: ['tone'] }],
						asyncFrom: options.gateOnSources === false ? [] : ['computed:kilnSample'],
					},
				],
				initialSnapshot: { status: 'pending', version: 1, key: null },
				key: (read) => read('computed:catalogCard', ['caption']),
				run: ({ key }) => (runs.label++, `Exhibit ${String(key)}`),
			},
		],
	});
	const derive = () =>
		graph.write({
			graphNodeId: 'computed:catalogCard',
			value: { caption: graph.read('computed:kilnSample', ['tone']) },
		});
	return { graph, kiln, runs, derive };
}

test('an async computed waits for the async value behind a sync hop held as a cell', async () => {
	const { graph, kiln, runs, derive } = cellHopGraph();

	expect(graph.read('computed:exhibitLabel', ['status'])).toBe('pending');
	expect(runs).toEqual({ sample: 1, label: 0 });

	kiln.resolve({ tone: 'azurite-fired' });
	await drainMicrotasks();
	expect(runs.label).toBe(0);
	derive();
	await drainMicrotasks();
	await graph.flush();
	expect(graph.read('computed:exhibitLabel', ['value'])).toBe('Exhibit azurite-fired');
	expect(runs).toEqual({ sample: 1, label: 1 });
});

test('an async computed first read while its sync hop derive is still answering waits for that derive', async () => {
	const { graph, kiln, runs, derive } = cellHopGraph({ gateOnSources: false });

	graph.read('computed:kilnSample', ['status']);
	kiln.resolve({ tone: 'azurite-fired' });
	await drainMicrotasks();
	const done = graph.startDerive!('computed:catalogCard');
	expect(graph.read('computed:exhibitLabel', ['status'])).toBe('pending');
	expect(runs.label).toBe(0);

	derive();
	done();
	await drainMicrotasks();
	await graph.flush();
	expect(graph.read('computed:exhibitLabel', ['value'])).toBe('Exhibit azurite-fired');
	expect(runs).toEqual({ sample: 1, label: 1 });
});

test('a sync hop derive that answers without writing releases the async computed it held', async () => {
	const { graph, kiln, runs } = cellHopGraph({ gateOnSources: false });

	graph.read('computed:kilnSample', ['status']);
	kiln.resolve({ tone: 'azurite-fired' });
	await drainMicrotasks();
	const done = graph.startDerive!('computed:catalogCard');
	expect(graph.read('computed:exhibitLabel', ['status'])).toBe('pending');

	done();
	await drainMicrotasks();
	await graph.flush();
	expect(graph.read('computed:exhibitLabel', ['value'])).toBe('Exhibit undefined');
	expect(runs.label).toBe(1);
});
