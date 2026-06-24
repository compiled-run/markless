import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess, planPayloadArena } from '../src/index.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const source = `
import { state, computed } from '@arcade/core';
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

test('planSymbolResolver keeps compound and binary assignment writes with their own handlers', async () => {
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/Assignments.tsrx',
		source: `
import { state } from '@arcade/core';

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
import { state } from '@arcade/core';
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
