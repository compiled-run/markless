import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// The shapes the async docs list as stopping the build inside @try, each with its code.
async function codesFor(body: string, recipe = 'async () => ({ total: 1, rows: [{ id: 1 }] })') {
	const source = `import { computed, state } from '@markless/core';
import { load } from './load.ts';
export default function Report() @{
	let days = state(7);
	let shelf = state<Record<string, number>>({ a: 1 });
	const report = computed(${recipe});
	<section>
		${body}
	</section>
}
`;
	const result = await compileTsrxModule({ filename: 'src/Report.tsrx', source, symbols: [] });
	return [
		...result.semanticGraph.diagnostics,
		...result.publicRenderModule.diagnostics,
	]
		.filter((diagnostic) => diagnostic.severity === 'error')
		.map((diagnostic) => (diagnostic.code === 'MARKLESS_PARSE_ERROR' ? diagnostic.message : diagnostic.code));
}

test('@try needs @pending or @catch after it, and either one alone is enough', async () => {
	expect((await codesFor('@try { <p>{report.total}</p> }')).join()).toContain('TSRX1010');
	expect(await codesFor('@try { <p>{report.total}</p> } @pending { <p>…</p> }')).toEqual([]);
	expect(
		await codesFor('@try { <p>{report.total}</p> } @catch (error) { <p>{error.message}</p> }'),
	).toEqual([]);
});

test.each([
	['two nodes in @try', '@try { <h2>a</h2>\n<p>{report.total}</p> } @pending { <p>…</p> }', 'MARKLESS_BLOCK_SIBLING_NODES'],
	['a read outside @try', '<p>{report.total}</p>', 'MARKLESS_ASYNC_BOUNDARY_REQUIRED'],
	[
		'a keyed @for over an async field outside @try',
		'<ul>@for (const row of report.rows; key row.id) { <li>{row.id}</li> }</ul>',
		'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
	],
	[
		'@pending after @catch',
		'@try { <p>{report.total}</p> } @catch { <p>x</p> } @pending { <p>y</p> }',
		'MARKLESS_ASYNC_ARM_ORDER',
	],
	['@catch after an element', '<p>x</p> @catch { <p>y</p> }', 'MARKLESS_ASYNC_CATCH_WITHOUT_TRY'],
	[
		'a keyed row of two nodes that holds an @if',
		'@try { <ul>@for (const row of report.rows; key row.id) { <>@if (row.id) { <li>a</li> } @else { <li>c</li> }<li>b</li></> }</ul> } @pending { <p>…</p> }',
		'MARKLESS_KEYED_REPEAT_ROW_NOT_ONE_ELEMENT',
	],
])('%s stops the build', async (_name, body, code) => {
	expect(await codesFor(body)).toContain(code);
});

test('a lookup keyed by an awaited answer stops the build', async () => {
	expect(
		await codesFor(
			'@try { <p>{report}</p> } @pending { <p>…</p> }',
			'async () => shelf[(await load()).id]',
		),
	).toContain('MARKLESS_ASYNC_POST_AWAIT_READ');
});

test('a click handler can read fields of the async value and catch its own failed await', async () => {
	expect(
		await codesFor(`@try {
			<button onClick={async () => {
				try {
					await load(report.total);
					days = 1;
				} catch {
					days = 0;
				}
			}}>{report.total}</button>
		} @pending {
			<p>…</p>
		}`),
	).toEqual([]);
});

test('a keyed @for over an async list outside @try stops the build at the list it reads', async () => {
	const source = `import { computed } from '@markless/core';
import { load } from './load.ts';
export default function Shelf() @{
	const books = computed(async () => load());
	const titles = computed(() => books.map((book) => book.title));
	<ol>
		@for (const book of books; key book.isbn) {
			<li>{book.title}</li>
		}
		@for (const title of titles; key title) {
			<li>{title}</li>
		}
	</ol>
}
`;
	const result = await compileTsrxModule({ filename: 'src/Shelf.tsrx', source, symbols: [] });
	const refused = result.semanticGraph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_ASYNC_BOUNDARY_REQUIRED',
	);
	expect(
		refused.map((diagnostic) => [
			diagnostic.message,
			source.slice(diagnostic.primarySpan!.start, diagnostic.primarySpan!.end),
		]),
	).toEqual([
		['Cannot read async computed "books" outside @try/@pending/@catch. Wrap the read in an async boundary.', 'books'],
		['Cannot read async-capable computed "titles" outside @try/@pending/@catch. Wrap the read in an async boundary.', 'titles'],
	]);
});

test('a keyed @for over an async list inside @try builds', async () => {
	expect(
		await codesFor(
			'@try { <ul>@for (const row of report.rows; key row.id) { <li>{row.id}</li> }</ul> } @pending { <p>…</p> }',
		),
	).toEqual([]);
});
