/**
 * Defect 27. A negated shared read written straight into an element - the
 * attribute `<div ui-tall={!board.wide}>` or the text `<p>{!board.wide}</p>` -
 * minted no computed. `isCompositeTemplateExpression` listed conditionals,
 * binaries, logicals and template literals and left `UnaryExpression` out, so the
 * lift never ran, the template read resolved to no graph node, and the value was
 * rendered once by the server and never moved again. `board.wide === false` in
 * the very same position lifted and reacted, and `pureCompositeReadSources`
 * already decomposes a unary into exactly the same read set - only the gate
 * disagreed.
 *
 * This is the same gap fixed at component edges in defect 26; the flag it added
 * (`unaryOperators`) is what the element collector now asks for too. The narrower
 * `methodCalls` gate stays off in template positions on purpose: nothing there is
 * unexpressible without it, and a computed for every `.toFixed()` in a page's
 * text is bytes with no behavior behind them.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

function moduleSource(body: string) {
	return `import { shared, state } from '@markless/core';

export const boardState = shared(() => {
	const board = state({ wide: false, items: [1, 2] });
	return { ...board };
}, { scope: 'widget' });

export function Panel() @{
	const board = boardState();

	<section>
${body}
	</section>
}
`;
}

async function compilePanel(body: string) {
	return await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		source: moduleSource(body),
		symbols: [],
	});
}

type CompiledPanel = Awaited<ReturnType<typeof compilePanel>>;

function mintedComputeds(result: CompiledPanel) {
	return result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
}

function templateRead(result: CompiledPanel, source: string) {
	return result.semanticGraph.templateReads.find((read) => read.source === source);
}

function domUpdates(result: CompiledPanel, graphNodeId: string) {
	return result.payloadArena.view.domUpdates.filter(
		(update) => update.graphNodeId === graphNodeId,
	);
}

function errorDiagnostics(result: CompiledPanel) {
	return [...result.semanticGraph.diagnostics, ...result.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

// The measured shape from the pilot: an inverted flag in an element attribute.
// Without the lift the attribute is server-rendered once and never updates.
test('a negated shared read in an attribute lifts to a computed and plans a dom update', async () => {
	const result = await compilePanel('\t\t<div ui-tall={!board.wide}>x</div>');

	const read = templateRead(result, '!board.wide');
	expect(read?.computedGraphNodeId).toMatch(/^computed:templateExpression:/);

	const computed = mintedComputeds(result).find(
		(binding) => binding.id === read?.computedGraphNodeId,
	);
	expect(computed?.functionSource).toBe('() => !board.wide');
	// The read under the negation is the whole dependency set, so a write to
	// `board.wide` is what wakes the attribute.
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual(['board.wide']);

	// A minted computed with no planned update is a computed nobody subscribes.
	const planned = domUpdates(result, read?.computedGraphNodeId ?? '');
	expect(planned).toHaveLength(1);
	expect(planned[0]?.target).toMatchObject({ kind: 'attribute', name: 'ui-tall' });

	expect(errorDiagnostics(result)).toEqual([]);
});

// Text is the other template position and takes the same gate.
test('a negated shared read in text lifts to a computed and plans a dom update', async () => {
	const result = await compilePanel('\t\t<p>{!board.wide}</p>');

	const read = templateRead(result, '!board.wide');
	expect(read?.computedGraphNodeId).toMatch(/^computed:templateExpression:/);

	const computed = mintedComputeds(result).find(
		(binding) => binding.id === read?.computedGraphNodeId,
	);
	expect(computed?.functionSource).toBe('() => !board.wide');
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual(['board.wide']);

	const planned = domUpdates(result, read?.computedGraphNodeId ?? '');
	expect(planned).toHaveLength(1);
	expect(planned[0]?.target).toMatchObject({ kind: 'text' });

	expect(errorDiagnostics(result)).toEqual([]);
});

// `class={test ? a : b}` hands the collector the ternary's test on its own, so a
// negated test hits the same gate one level down and the class record is dropped
// the same way. It is an element attribute position and takes the same widening.
test('a negated test in a conditional class lifts to a computed', async () => {
	const result = await compilePanel(
		"\t\t<div class={!board.wide ? 'narrow' : 'wide'}>x</div>",
	);

	const read = templateRead(result, '!board.wide');
	expect(read?.computedGraphNodeId).toMatch(/^computed:templateExpression:/);
	expect(
		mintedComputeds(result).find((binding) => binding.id === read?.computedGraphNodeId)
			?.functionSource,
	).toBe('() => !board.wide');
	expect(domUpdates(result, read?.computedGraphNodeId ?? '')).toHaveLength(1);
	expect(errorDiagnostics(result)).toEqual([]);
});

// Hardcoding resistance: the widening is selected from node structure, not from
// the `!` character. `-` and `typeof` are pure value operators too.
test('other pure unary operators in a template lift the same way', async () => {
	for (const [expression, functionSource] of [
		['-board.wide', '() => -board.wide'],
		['typeof board.wide', '() => typeof board.wide'],
	] as const) {
		const result = await compilePanel(`\t\t<div ui-tall={${expression}}>x</div>`);
		const read = templateRead(result, expression);

		expect(read?.computedGraphNodeId, expression).toMatch(/^computed:templateExpression:/);
		expect(
			mintedComputeds(result).find((binding) => binding.id === read?.computedGraphNodeId)
				?.functionSource,
			expression,
		).toBe(functionSource);
		expect(errorDiagnostics(result), expression).toEqual([]);
	}
});

// `delete` mutates rather than reads. The read collector refuses it, so widening
// the gate must not turn it into a silently-minted computed.
test('delete in a template mints no computed', async () => {
	const result = await compilePanel('\t\t<div ui-tall={delete board.wide}>x</div>');

	expect(templateRead(result, 'delete board.wide')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(result)).toEqual([]);
});

// The deliberate narrowing, asserted unchanged: template positions still do not
// lift method calls, so this widening bought the unary operators and nothing else.
test('method calls in a template stay un-lifted', async () => {
	const attribute = await compilePanel('\t\t<div ui-tall={board.items.includes(1)}>x</div>');
	expect(templateRead(attribute, 'board.items.includes(1)')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(attribute)).toEqual([]);

	const text = await compilePanel('\t\t<p>{board.items.includes(1)}</p>');
	expect(templateRead(text, 'board.items.includes(1)')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(text)).toEqual([]);

	// A negation wrapping a method call is still not liftable: the call under it
	// has nothing to subscribe, so the unary widening must not rescue it.
	const negated = await compilePanel('\t\t<div ui-tall={!board.items.includes(1)}>x</div>');
	expect(templateRead(negated, '!board.items.includes(1)')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(negated)).toEqual([]);
});

// The shapes that already worked keep working, so nothing regressed under the
// widened gate.
test('bare reads and binary composites in templates are unchanged', async () => {
	const bare = await compilePanel('\t\t<div ui-tall={board.wide}>x</div>');
	expect(templateRead(bare, 'board.wide')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(bare)).toEqual([]);
	expect(bare.payloadArena.view.domUpdates.map((update) => update.source)).toContain('board.wide');

	const composite = await compilePanel('\t\t<div ui-tall={board.wide === false}>x</div>');
	expect(mintedComputeds(composite).map((binding) => binding.functionSource)).toEqual([
		'() => board.wide === false',
	]);

	for (const result of [bare, composite]) {
		expect(errorDiagnostics(result)).toEqual([]);
	}
});
