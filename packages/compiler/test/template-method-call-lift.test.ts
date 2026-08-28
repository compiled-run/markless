/**
 * A template read spelled as a method call - `{box.items.join('|')}` as text,
 * `ui-joined={box.items.join('|')}` as an attribute - minted no synthetic
 * computed, so `payload-arena` emitted no update record and the read was dead
 * after the first render while `{box.items.length}` beside it refreshed.
 * `methodCalls` is now on for template positions, which is what component-edge
 * props already asked for; the byte measurement that refusal owed is in
 * goals/headless-components/notes/U721-method-call-template-reads.md.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

function moduleSource(body: string) {
	return `import { shared, state } from '@markless/core';

export const boardState = shared(() => {
	const board = state({ label: 'ready', items: ['a', 'b'] });
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

async function compileModule(source: string) {
	return await compileTsrxModule({ filename: 'src/Panel.tsrx', source, symbols: [] });
}

type Compiled = Awaited<ReturnType<typeof compilePanel>>;

function mintedComputeds(result: Compiled) {
	return result.semanticGraph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	);
}

function templateRead(result: Compiled, source: string) {
	return result.semanticGraph.templateReads.find((read) => read.source === source);
}

function domUpdates(result: Compiled, graphNodeId: string) {
	return result.payloadArena.view.domUpdates.filter(
		(update) => update.graphNodeId === graphNodeId,
	);
}

function errorDiagnostics(result: Compiled) {
	return [...result.semanticGraph.diagnostics, ...result.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

// The measured shape: a call on the collection in a text child. Without the lift
// the span is server-rendered once and no write ever reaches it.
test('a method call in a text child lifts to a computed and plans a text update', async () => {
	const result = await compilePanel("\t\t<p>{board.items.join('|')}</p>");

	const read = templateRead(result, "board.items.join('|')");
	expect(read?.computedGraphNodeId).toMatch(/^computed:templateExpression:/);

	const computed = mintedComputeds(result).find(
		(binding) => binding.id === read?.computedGraphNodeId,
	);
	expect(computed?.functionSource).toBe("() => board.items.join('|')");
	// The receiver is the whole dependency set: what `join` does with it is opaque,
	// but only a write to `board.items` can move the answer.
	expect(computed?.dependencies?.map((dependency) => dependency.source)).toEqual(['board.items']);

	const planned = domUpdates(result, read?.computedGraphNodeId ?? '');
	expect(planned).toHaveLength(1);
	expect(planned[0]?.target).toMatchObject({ kind: 'text' });

	expect(errorDiagnostics(result)).toEqual([]);
});

// The attribute position is the same expression written on the same element, and
// it went stale the same way.
test('a method call in an attribute lifts to a computed and plans an attribute update', async () => {
	const result = await compilePanel("\t\t<div ui-joined={board.items.join('|')}>x</div>");

	const read = templateRead(result, "board.items.join('|')");
	expect(read?.computedGraphNodeId).toMatch(/^computed:templateExpression:/);

	const planned = domUpdates(result, read?.computedGraphNodeId ?? '');
	expect(planned).toHaveLength(1);
	expect(planned[0]?.target).toMatchObject({ kind: 'attribute', name: 'ui-joined' });

	expect(errorDiagnostics(result)).toEqual([]);
});

// The conditional-class collector hands the test up on its own, so it takes the
// gate one level down exactly as the unary widening did.
test('a method call as a conditional class test lifts to a computed', async () => {
	const result = await compilePanel(
		"\t\t<div class={board.items.includes('a') ? 'has' : 'none'}>x</div>",
	);

	const read = templateRead(result, "board.items.includes('a')");
	expect(read?.computedGraphNodeId).toMatch(/^computed:templateExpression:/);
	expect(domUpdates(result, read?.computedGraphNodeId ?? '')).toHaveLength(1);
	expect(errorDiagnostics(result)).toEqual([]);
});

// Hardcoding resistance: the lift is selected from node structure, not from a set
// of method names, receiver shapes or attribute spellings.
test('any method on any read receiver lifts, with its arguments in the dependency set', async () => {
	for (const [expression, dependencies] of [
		["board.items.join('|')", ['board.items']],
		['board.items.slice(1)', ['board.items']],
		['board.label.toUpperCase()', ['board.label']],
		['board.items.includes(board.label)', ['board.items', 'board.label']],
		["board.label.padStart(board.items.length, '.')", ['board.label', 'board.items.length']],
	] as const) {
		const result = await compilePanel(`\t\t<div data-out={${expression}}>x</div>`);
		const read = templateRead(result, expression);

		expect(read?.computedGraphNodeId, expression).toMatch(/^computed:templateExpression:/);
		const computed = mintedComputeds(result).find(
			(binding) => binding.id === read?.computedGraphNodeId,
		);
		expect(computed?.functionSource, expression).toBe(`() => ${expression}`);
		// An argument that is itself a read is part of what wakes the update.
		expect(computed?.dependencies?.map((dependency) => dependency.source), expression).toEqual([
			...dependencies,
		]);
		expect(errorDiagnostics(result), expression).toEqual([]);
	}
});

// The bound on the widening's cost. A prop is settled by the render that produced
// it, so a props-only call owes no record - and minting one would demand a
// capture slot for a receiver the payload cannot carry.
test('a method call on a prop alone mints nothing', async () => {
	const result = await compileModule(`
function Card({ formatter }: { formatter: { format(value: number): string } }) @{
	<p data-out={formatter.format(1)}>{formatter.format(2)}</p>
}

export function App() @{
	<Card formatter={{ format: (value: number) => String(value) }} />
}
`);

	expect(templateRead(result, 'formatter.format(1)')?.computedGraphNodeId).toBeUndefined();
	expect(templateRead(result, 'formatter.format(2)')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(result)).toEqual([]);
});

// A bare call names a function whose body this pass cannot see, so nothing says
// what would move its result. Widening the gate must not turn it into a computed.
test('a call that is not a method on a read value mints nothing', async () => {
	for (const expression of [
		'format(board.label)',
		'board.items[0]()',
		'board.items.at(0)()',
	] as const) {
		const result = await compilePanel(`\t\t<div data-out={${expression}}>x</div>`);

		expect(templateRead(result, expression)?.computedGraphNodeId, expression).toBeUndefined();
		expect(mintedComputeds(result), expression).toEqual([]);
	}
});

// The shapes that already worked keep working, so the widening bought the calls
// and nothing else.
test('bare reads and property reads in templates are unchanged', async () => {
	const bare = await compilePanel('\t\t<div ui-tall={board.label}>x</div>');
	expect(templateRead(bare, 'board.label')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(bare)).toEqual([]);
	expect(bare.payloadArena.view.domUpdates.map((update) => update.source)).toContain(
		'board.label',
	);

	const property = await compilePanel('\t\t<p>{board.items.length}</p>');
	expect(templateRead(property, 'board.items.length')?.computedGraphNodeId).toBeUndefined();
	expect(mintedComputeds(property)).toEqual([]);
	expect(property.payloadArena.view.domUpdates.map((update) => update.source)).toContain(
		'board.items.length',
	);
});
