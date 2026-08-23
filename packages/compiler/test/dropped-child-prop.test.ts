import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

/**
 * Defect 26. A component-edge prop whose expression negates a read of a
 * widget-scoped shared instance — `<Leaf tall={!board.wide} />` — was refused and
 * dropped from the edge, so the child rendered as if the prop had never been
 * written. `board.wide === false` over the same read lifted to a computed and
 * worked, and `pureCompositeReadSources` already decomposes a `UnaryExpression`
 * into exactly the same read set. Only the composite gate disagreed: it listed
 * conditionals, binaries, logicals and template literals and left the unary
 * operators out, so the lift never ran and the prop fell through to the refusal.
 *
 * The gate is shared with the element/template collector, whose byte output is
 * measured, so the unary widening is opt-in and only the component edge asks for
 * it — the same shape a method call at the edge already uses.
 */

const CHILD = `
export function Leaf({ tall = false, children }: { tall?: boolean; children?: unknown }) @{
	<div ui-tall={tall}>{children}</div>
}
`;

function parentSource(expression: string) {
	return `
import { shared, state } from '@markless/core';
import { Leaf } from './child.tsrx';

export const boardState = shared(() => {
	const board = state({ wide: false });
	return { ...board };
}, { scope: 'widget' });

export function Panel({ children }: { children?: unknown }) @{
	const board = boardState();

	<Leaf tall={${expression}}>{children}</Leaf>
}
`;
}

async function compileParent(expression: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/child.tsrx', source: CHILD, importSource: './child.tsrx' },
		{ filename: 'src/parent.tsrx', source: parentSource(expression) },
	]);
	return results[results.length - 1]!;
}

type CompiledParent = Awaited<ReturnType<typeof compileParent>>;

function edgeProp(result: CompiledParent, name: string) {
	return result.semanticGraph.componentEdges[0]?.props.find((prop) => prop.name === name);
}

function propExpressionDiagnostics(result: CompiledParent) {
	return result.semanticGraph.diagnostics.filter(
		(candidate) => candidate.code === 'MARKLESS_COMPONENT_PROP_EXPRESSION_UNSUPPORTED',
	);
}

function mintedComputeds(result: CompiledParent) {
	return result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
}

// The measured shape. It must reach the child as a real reactive route, not as a
// dropped prop and not as a value seeded once from the factory's placeholder.
test('a negated shared read at a component edge lifts to a computed', async () => {
	const result = await compileParent('!board.wide');
	const tall = edgeProp(result, 'tall');

	expect(tall?.kind).toBe('graph-reference');
	const graphNodeId = tall && 'graphNodeId' in tall ? tall.graphNodeId : '';
	expect(graphNodeId).toMatch(/^computed:templateExpression:/);

	const computed = mintedComputeds(result).find((binding) => binding.id === graphNodeId);
	expect(computed?.functionSource).toBe('() => !board.wide');
	// The read under the negation is the whole dependency set, so a write to
	// `board.wide` is what wakes the child.
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual(['board.wide']);
	expect(propExpressionDiagnostics(result)).toEqual([]);
});

// The route has to survive emission: the child's props object must read the
// minted computed, and the emitted module must carry the negation that computes it.
test('the lifted negation is evaluated in the emitted module and reaches the child', async () => {
	const result = await compileParent('!board.wide');
	const tall = edgeProp(result, 'tall');
	const graphNodeId = tall && 'graphNodeId' in tall ? tall.graphNodeId : '';
	const ssr = result.publicRenderModule.ssrModuleSource;

	expect(ssr).toContain('!board.wide');
	expect(ssr).toContain(
		`tall:marklessSsrReadPublicPath(marklessSsrRenderStateValues.get(${JSON.stringify(
			graphNodeId,
		)}),[])`,
	);
});

// Hardcoding resistance: the widening is selected from node structure, not from
// the `!` character or from any name in the measured shape.
test('other pure unary operators over a shared read route the same way', async () => {
	const result = await compileParent('-board.wide');
	const tall = edgeProp(result, 'tall');

	expect(tall?.kind).toBe('graph-reference');
	const computed = mintedComputeds(result).find(
		(binding) => tall && 'graphNodeId' in tall && binding.id === tall.graphNodeId,
	);
	expect(computed?.functionSource).toBe('() => -board.wide');
	expect(propExpressionDiagnostics(result)).toEqual([]);
});

// Fail closed, never drop. A negation over an opaque call still has nothing to
// subscribe, so it stays a loud refusal naming the prop and the expression.
test('a negation over an opaque call is still refused loudly, not dropped', async () => {
	const result = await compileParent('!pick(board.wide)');
	const diagnostic = propExpressionDiagnostics(result)[0];

	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('tall');
	expect(diagnostic?.message).toContain('!pick(board.wide)');
	// A refused edge prop must not also ship.
	expect(edgeProp(result, 'tall')).toBeUndefined();
});

// The negation of a prop is settled by the render that read it, so it owes no
// computed - the same rule the binary shapes already follow.
test('a negated prop alone stays opaque and mints no computed', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/child.tsrx', source: CHILD, importSource: './child.tsrx' },
		{
			filename: 'src/parent.tsrx',
			source: `
import { Leaf } from './child.tsrx';

export function Panel({ flat, children }: { flat?: boolean; children?: unknown }) @{
	<Leaf tall={!flat}>{children}</Leaf>
}
`,
		},
	]);
	const parent = results[results.length - 1]!;

	expect(edgeProp(parent, 'tall')?.kind).toBe('opaque');
	expect(mintedComputeds(parent)).toEqual([]);
	expect(propExpressionDiagnostics(parent)).toEqual([]);
});

// The shapes that already worked keep working, byte for byte, so the widening
// bought the negation and nothing else.
test('bare reads, liftable composites and constants are unchanged', async () => {
	const bare = await compileParent('board.wide');
	const bareProp = edgeProp(bare, 'tall');
	expect(bareProp?.kind).toBe('graph-reference');
	expect(bareProp && 'graphNodeId' in bareProp ? bareProp.path : null).toEqual(['wide']);
	expect(mintedComputeds(bare)).toEqual([]);

	const composite = await compileParent('board.wide === false');
	const compositeProp = edgeProp(composite, 'tall');
	expect(compositeProp?.kind).toBe('graph-reference');
	expect(mintedComputeds(composite).map((binding) => binding.functionSource)).toEqual([
		'() => board.wide === false',
	]);

	const constant = await compileParent('true');
	const constantProp = edgeProp(constant, 'tall');
	expect(constantProp?.kind).toBe('serializable');
	expect(constantProp && 'value' in constantProp ? constantProp.value : null).toBe(true);
	expect(mintedComputeds(constant)).toEqual([]);

	for (const result of [bare, composite, constant]) {
		expect(propExpressionDiagnostics(result)).toEqual([]);
	}
});
