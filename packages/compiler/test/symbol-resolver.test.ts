import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planBoundSymbolResolver, planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const source = `
import { state, computed } from '@markless/core';
import { Child } from './Child.tsrx';
import { chart, resizeCanvas } from './behaviors';
import { clamp } from './math';

export function App() @{
	let count = state(0);
	let query = state('');
	const result = computed(async ({ signal }) => {
		const q = query;
		const response = await fetch('/api/search?q=' + q, { signal });
		return await response.json();
	});

	<section>
		<input
			value={query}
			onInput={(event) => query = event.currentTarget.value}
			onKeyDown={(event) => {
				if (query && event.key === 'Escape') {
					event.preventDefault();
					query = '';
				}
			}}
		/>
		<button onClick={[() => count++, () => query = 'clicked', () => count = clamp(count, 10)]}>
			{count} {result.title}
		</button>
		<canvas attach={[chart(result), resizeCanvas]} />
		<Child onPick={() => count++} />
	</section>
}
`;

test('planSymbolResolver assigns lazy symbols while resolver owns import boundaries', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});

	expect(plan.passId).toBe('symbol-resolver');
	expect(plan.dynamicImportOwner).toBe('generated-symbol-resolver');
	expect(plan.symbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ kind: 'event-handler', eventName: 'input' }),
			expect.objectContaining({
				kind: 'event-handler',
				eventName: 'input',
				parameters: ['event'],
				writes: [
					expect.objectContaining({
						source: 'query',
						graphNodeId: 'state:query',
						operation: 'assign',
						valueSource: 'event.currentTarget.value',
					}),
				],
			}),
			expect.objectContaining({ kind: 'event-handler', eventName: 'keydown' }),
			expect.objectContaining({
				kind: 'event-handler',
				eventName: 'click',
				order: 0,
				source: '() => count++',
				writes: [
					expect.objectContaining({
						graphNodeId: 'state:count',
						operation: 'update',
						updateOperator: '++',
					}),
				],
			}),
			expect.objectContaining({
				kind: 'callback-prop',
				propName: 'onPick',
				source: '() => count++',
				writes: [expect.objectContaining({ graphNodeId: 'state:count' })],
			}),
			expect.objectContaining({
				kind: 'event-handler',
				eventName: 'click',
				order: 1,
				source: "() => query = 'clicked'",
			}),
			expect.objectContaining({
				kind: 'event-handler',
				eventName: 'click',
				order: 2,
				source: '() => count = clamp(count, 10)',
				moduleImports: [
					{
						localName: 'clamp',
						importedName: 'clamp',
						source: './math',
						kind: 'named',
					},
				],
				writes: [
					expect.objectContaining({
						graphNodeId: 'state:count',
						operation: 'assign',
						valueSource: 'clamp(count, 10)',
					}),
				],
			}),
			expect.objectContaining({ kind: 'dom-update', source: 'query' }),
			expect.objectContaining({ kind: 'dom-update', source: 'count' }),
			expect.objectContaining({ kind: 'dom-update', source: 'result.title' }),
			expect.objectContaining({
				kind: 'behavior',
				source: 'chart(result)',
				functionSource: 'chart',
				inputSources: ['result'],
				moduleImport: {
					localName: 'chart',
					importedName: 'chart',
					source: './behaviors',
					kind: 'named',
				},
			}),
			expect.objectContaining({
				kind: 'behavior',
				source: 'resizeCanvas',
				functionSource: 'resizeCanvas',
				inputSources: [],
				moduleImport: {
					localName: 'resizeCanvas',
					importedName: 'resizeCanvas',
					source: './behaviors',
					kind: 'named',
				},
			}),
			expect.objectContaining({
				kind: 'async-computed-runner',
				graphNodeId: 'computed:result',
				source: expect.stringContaining("await fetch('/api/search?q=' + q"),
			}),
		]),
	);
	expect(plan.syncPolicies).toEqual([
		expect.objectContaining({
			eventName: 'keydown',
			hostNodeId: 'h1',
		}),
	]);
	expect(plan.diagnostics).toEqual([]);
});

test('planBoundSymbolResolver derives bound rows from edge paths and recorded ancestry', () => {
	const artifact = planBoundSymbolResolver({
		semanticGraph: {
			passId: 'tsrx-semantic-graph',
			filename: 'src/App.tsrx',
			components: [],
			componentPropBindings: [],
			componentEdges: [
				{
					id: 'component-edge:parent',
					parentComponentName: 'App',
					childComponentName: 'Panel',
					props: [],
					children: { childCount: 1 },
					branchScopeIds: ['branch:panel'],
					keyedRepeatScopeIds: [],
				},
				{
					id: 'component-edge:child',
					parentComponentName: 'Panel',
					childComponentName: 'Action',
					props: [],
					children: { childCount: 0 },
					branchScopeIds: [],
					keyedRepeatScopeIds: ['repeat:actions'],
				},
			],
			moduleImports: [], graphBindings: [], sharedDefinitions: [], sharedInstances: [],
			aliases: [], localBindings: [], stateReads: [], stateWrites: [], events: [],
			hostNodes: [], keyedRepeats: [], branchSites: [], behaviors: [], asyncBoundaries: [],
			moduleGraphInterface: { passId: 'module-graph-interface', filename: 'src/App.tsrx', exports: [] },
			diagnostics: [],
		},
		captureAnalysis: {
			passId: 'capture-analysis', diagnostics: [],
			extractedSymbols: [{
				symbolId: 'symbol:action', kind: 'event-handler', source: '() => label',
				owner: { componentName: 'Action' },
				captureSlots: [{
					id: 'capture-slot:label', bindingId: 'binding:label', source: 'label',
					owner: { componentName: 'Action' }, path: [], propName: 'label',
					routes: [{ kind: 'compiler-known-constant', componentEdgeId: 'component-edge:child', value: 'Save' }],
				}],
			}],
		},
	});

	expect(artifact.rows).toEqual([
		expect.objectContaining({
			baseSymbolId: 'symbol:action',
			componentEdgePath: ['component-edge:parent', 'component-edge:child'],
			ancestry: [
				{ componentEdgeId: 'component-edge:parent', branchScopeIds: ['branch:panel'], keyedRepeatScopeIds: [] },
				{ componentEdgeId: 'component-edge:child', branchScopeIds: [], keyedRepeatScopeIds: ['repeat:actions'] },
			],
			captureSlots: [{ slotId: 'capture-slot:label', path: [], route: expect.objectContaining({ value: 'Save' }) }],
		}),
	]);
	expect(artifact.rows[0]?.id).toContain('component-edge%3Aparent');
	expect(artifact.rows[0]?.id).not.toContain('Action');
});

test('planSymbolResolver assigns derive symbols for sync computed records', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/SyncComputed.tsrx',
		source: `
import { state, computed } from '@markless/core';

export function App() @{
	let count = state(2);
	const doubled = computed(() => count * 2);

	<p>{doubled}</p>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});

	expect(plan.symbols).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'symbol:1',
				kind: 'sync-computed-derive',
				graphNodeId: 'computed:doubled',
				name: 'doubled',
				source: '() => count * 2',
				dependencies: [{ source: 'count', graphNodeId: 'state:count', path: [] }],
			}),
		]),
	);
	expect(plan.symbols).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'async-computed-runner',
				graphNodeId: 'computed:doubled',
			}),
		]),
	);
});

test('planSymbolResolver keeps compound and binary assignment writes with their own handlers', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Assignments.tsrx',
		source: `
import { state } from '@markless/core';

export function App() @{
	const profile = state({ step: 2 });
	let total = state(0);

	<section>
		<button onClick={() => total += profile.step}>{total}</button>
		<button onClick={() => total = total + profile.step}>{total}</button>
	</section>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});
	const compoundSymbol = plan.symbols.find(
		(symbol) =>
			symbol.kind === 'event-handler' && symbol.source.includes('total += profile.step'),
	);
	const binarySymbol = plan.symbols.find(
		(symbol) =>
			symbol.kind === 'event-handler' &&
			symbol.source.includes('total = total + profile.step'),
	);

	expect(compoundSymbol).toMatchObject({
		kind: 'event-handler',
		writes: [
			expect.objectContaining({
				source: 'total',
				assignmentOperator: '+=',
				valueSource: 'profile.step',
			}),
		],
	});
	expect(binarySymbol).toMatchObject({
		kind: 'event-handler',
		writes: [
			expect.objectContaining({
				source: 'total',
				valueSource: 'total + profile.step',
			}),
		],
	});
	expect(compoundSymbol?.writes).toHaveLength(1);
	expect(binarySymbol?.writes).toHaveLength(1);
	expect(binarySymbol?.writes[0]?.assignmentOperator).toBeUndefined();
});

test('planSymbolResolver ignores module import names that only appear in event string literals', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/EventImportString.tsrx',
		source: `
import { state } from '@markless/core';
import { clamp } from './math';

export function App() @{
	let label = state('');

	<button onClick={() => label = "clamp"}>{label}</button>
}
`,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });

	const plan = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});
	const symbol = plan.symbols.find(
		(item) => item.kind === 'event-handler' && item.source.includes('"clamp"'),
	);

	expect(symbol).toMatchObject({
		kind: 'event-handler',
		source: '() => label = "clamp"',
	});
	expect(symbol).not.toHaveProperty('moduleImports');
});
