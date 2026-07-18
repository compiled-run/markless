import { expect, test } from 'vitest';
import { createRuntimeGraph } from '../src/index.ts';

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
