import { afterEach, expect, test } from 'vitest';
import { STORAGE_SLOT_SYMBOL_KEY } from '@markless/serializer';
import { createResumeRuntime } from '../src/index.ts';
import { marklessSsrServeComputed } from '../src/fns/state-payload.ts';
import { createRuntimeGraphFromResumePayload } from '../src/payload-graph-construct.ts';

// A page served with one storage value wakes holding another in the slot; what it derives must follow the slot.
const slotSymbol = Symbol.for(STORAGE_SLOT_SYMBOL_KEY);
type Host = typeof globalThis & Record<symbol, unknown>;

afterEach(() => {
	delete (globalThis as Host)[slotSymbol];
});

function view() {
	return {
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

async function wake(input: {
	readonly cell: string;
	readonly key: string;
	readonly served: string;
	readonly saved: string;
	readonly computed: ReadonlyArray<{
		readonly id: string;
		readonly reads: string;
		readonly derive: (value: unknown) => unknown;
		readonly served: unknown;
	}>;
}) {
	(globalThis as Host)[slotSymbol] = { [input.cell.slice('storage:'.length)]: input.saved };
	const state = {
		version: 2,
		cells: [{ graphNodeId: input.cell, name: 'saved', valueKind: 'scalar', directValue: input.served }],
		computed: input.computed.map((entry) => ({
			graphNodeId: entry.id,
			name: entry.id,
			async: false,
			deriveSymbolId: `derive:${entry.id}`,
			dependencies: [{ graphNodeId: entry.reads, path: [] }],
		})),
		storage: [{ graphNodeId: input.cell, key: input.key }],
	};
	marklessSsrServeComputed(
		state as never,
		new Map(input.computed.map((entry) => [entry.id, entry.served])),
		input.computed.map((entry) => entry.id),
	);
	const loadSymbol = (id: string) => {
		const entry = input.computed.find((candidate) => `derive:${candidate.id}` === id);
		return ({ read }: { read: (graphNodeId: string) => unknown }) =>
			entry?.derive(read(entry.reads));
	};
	const root = { nodeType: 1, tagName: 'MAIN', childNodes: [] };
	const graph = await createRuntimeGraphFromResumePayload({
		state,
		view: view(),
		root,
		loadSymbol,
	} as never);
	const runtime = createResumeRuntime({
		root,
		graph,
		state,
		view: view(),
		loadSymbol,
	} as never);
	await runtime.start();
	await graph.flush();
	return graph;
}

test('a computed over a storage cell follows the saved value the page wakes with', async () => {
	const graph = await wake({
		cell: 'storage:pages/list.tsrx#items',
		key: 'items',
		served: '["a"]',
		saved: '["a","b"]',
		computed: [
			{
				id: 'computed:rows',
				reads: 'storage:pages/list.tsrx#items',
				derive: (value) => JSON.parse(String(value)),
				served: ['a'],
			},
		],
	});
	await expect.poll(() => graph.read('computed:rows')).toEqual(['a', 'b']);
});

test('a chain of computeds over a storage cell follows the saved value the page wakes with', async () => {
	const graph = await wake({
		cell: 'storage:lib/Bag.tsrx#bag',
		key: 'bag',
		served: '3',
		saved: '5',
		computed: [
			{
				id: 'computed:count',
				reads: 'storage:lib/Bag.tsrx#bag',
				derive: (value) => Number(value),
				served: 3,
			},
			{
				id: 'computed:label',
				reads: 'computed:count',
				derive: (value) => `${String(value)} in bag`,
				served: '3 in bag',
			},
		],
	});
	await expect.poll(() => graph.read('computed:label')).toBe('5 in bag');
	expect(graph.read('storage:lib/Bag.tsrx#bag')).toBe('5');
});
