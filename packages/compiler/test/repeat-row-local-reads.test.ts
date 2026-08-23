import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

/**
 * Reading a `@for` row local inside a handler.
 *
 * The row's item is not in the graph. The repeat runtime hands it to the emitted
 * module as `context.locals`, because the module runs outside the authored `@for`
 * callback that would otherwise have closed over it. Only the write band knew
 * that: `picked = row.id` lowered to `context.locals?.row?.id`, while the reads
 * next to it — `measure(row)`, `measure(row.id)` — were emitted as the author
 * wrote them and named nothing the module binds. Where the name also named a
 * component binding the unresolved-reference guard failed the build
 * (`repeat-row-shadowing.test.ts`); where it shadowed nothing, the module shipped
 * and threw a ReferenceError on the first click.
 *
 * These tests pin the read on the same route the write already took, in the
 * positions the write band recognizes, and pin the two positions the route cannot
 * express as loud build failures rather than quiet ones.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Rows.tsrx', source, symbols: [] });
}

/**
 * One repeat over `rows`, with `picked` as a component state cell so a graph read
 * and a row-local read can appear in the same expression.
 *
 * The row body holds exactly one element: the parser closes the `@for` on the
 * row's single root, so a second sibling there is a parse error, not a second
 * handler.
 */
function rowsPage(rowBody: string) {
	return `
import { state } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = state([{ id: 'a' }]);
	let picked = state('none');

	<div>
		<p>{picked}</p>
		@for (const row of rows; key row.id) {
${rowBody}
		}
	</div>
}
`;
}

async function handlerSource(rowBody: string): Promise<string> {
	const result = await compile(rowsPage(rowBody));
	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const handlers = result.symbolModules.modules.filter(
		(module) => module.kind === 'event-handler',
	);
	expect(handlers).toHaveLength(1);

	return handlers[0]?.source ?? '';
}

test('a bare row local passed as a call argument reads the row item', async () => {
	const source = await handlerSource(`\t\t\t<button onClick={() => measure(row)}>row</button>`);

	// The whole item, not a field of it: the row local names the item itself.
	expect(source).toContain('measure(context.locals?.row)');
});

test('a member path off a row local reads through the same optional chain', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => measure(row.id)}>row</button>`,
	);

	// The same text the write band emits for `picked = row.id`, so a read and a
	// write of one field name one value.
	expect(source).toContain('measure(context.locals?.row?.id)');
});

test('a read and a write of the same field lower to the same expression', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => { picked = row.id; }}>row</button>`,
	);

	expect(source).toContain('context.locals?.row?.id');
	expect(source).toContain('state:picked');
});

test('a row local read inside a nested arrow is lowered too', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => [1].forEach((n) => measure(row, n))}>row</button>`,
	);

	// The nested callback runs inside the dispatched module, so it reaches the
	// same `context.locals` the handler body does.
	expect(source).toContain('measure(context.locals?.row, n)');
});

test('a row local and a graph read in one expression each keep their own route', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => measure(row, picked)}>row</button>`,
	);

	expect(source).toContain(
		'measure(context.locals?.row, context.graph.read("state:picked"))',
	);
});

test('a row local read lowers in a template literal and in a conditional', async () => {
	const template = await handlerSource(
		'\t\t\t<button onClick={() => measure(`x${row.id}`)}>row</button>',
	);
	expect(template).toContain('`x${context.locals?.row?.id}`');

	const conditional = await handlerSource(
		`\t\t\t<button onClick={() => measure(row.id ? row : picked)}>row</button>`,
	);
	expect(conditional).toContain(
		'context.locals?.row?.id ? context.locals?.row : context.graph.read("state:picked")',
	);
});

test('an object literal expands a shorthand row local rather than leaving it bare', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => measure({ row, id: row.id })}>row</button>`,
	);

	// `{ row }` can no longer be spelled by its key once the value is rewritten.
	expect(source).toContain('{ row: context.locals?.row, id: context.locals?.row?.id }');
});

test('a computed key off a row local lowers the base and the key separately', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => measure(row[picked])}>row</button>`,
	);

	// The dotted-path route cannot spell `row[picked]`, so the walk descends and
	// each half takes the route that fits it.
	expect(source).toContain('(context.locals?.row)[context.graph.read("state:picked")]');
});

test('a nested parameter of the row local name is that parameter, not the row item', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => [1].map((row) => measure(row))}>row</button>`,
	);

	// The callback's own parameter shadows the row. Lowering it would hand the
	// row's item to code that asked for the callback's argument — a wrong read
	// that reads like a correct one, which is the failure this whole lowering
	// exists to avoid.
	expect(source).toContain('[1].map((row) => measure(row))');
	expect(source).not.toContain('context.locals');
});

test('a declaration of the row local name inside the handler is that declaration', async () => {
	const source = await handlerSource(
		`\t\t\t<button onClick={() => { const row = 1; measure(row); }}>row</button>`,
	);

	expect(source).toContain('const row = 1');
	expect(source).not.toContain('context.locals');
});

test('assigning to a row local fails the build instead of shipping a free name', async () => {
	const result = await compile(
		rowsPage(`\t\t\t<button onClick={() => { row.hit = 1; }}>row</button>`),
	);

	// `context.locals?.row.hit = 1` is not a legal assignment target, so the
	// authored name stands — and a module naming something it never binds must
	// not ship. The message has to say row item, not state binding: hoisting the
	// read into a local, which is the state advice, reads the same missing name.
	const diagnostics = result.symbolModules.diagnostics;
	expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(diagnostics[0]?.message).toContain('item of the enclosing @for row');
	expect(diagnostics[0]?.severity).toBe('error');
});

test('calling a row local as a function fails the build', async () => {
	const result = await compile(rowsPage(`\t\t\t<button onClick={() => row(1)}>row</button>`));

	expect(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
});

test('a method called on the row item still lowers the item it is called on', async () => {
	const source = await handlerSource(`\t\t\t<button onClick={() => row.go(1)}>row</button>`);

	// Only a bare callee is refused: the receiver of a method call is an ordinary
	// read, and parenthesizing it keeps the optional chain out of callee position.
	expect(source).toContain('(context.locals?.row).go(1)');
});
