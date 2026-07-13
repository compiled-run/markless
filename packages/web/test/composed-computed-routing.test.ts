import { createProtocolStatePayload, type ProtocolStatePayload } from '@markless/serializer';
import { expect, test } from 'vitest';
import {
	marklessComposeState as composeCsrState,
	marklessCsrLoadChildSymbol,
	marklessCsrRemapGraphOutput,
} from '../src/fns/csr.ts';
import {
	marklessComposeState as composeSsrState,
} from '../src/fns/ssr.ts';
import { render } from '../src/render.ts';

type ComposedChild = {
	readonly symbolPrefix: string;
	readonly graphProps: ReadonlyArray<{
		readonly name: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
	}>;
	readonly output: {
		state: ProtocolStatePayload;
		loadSymbol?: (symbolId: string) => (context: never) => unknown;
		m?: (graphProps: ComposedChild['graphProps']) => void;
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

function propComputedState(input: {
	readonly propName: string;
	readonly computedId: string;
	readonly deriveSymbolId: string;
	readonly initialValue?: number;
}): ProtocolStatePayload {
	return {
		...createProtocolStatePayload({
			cells: [
				{
					graphNodeId: 'prop:props',
					name: 'props',
					valueKind: 'object',
					value: { [input.propName]: input.initialValue ?? 0 },
				},
			],
		}),
		computed: [
			{
				graphNodeId: input.computedId,
				name: input.computedId.slice(input.computedId.indexOf(':') + 1),
				async: false,
				deriveSymbolId: input.deriveSymbolId,
				dependencies: [{ graphNodeId: 'prop:props', path: [input.propName] }],
			},
		],
	} as ProtocolStatePayload;
}

function child(
	state: ProtocolStatePayload,
	symbolPrefix: string,
	graphProps: ComposedChild['graphProps'] = [],
	loadSymbol?: ComposedChild['output']['loadSymbol'],
): ComposedChild {
	const output: ComposedChild['output'] = { state, loadSymbol };
	output.m = (props) => marklessCsrRemapGraphOutput(output, props);
	return { symbolPrefix, graphProps, output };
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

test('compiled same-module CSR re-derives a child computed fed by a parent computed prop', async () => {
	const parentState = computedState({
		cellId: 'state:owner',
		computedId: 'computed:parentValue',
		deriveSymbolId: 'symbol:parent',
		initialValue: 0,
	});
	const childState = propComputedState({
		propName: 'input',
		computedId: 'computed:childValue',
		deriveSymbolId: 'symbol:child',
	});
	const state = {
		...parentState,
		cells: [...parentState.cells, ...childState.cells],
		computed: [...parentState.computed, ...childState.computed],
	} as ProtocolStatePayload;
	const evaluations = { parent: 1, child: 1 };
	const loadedSymbols: string[] = [];
	const compiledOutput = {
		state,
		loadSymbol(symbolId: string) {
			loadedSymbols.push(symbolId);
			if (symbolId === 'symbol:parent') {
				return ({ graph }) => {
					evaluations.parent++;
					return Number(graph.read('state:owner'));
				};
			}
			if (symbolId === 'symbol:child') {
				return ({ graph }) => {
					evaluations.child++;
					return Number(graph.read('prop:props', ['input']));
				};
			}
			if (symbolId === 'symbol:text') {
				return (context) => ({
					type: 'setText' as const,
					locator: context.domUpdate.hostNodeId,
					value: context.value,
				});
			}
			throw new Error(`Unknown symbol ${symbolId}`);
		},
	};
	marklessCsrRemapGraphOutput(compiledOutput, [
		{ name: 'input', graphNodeId: 'computed:parentValue', path: [] },
	]);
	const output = {
		nodeType: 1 as const,
		tagName: 'OUTPUT',
		childNodes: [],
		textContent: '0',
		addEventListener() {},
	};
	const view = {
		...emptyView,
		locators: [{ hostNodeId: 'child-output', strategy: 'dom-order', index: 0, tagName: 'output' }],
		domUpdates: [
			{
				hostNodeId: 'child-output',
				source: 'childValue',
				graphNodeId: 'computed:childValue',
				path: [],
				target: { kind: 'text' },
				symbolId: 'symbol:text',
			},
		],
	} as const;
	const container = await render(
		() => ({
			root: output as never,
			state: compiledOutput.state,
			view: view as never,
			loadSymbol: compiledOutput.loadSymbol as never,
		}),
		{ target: { replaceChildren() {} } },
	);

	expect(evaluations).toEqual({ parent: 1, child: 1 });
	expect(loadedSymbols).toEqual([]);
	container.graph.write({ graphNodeId: 'state:owner', value: 1 });
	await container.graph.flush();

	expect(evaluations).toEqual({ parent: 2, child: 2 });
	expect(container.graph.read('computed:childValue')).toBe(1);
	expect(output.textContent).toBe('1');
	expect(loadedSymbols).toEqual(['symbol:parent', 'symbol:child', 'symbol:text']);
});

test('composed CSR re-derives a child computed fed directly by parent state', async () => {
	const childEvaluations = { count: 1 };
	const childRecord = child(
		propComputedState({
			propName: 'amount',
			computedId: 'computed:stateChildValue',
			deriveSymbolId: 'symbol:state-child',
		}),
		'c0:',
		[{ name: 'amount', graphNodeId: 'state:source', path: [] }],
		((symbolId: string) => {
			if (symbolId !== 'symbol:state-child') throw new Error(`Unknown child symbol ${symbolId}`);
			return ({ graph }) => {
				childEvaluations.count++;
				return Number(graph.read('prop:props', ['amount']));
			};
		}) as never,
	);
	const state = composeCsrState(
		createProtocolStatePayload({
			cells: [
				{ graphNodeId: 'state:source', name: 'source', valueKind: 'scalar', value: 0 },
			],
		}),
		[childRecord],
	);
	const container = await mountAndWrite({
		state,
		cellId: 'state:source',
		value: 4,
		loadSymbol(symbolId) {
			if (!symbolId.startsWith('c0:')) throw new Error(`Unknown root symbol ${symbolId}`);
			return childRecord.output.loadSymbol!(symbolId.slice(3)) as never;
		},
	});

	expect(childEvaluations.count).toBe(2);
	expect(container.graph.read('computed:stateChildValue')).toBe(4);
});

test('nested composed CSR propagates a parent computed prop through a two-hop computed chain', async () => {
	const evaluations = { parent: 1, child: 1, grandchild: 1 };
	const grandchildRecord = child(
		propComputedState({
			propName: 'leafInput',
			computedId: 'computed:grandchildValue',
			deriveSymbolId: 'symbol:grandchild',
		}),
		'c1:',
		[{ name: 'leafInput', graphNodeId: 'computed:childValue', path: [] }],
		((symbolId: string) => {
			if (symbolId !== 'symbol:grandchild') {
				throw new Error(`Unknown grandchild symbol ${symbolId}`);
			}
			return ({ graph }) => {
				evaluations.grandchild++;
				return Number(graph.read('prop:props', ['leafInput'])) + 1;
			};
		}) as never,
	);
	const middleState = composeCsrState(
		propComputedState({
			propName: 'childInput',
			computedId: 'computed:childValue',
			deriveSymbolId: 'symbol:child',
		}),
		[grandchildRecord],
	);
	const middleRecord = child(
		middleState,
		'c0:',
		[{ name: 'childInput', graphNodeId: 'computed:parentValue', path: [] }],
		((symbolId: string) => {
			if (symbolId === 'symbol:child') {
				return ({ graph }) => {
					evaluations.child++;
					return Number(graph.read('prop:props', ['childInput'])) + 1;
				};
			}
			if (symbolId.startsWith('c1:')) {
				return grandchildRecord.output.loadSymbol!(symbolId.slice(3)) as never;
			}
			throw new Error(`Unknown middle symbol ${symbolId}`);
		}) as never,
	);
	const state = composeCsrState(
		computedState({
			cellId: 'state:owner',
			computedId: 'computed:parentValue',
			deriveSymbolId: 'symbol:parent',
			initialValue: 0,
		}),
		[middleRecord],
	);
	const container = await mountAndWrite({
		state,
		cellId: 'state:owner',
		value: 1,
		loadSymbol(symbolId) {
			if (symbolId === 'symbol:parent') {
				return ({ graph }) => {
					evaluations.parent++;
					return Number(graph.read('state:owner'));
				};
			}
			if (symbolId.startsWith('c0:')) {
				return middleRecord.output.loadSymbol!(symbolId.slice(3)) as never;
			}
			throw new Error(`Unknown root symbol ${symbolId}`);
		},
	});

	expect(evaluations).toEqual({ parent: 2, child: 2, grandchild: 2 });
	expect(container.graph.read('computed:grandchildValue')).toBe(3);
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

test('three same-module hops preserve one imported-child route for derive and DOM symbols', async () => {
	const leafState = computedState({
		cellId: 'state:routedLeafInput',
		computedId: 'computed:routedLeafOutput',
		deriveSymbolId: 'symbol:leaf-derive',
	});
	const importedState = composeCsrState(emptyState(), [child(leafState, 'c0:')]);
	const deepState = composeCsrState(emptyState(), [child(importedState, '')]);
	const middleState = composeCsrState(emptyState(), [child(deepState, '')]);
	const state = composeCsrState(emptyState(), [child(middleState, '')]);
	const output = {
		nodeType: 1 as const,
		tagName: 'OUTPUT',
		childNodes: [],
		textContent: '1',
		addEventListener() {},
	};
	const view = {
		...emptyView,
		locators: [{ hostNodeId: 'routed-leaf', strategy: 'dom-order', index: 0, tagName: 'output' }],
		domUpdates: [
			{
				hostNodeId: 'routed-leaf',
				source: 'routedLeafOutput',
				graphNodeId: 'computed:routedLeafOutput',
				path: [],
				target: { kind: 'text' },
				symbolId: 'c0:symbol:leaf-dom',
			},
		],
	} as const;
	const loaderCalls: string[] = [];
	const container = await render(
		() => ({
			root: output as never,
			state,
			view: view as never,
			loadSymbol(symbolId: string) {
				loaderCalls.push(symbolId);
				if (symbolId === 'c0:symbol:leaf-derive') {
					return ({ graph }) => Number(graph.read('state:routedLeafInput')) + 1;
				}
				if (symbolId === 'c0:symbol:leaf-dom') {
					return (context) => ({
						type: 'setText' as const,
						locator: context.domUpdate.hostNodeId,
						value: context.value,
					});
				}
				throw new Error(`Unknown async symbol ${symbolId}`);
			},
		}),
		{ target: { replaceChildren() {} } },
	);

	container.graph.write({ graphNodeId: 'state:routedLeafInput', value: 6 });
	await container.graph.flush();

	expect(loaderCalls).toEqual(['c0:symbol:leaf-derive', 'c0:symbol:leaf-dom']);
	expect(output.textContent).toBe('7');
});

test('demand-loaded writes delegate composed routes through same-module outputs', async () => {
	const childLoaderCalls: string[] = [];
	const rootLoaderCalls: string[] = [];
	const loadRootSymbol = (id: string) => {
		rootLoaderCalls.push(id);
		if (id === 'symbol:root') {
			return ({ graph }) => Number(graph.read('state:rootDemandInput')) * 10;
		}
		throw new Error(`Unknown async symbol ${id}`);
	};
	const importedChild = child(
		computedState({
			cellId: 'state:demandInput',
			computedId: 'computed:demandOutput',
			deriveSymbolId: 'symbol:derive',
		}),
		'c0:',
		[],
		((symbolId: string) => {
			childLoaderCalls.push(symbolId);
			if (symbolId === 'symbol:derive') {
				return ({ graph }) => Number(graph.read('state:demandInput')) + 1;
			}
			if (symbolId === 'symbol:dom') {
				return (context) => ({
					type: 'setText' as const,
					locator: context.domUpdate.hostNodeId,
					value: context.value,
				});
			}
			throw new Error(`Unknown child async symbol ${symbolId}`);
		}) as never,
	);
	const deepestChildren = [importedChild];
	const deepest = child(
		composeCsrState(emptyState(), deepestChildren),
		'',
		[],
		((symbolId: string) =>
			marklessCsrLoadChildSymbol(
				deepestChildren,
				loadRootSymbol,
				symbolId,
			)) as never,
	);
	const middleChildren = [deepest];
	const middle = child(
		composeCsrState(emptyState(), middleChildren),
		'',
		[],
		((symbolId: string) =>
			marklessCsrLoadChildSymbol(
				middleChildren,
				loadRootSymbol,
				symbolId,
			)) as never,
	);
	const rootState = computedState({
		cellId: 'state:rootDemandInput',
		computedId: 'computed:rootDemandOutput',
		deriveSymbolId: 'symbol:root',
	});
	const state = composeCsrState(rootState, [middle]);
	const output = {
		nodeType: 1 as const,
		tagName: 'OUTPUT',
		childNodes: [],
		textContent: '1',
		addEventListener() {},
	};
	const view = {
		...emptyView,
		locators: [{ hostNodeId: 'demand-leaf', strategy: 'dom-order', index: 0, tagName: 'output' }],
		domUpdates: [
			{
				hostNodeId: 'demand-leaf',
				source: 'demandOutput',
				graphNodeId: 'computed:demandOutput',
				path: [],
				target: { kind: 'text' },
				symbolId: 'c0:symbol:dom',
			},
		],
	} as const;
	const container = await render(
		() => ({
			root: output as never,
			state,
			view: view as never,
			loadSymbol(symbolId: string) {
				return marklessCsrLoadChildSymbol(
					[middle],
					loadRootSymbol,
					symbolId,
				);
			},
		}),
		{ target: { replaceChildren() {} } },
	);

	expect(childLoaderCalls).toEqual([]);
	expect(rootLoaderCalls).toEqual([]);
	container.graph.write({ graphNodeId: 'state:demandInput', value: 6 });
	await container.graph.flush();

	expect(childLoaderCalls).toEqual(['symbol:derive', 'symbol:dom']);
	expect(rootLoaderCalls).toEqual([]);
	expect(output.textContent).toBe('7');

	container.graph.write({ graphNodeId: 'state:rootDemandInput', value: 3 });
	await container.graph.flush();
	expect(rootLoaderCalls).toEqual(['symbol:root']);
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
