import { expect, test } from 'vitest';
import {
	createMutableSemanticGraphArtifact,
	createWalkState,
} from '../src/passes/semantic-graph/types.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const source = [
	'import { state } from "@markless/core";',
	'',
	'export function Counter() @{',
	'	let total = state(0);',
	'	<button onClick={() => total++}>{total}</button>',
	'}',
	'',
].join('\n');

function walkStateFor(filename: string): ReturnType<typeof createWalkState> {
	return createWalkState({
		filename,
		source,
		graph: createMutableSemanticGraphArtifact(filename),
		frameworkApiImports: new Map(),
	});
}

test('the walk carries yuku semantic tables for the module being walked', () => {
	const semantic = walkStateFor('counter.tsrx').semantic();

	// Populated, and describing this module rather than an empty placeholder.
	expect(semantic.symbol.count).toBeGreaterThan(0);
	expect(semantic.reference.count).toBeGreaterThan(0);
	const symbolNames = Array.from({ length: semantic.symbol.count }, (_, id) =>
		semantic.symbol.name(id),
	);
	expect(symbolNames).toEqual(expect.arrayContaining(['state', 'Counter', 'total']));

	// A collector can go from a use to the binding it resolves to, and back to
	// the span that use occupies in the authored source.
	const totalSymbol = symbolNames.indexOf('total');
	const [firstUse] = Array.from({ length: semantic.reference.count }, (_, id) => id).filter(
		(id) => semantic.reference.symbolId(id) === totalSymbol,
	);
	expect(firstUse).toBeDefined();
	expect(source.slice(semantic.reference.start(firstUse!), semantic.reference.end(firstUse!))).toBe(
		'total',
	);
});

test('analysis is deferred until asked for, then reused within one walk', () => {
	let analyses = 0;
	const state = createWalkState({
		filename: 'counter.tsrx',
		source,
		graph: createMutableSemanticGraphArtifact('counter.tsrx'),
		frameworkApiImports: new Map(),
		analyzeSemantics: (analyzedSource, filename) => {
			analyses += 1;
			expect(analyzedSource).toBe(source);
			expect(filename).toBe('counter.tsrx');
			return { symbol: { count: 7 } } as never;
		},
	});

	// A walk that never asks never pays for a second pass over the source.
	expect(analyses).toBe(0);
	expect(state.semantic().symbol.count).toBe(7);
	expect(state.semantic().symbol.count).toBe(7);
	expect(analyses).toBe(1);
});

test('threading semantics leaves the produced graph artifact unchanged', async () => {
	const graph = await buildSemanticGraph({ filename: 'counter.tsrx', source });
	// The pass still reports on the module it was given; nothing about the walk
	// output depends on the semantic view yet.
	expect(graph.passId).toBe('tsrx-semantic-graph');
	expect(graph.filename).toBe('counter.tsrx');
	expect(graph.components.map((component) => component.name)).toEqual(['Counter']);
	expect(graph.diagnostics).toEqual([]);
});
