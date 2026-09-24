import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * A `@for` inside another `@for`'s row renders once per enclosing row. Its record
 * names the enclosing repeat and the path from each enclosing row to its parent,
 * so the browser wires one instance per enclosing row; a collection spelled as a
 * path on the enclosing row item is read through that item.
 */
async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/nested.tsrx', source, symbols: [] });
}

function errors(result: Awaited<ReturnType<typeof compile>>) {
	return [
		...result.semanticGraph.diagnostics,
		...result.stateLowering.diagnostics,
		...result.symbolModules.diagnostics,
	].filter((diagnostic) => diagnostic.severity === 'error');
}

const library = (inner: string, extra = '') => `import { state } from '@markless/core';
export function Library() @{
	let shelves = state([{ id: 's', opened: 0, books: [{ isbn: '1', reads: 0 }] }]);
	const tags = state([{ isbn: 't', reads: 0 }]);
	let opened = state('');
	<section>
		@for (const shelf of shelves; key shelf.id) {
			<article>
				<h2>{shelf.id}</h2>
				<ul>
					@for (const book of ${inner}; key book.isbn) {
						<li><button onClick={() => { opened = book.isbn;${extra} }}>{book.isbn}</button></li>
					}
				</ul>
			</article>
		}
	</section>
	<p>{opened}</p>
}
`;

test('a nested @for over the enclosing row item names its enclosing repeat and parent path', async () => {
	const result = await compile(library('shelf.books'));
	expect(errors(result)).toEqual([]);
	const [outer, inner] = result.protocolView.keyedRepeats ?? [];
	expect(outer).not.toHaveProperty('enclosingRow');
	expect(inner?.enclosingRow).toEqual({
		repeatId: outer?.id,
		parentHostPath: [1],
		itemPath: ['books'],
	});
	expect(inner?.collectionGraphNodeId).toBe('state:shelves');
	expect(inner?.collectionPath).toEqual(['*', 'books']);
	expect(inner?.rowEvents).toEqual([
		expect.objectContaining({ hostPath: [0], eventName: 'click' }),
	]);
});

test('a nested @for over a graph collection still wires once per enclosing row', async () => {
	const result = await compile(library('tags'));
	expect(errors(result)).toEqual([]);
	const inner = result.protocolView.keyedRepeats?.[1];
	expect(inner?.collectionGraphNodeId).toBe('state:tags');
	expect(inner?.enclosingRow).toEqual({ repeatId: 'repeat:0', parentHostPath: [1] });
});

test('an enclosing row whose nested rows can all be minted ships a row template', async () => {
	const result = await compile(library('shelf.books'));
	const [outer] = result.protocolView.keyedRepeats ?? [];
	expect(outer?.rowTemplate?.html).toBe(
		'<article><h2><!--markless-slot:0--></h2><ul><!--markless-slot:1--></ul></article>',
	);
	expect(
		result.publicRenderPlan.diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_KEYED_REPEAT_ROW_MINT_UNSUPPORTED',
		),
	).toEqual([]);
});

test('a write through a nested row item reaches its element through the enclosing row', async () => {
	const result = await compile(library('shelf.books', ' book.reads++; shelf.opened++;'));
	expect(errors(result)).toEqual([]);
	const handler = result.symbolModules.modules.find((module) => module.kind === 'event-handler');
	expect(handler?.source).toContain(
		'marklessRowItemPath(context, "state:shelves", marklessRowItemPath(context, "state:shelves", [], "shelf", ["id"], ["books"]), "book", ["isbn"], ["reads"])',
	);
	expect(handler?.source).toContain(
		'marklessRowItemPath(context, "state:shelves", [], "shelf", ["id"], ["opened"])',
	);
});

test('nested rows reading the enclosing item through an expression fail the compile', async () => {
	const result = await compile(library('shelf.books.filter((book) => book.isbn)'));
	expect(result.semanticGraph.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_REPEAT_ROW_HANDLERS_UNWIRED',
			severity: 'error',
			message: expect.stringContaining('@for (const shelf of ...)'),
		}),
	]);
});

test('nested rows inside an enclosing @for keyed by position fail the compile', async () => {
	const result = await compile(
		library('shelf.books').replace('shelves; key shelf.id', 'shelves; index slot; key slot'),
	);
	expect(result.semanticGraph.diagnostics).toContainEqual(
		expect.objectContaining({ code: 'MARKLESS_REPEAT_ROW_HANDLERS_UNWIRED', severity: 'error' }),
	);
});

test('a @for inside no other repeat carries no enclosing row', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function List() @{
	const rows = state([{ id: 'a' }]);
	let picked = state('');
	<ul>
		@for (const row of rows; key row.id) {
			<li><button onClick={() => (picked = row.id)}>{row.id}</button></li>
		}
	</ul>
	<p>{picked}</p>
}
`);
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('enclosingRow');
});

test('only the nested record folds in the per-enclosing-row wiring module', async () => {
	const result = await compile(library('shelf.books'));
	const modules = (id: string) =>
		result.runtimeDemandMap.payloadRecords?.find((record) => record.recordId === `keyed-repeat:${id}`)
			?.runtimeModuleIds ?? [];
	expect(modules('repeat:1')).toContain('web/fns/nested-repeats');
	expect(modules('repeat:0')).not.toContain('web/fns/nested-repeats');
});

// Neither shape is wired per enclosing row yet, so each refuses the build by name
// rather than serving rows that go stale.
test('nested rows inside a sync @if arm fail the compile', async () => {
	const result = await compile(
		library('shelf.books')
			.replace('<section>', '<section>@if (opened) {<div>')
			.replace('</section>', '</div>}</section>'),
	);
	expect(
		[...errors(result), ...result.publicRenderPlan.diagnostics].map((diagnostic) => diagnostic.code),
	).toContain('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED');
});

test('an element() handle bound in a nested row fails the compile by naming the nesting', async () => {
	const result = await compile(
		library('shelf.books')
			.replace("let opened = state('');", "let opened = state('');\n\tconst bookEls = element<HTMLElement[]>();")
			.replace("import { state } from '@markless/core';", "import { element, state } from '@markless/core';")
			.replace('<li>', '<li el={bookEls}>'),
	);
	expect(result.semanticGraph.diagnostics).toContainEqual(
		expect.objectContaining({
			code: 'MARKLESS_ROW_ELEMENT_HANDLE_UNSUPPORTED',
			severity: 'error',
			message: expect.stringContaining('nested in another @for row'),
		}),
	);
});
