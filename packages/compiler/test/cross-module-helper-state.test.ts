import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

test('T130 produces a module graph interface for exported state helper functions', async () => {
	const result = await compileTsrxModule({
		filename: 'src/helpers.tsrx',
		source: `import { state } from '@markless/core'; export function counterPair() { const n = state(0); return n; }`,
		symbols: [],
	});

	expect(result.moduleGraphInterface).toEqual({
		passId: 'module-graph-interface',
		filename: 'src/helpers.tsrx',
		exports: [
			{
				exportName: 'counterPair',
				localName: 'counterPair',
				kind: 'function',
				returns: {
					kind: 'state',
					localName: 'n',
					declarationKind: 'const',
					writable: true,
					valueKind: 'scalar',
					initialValue: 0,
				},
			},
		],
	});
});

test('T130 compiles imported helper-created state through a module graph interface', async () => {
	const [, app] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/helpers.tsrx',
			importSource: './helpers.tsrx',
			source: `import { state } from '@markless/core'; export function counterPair() { const n = state(0); return n; }`,
		},
		{
			filename: 'src/App.tsrx',
			source: `import { counterPair } from './helpers.tsrx'; export function App() @{ const count = counterPair(); <button onClick={() => count++}>{count}</button> }`,
		},
	]);
	const incrementSymbol = app.symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('count++'),
	);
	const incrementModule = app.symbolModules.modules.find(
		(module) => module.symbolId === incrementSymbol?.id,
	);

	expect(app.semanticGraph.diagnostics).toEqual([]);
	expect(app.stateLowering.diagnostics).toEqual([]);
	expect(app.semanticGraph.graphBindings).toEqual([
		expect.objectContaining({
			id: 'state:App.count.counterPair.n',
			name: 'App_count_counterPair_n',
			initialValue: 0,
		}),
	]);
	expect(app.semanticGraph.aliases).toEqual([
		expect.objectContaining({
			name: 'count',
			target: 'App_count_counterPair_n',
			declarationKind: 'let',
		}),
	]);
	expect(payloadStateCellValue(app.protocolState, 'state:App.count.counterPair.n')).toBe(0);
	expect(incrementModule?.source).toContain('graphNodeId: "state:App.count.counterPair.n"');
});

test('T130 creates independent cells for multiple components calling an imported helper', async () => {
	const [, app] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/helpers.tsrx',
			importSource: './helpers.tsrx',
			source: `import { state } from '@markless/core'; export function counterPair() { const n = state(1); return n; }`,
		},
		{
			filename: 'src/App.tsrx',
			source: `import { counterPair } from './helpers.tsrx'; export function Left() @{ const left = counterPair(); <button onClick={() => left++}>{left}</button> } export function Right() @{ const right = counterPair(); <button onClick={() => right++}>{right}</button> }`,
		},
	]);

	expect(app.semanticGraph.diagnostics).toEqual([]);
	expect(app.semanticGraph.graphBindings.map((binding) => binding.id)).toEqual([
		'state:Left.left.counterPair.n',
		'state:Right.right.counterPair.n',
	]);
	expect(app.protocolState.cells.map((cell) => cell.graphNodeId)).toEqual([
		'state:Left.left.counterPair.n',
		'state:Right.right.counterPair.n',
	]);
});

test('T130 keeps a loud gate for imported helpers without module graph interfaces', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `import { counterPair } from './helpers.tsrx'; export function App() @{ const count = counterPair(); <button onClick={() => count++}>{count}</button> }`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED',
			message: expect.stringContaining('analysis is not available'),
		}),
	]);
});

test('B919 reports imported module-scope state exports instead of compiling a dead snapshot', async () => {
	const [, app] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/session.tsrx',
			importSource: './session.tsrx',
			source: `import { state } from '@markless/core'; export const count = state(0);`,
		},
		{
			filename: 'src/App.tsrx',
			source: `import { count } from './session.tsrx'; export function App() @{ <p>{count}</p> }`,
		},
	]);

	expect(app.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_CROSS_MODULE_IMPORT',
			message: 'Cannot import graph state "count" from "./session.tsrx" into "src/App.tsrx".',
			why: expect.stringContaining('per-request graph ownership'),
		}),
	]);
	expect(app.stateLowering.diagnostics).toEqual([]);
	expect(app.protocolState.cells).toEqual([]);
});

test('T130 keeps same-module helper-created state behavior unchanged', async () => {
	const result = await compileTsrxModule({
		filename: 'src/HelperCounter.tsrx',
		source: `import { state } from '@markless/core'; function counterPair() { const n = state(5); return n; } export function App() @{ const count = counterPair(); <button onClick={() => count++}>{count}</button> }`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.semanticGraph.graphBindings).toEqual([
		expect.objectContaining({
			id: 'state:App.count.counterPair.n',
			name: 'App_count_counterPair_n',
			initialValue: 5,
		}),
	]);
	expect(result.semanticGraph.aliases).toEqual([
		expect.objectContaining({ name: 'count', target: 'App_count_counterPair_n' }),
	]);
	expect(payloadStateCellValue(result.protocolState, 'state:App.count.counterPair.n')).toBe(5);
});

function payloadStateCellValue(state: any, graphNodeId: string): unknown {
	const cell = state.cells.find((candidate: any) => candidate.graphNodeId === graphNodeId);
	return cell?.value.root;
}
