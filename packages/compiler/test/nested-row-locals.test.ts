import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { emitSymbolResolverModule } from '../src/passes/symbol-resolver-module.ts';

const NESTED = `import { state } from '@markless/core';
const SHELVES = [
	{ label: 'top', books: [{ isbn: '1' }, { isbn: '2' }] },
	{ label: 'low', books: [{ isbn: '1' }] },
];
function Book({ shelf, book }: { readonly shelf: { readonly label: string }; readonly book: { readonly isbn: string } }) @{
	const picked = state({ text: '' });
	<p>
		<button onClick={() => (picked.text = shelf.label + book.isbn)}>pick</button>
		<em>{picked.text}</em>
	</p>
}
export default function Library() @{
	<main>
		@for (const shelf of SHELVES; key shelf.label) {
			@for (const book of shelf.books; key book.isbn) {
				<Book shelf={shelf} book={book} />
			}
		}
	</main>
}
`;

// Inner rows of every outer row share one parent, so the item is named by its rows' keys rather than found by position.
test('a component in nested keyed rows reads each row item by its keys', async () => {
	const result = await compileTsrxModule({ filename: 'src/Library.tsrx', source: NESTED, symbols: [] });
	const [outer, inner] = result.semanticGraph.keyedRepeats;
	const routes = (result.captureAnalysis.boundResolverRows ?? []).flatMap((row) =>
		row.captureSlots.map((slot) => slot.route),
	);
	const outerStep = {
		rowIndex: 0,
		keyPath: ['label'],
		graphNodeId: outer!.collectionGraphNodeId,
		collectionPath: [],
	};

	expect(routes).toEqual([
		expect.objectContaining({ kind: 'row-local', itemName: 'shelf', rowPiece: 0, rows: [outerStep] }),
		expect.objectContaining({
			kind: 'row-local',
			itemName: 'book',
			rowPiece: 0,
			rows: [outerStep, { rowIndex: 1, keyPath: ['isbn'], itemPath: inner!.enclosingItemPath }],
		}),
	]);
	expect(
		emitSymbolResolverModule({ symbols: [], boundSymbols: result.boundSymbolResolver.rows }),
	).toContain('marklessRowLocal(bound, context.graph, route)');
});

const ROWED_CHAIN = `import { state } from '@markless/core';
const GROUPS = [{ name: 'a' }, { name: 'b' }];
function Press({ onPress }: { readonly onPress: () => void }) @{
	<button onClick={() => onPress()}>p</button>
}
function Leaf({ group, name }: { readonly group: string; readonly name: string }) @{
	const seen = state({ text: '' });
	<div>
		<Press onPress={() => (seen.text = group + name)} />
		<span>{seen.text}</span>
	</div>
}
function Group({ group }: { readonly group: { readonly name: string } }) @{
	<section>
		<Leaf group={group.name} name="x" />
		<Leaf group={group.name} name="y" />
	</section>
}
export default function Page() @{
	<div>
		@for (const group of GROUPS; key group.name) {
			<Group group={group} />
		}
	</div>
}
`;

// A keyed handler row names its callback's own keyed row, and how many of its pieces that row is placed by.
test('a callback two components deep in a keyed row is invoked through its own keyed row', async () => {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source: ROWED_CHAIN, symbols: [] });
	const rows = result.captureAnalysis.boundResolverRows ?? [];
	const rowIds = new Set(rows.map((row) => row.id));
	const routes = rows.flatMap((row) =>
		row.captureSlots.flatMap((slot) => (slot.route.kind === 'callback-route' ? [slot.route] : [])),
	);

	expect(routes).toHaveLength(2);
	for (const route of routes) {
		expect(rowIds.has(route.callbackSymbolId)).toBe(true);
		expect(route).toMatchObject({ callbackRowPieces: 2 });
		expect(route).not.toHaveProperty('composerPath');
	}
	expect(
		emitSymbolResolverModule({ symbols: [], boundSymbols: result.boundSymbolResolver.rows }),
	).toContain('marklessRowBoundCallbackGraph(bound, context.graph, route.callbackRowPieces)');
});
