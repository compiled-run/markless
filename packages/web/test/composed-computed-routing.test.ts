import { createProtocolStatePayload, type ProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import { marklessComposeState as composeCsrState } from '../src/fns/csr.ts';
import { marklessComposeState as composeSsrState } from '../src/fns/ssr.ts';
import { render } from '../src/render.ts';

type ComposedChild = {
	readonly symbolPrefix: string;
	readonly output: {
		readonly state: ProtocolStatePayload;
	};
};

const emptyView = {
	version: 1,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
} as const;

function emptyState(): ProtocolStatePayload {
	return createProtocolStatePayload({ cells: [] });
}

function computedState(input: {
	readonly cellId: string;
	readonly computedId: string;
	readonly deriveSymbolId: string;
	readonly initialValue?: number;
}): ProtocolStatePayload {
	return {
		...createProtocolStatePayload({
			cells: [
				{
					graphNodeId: input.cellId,
					name: input.cellId.slice(input.cellId.indexOf(':') + 1),
					valueKind: 'scalar',
					value: input.initialValue ?? 1,
				},
			],
		}),
		computed: [
			{
				graphNodeId: input.computedId,
				name: input.computedId.slice(input.computedId.indexOf(':') + 1),
				async: false,
				deriveSymbolId: input.deriveSymbolId,
				dependencies: [{ graphNodeId: input.cellId, path: [] }],
			},
		],
	} as ProtocolStatePayload;
}

function child(state: ProtocolStatePayload, symbolPrefix: string): ComposedChild {
	return { symbolPrefix, output: { state } };
}

async function mountAndWrite(input: {
	readonly state: ProtocolStatePayload;
	readonly cellId: string;
	readonly value: number;
	readonly loadSymbol: (symbolId: string) => (context: {
		readonly graph: { read(graphNodeId: string): unknown };
	}) => unknown;
}) {
	const root = {
		nodeType: 1 as const,
		tagName: 'MAIN',
		childNodes: [],
		addEventListener() {},
	};
	const container = await render(
		() => ({
			root: root as never,
			state: input.state,
			view: emptyView,
			loadSymbol: input.loadSymbol,
		}),
		{ target: { replaceChildren() {} } },
	);
	container.graph.write({ graphNodeId: input.cellId, value: input.value });
	await container.graph.flush?.();
	return container;
}

test('composed CSR sync computed resolves its derive symbol through the child-prefixed route', async () => {
	const state = composeCsrState(emptyState(), [
		child(
			computedState({
				cellId: 'state:childInput',
				computedId: 'computed:childOutput',
				deriveSymbolId: 'symbol:21',
			}),
			'c0:',
		),
	]);
	const rootLoaderCalls: string[] = [];
	const childLoaderCalls: string[] = [];
	const container = await mountAndWrite({
		state,
		cellId: 'state:childInput',
		value: 4,
		loadSymbol(symbolId) {
			rootLoaderCalls.push(symbolId);
			if (!symbolId.startsWith('c0:')) throw new Error(`Unknown async symbol ${symbolId}`);
			const childSymbolId = symbolId.slice('c0:'.length);
			childLoaderCalls.push(childSymbolId);
			if (childSymbolId !== 'symbol:21') {
				throw new Error(`Unknown child async symbol ${childSymbolId}`);
			}
			return ({ graph }) => Number(graph.read('state:childInput')) * 2;
		},
	});

	expect(rootLoaderCalls).toEqual(['c0:symbol:21']);
	expect(childLoaderCalls).toEqual(['symbol:21']);
	expect(container.graph.read('computed:childOutput')).toBe(8);
});

test('nested composed CSR sync computed accumulates each child route prefix exactly once', async () => {
	const leafState = computedState({
		cellId: 'state:leafInput',
		computedId: 'computed:leafOutput',
		deriveSymbolId: 'symbol:21',
	});
	const middleState = composeCsrState(emptyState(), [child(leafState, 'c1:')]);
	const rootState = composeCsrState(emptyState(), [child(middleState, 'c0:')]);
	const loaderCalls: string[] = [];
	const container = await mountAndWrite({
		state: rootState,
		cellId: 'state:leafInput',
		value: 5,
		loadSymbol(symbolId) {
			loaderCalls.push(symbolId);
			if (symbolId !== 'c0:c1:symbol:21') {
				throw new Error(`Unknown async symbol ${symbolId}`);
			}
			return ({ graph }) => Number(graph.read('state:leafInput')) + 1;
		},
	});

	expect(loaderCalls).toEqual(['c0:c1:symbol:21']);
	expect(container.graph.read('computed:leafOutput')).toBe(6);
});

test('composed SSR sync computed preserves its child-owned symbol route for resume', async () => {
	const state = composeSsrState(emptyState(), [
		child(
			computedState({
				cellId: 'state:ssrChildInput',
				computedId: 'computed:ssrChildOutput',
				deriveSymbolId: 'symbol:7',
			}),
			'c2:',
		),
	]);
	const loaderCalls: string[] = [];
	const container = await mountAndWrite({
		state,
		cellId: 'state:ssrChildInput',
		value: 6,
		loadSymbol(symbolId) {
			loaderCalls.push(symbolId);
			if (symbolId !== 'c2:symbol:7') throw new Error(`Unknown async symbol ${symbolId}`);
			return ({ graph }) => Number(graph.read('state:ssrChildInput')) - 1;
		},
	});

	expect(loaderCalls).toEqual(['c2:symbol:7']);
	expect(container.graph.read('computed:ssrChildOutput')).toBe(5);
});

test('root-owned sync computed keeps routing to the root loader after child composition', async () => {
	const state = composeCsrState(
		computedState({
			cellId: 'state:rootInput',
			computedId: 'computed:rootOutput',
			deriveSymbolId: 'symbol:root',
		}),
		[
			child(
				computedState({
					cellId: 'state:childControlInput',
					computedId: 'computed:childControlOutput',
					deriveSymbolId: 'symbol:child',
				}),
				'c0:',
			),
		],
	);
	const loaderCalls: string[] = [];
	const container = await mountAndWrite({
		state,
		cellId: 'state:rootInput',
		value: 3,
		loadSymbol(symbolId) {
			loaderCalls.push(symbolId);
			if (symbolId !== 'symbol:root') throw new Error(`Unknown async symbol ${symbolId}`);
			return ({ graph }) => Number(graph.read('state:rootInput')) * 10;
		},
	});

	expect(loaderCalls).toEqual(['symbol:root']);
	expect(container.graph.read('computed:rootOutput')).toBe(30);
});
