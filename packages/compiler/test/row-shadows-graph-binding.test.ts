import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const compile = (source: string) =>
	compileTsrxModule({ filename: 'src/Shelf.tsrx', source, symbols: [] });

test('a @for row named like an async computed does not gate its boundary on that computed', async () => {
	const result = await compile(`
import { computed } from '@markless/core';
import { load } from './load.ts';

export default function Shelf() @{
	const list = computed(async () => load(['one', 'two']));
	const rows = computed(() => (Array.isArray(list) ? list : []).map((w, i) => ({ id: i, text: w })));
	const item = computed(async () => load({ text: 'the item' }));

	<main>
		<ul>
			@try {
				@for (const item of rows; key item.id) {
					<li class={item.text}>{item.text}</li>
				}
			} @pending {
				<li>pending</li>
			}
		</ul>
		@try {
			<p>{item.text}</p>
		} @pending {
			<p>pending</p>
		}
	</main>
}
`);
	const [rowsBoundary, itemBoundary] = result.renderData.boundaries ?? [];
	expect(rowsBoundary?.reads.map((read) => read.graphNodeId)).toEqual(['computed:rows']);
	expect(itemBoundary?.reads.map((read) => read.graphNodeId)).toEqual(['computed:item']);
	expect(
		result.semanticGraph.templateReads.filter((read) => read.source.startsWith('item.')),
	).toEqual([expect.objectContaining({ source: 'item.text', asyncBoundaryId: 'boundary:1' })]);
});

test('a row named like a component state keeps @if tests, nested collections and composites on the row', async () => {
	const result = await compile(`
import { state } from '@markless/core';

export default function Board() @{
	let entry = state({ text: 'outer', done: true, parts: [] });
	const entries = state([{ id: 1, text: 'a', done: false, parts: [{ id: 2, text: 'p' }] }]);

	<ul>
		@for (const entry of entries; key entry.id) {
			<li>
				<span>{\`\${entry.text}!\`}</span>
				<div>
					@for (const part of entry.parts; key part.id) {
						<i>{part.text}</i>
					}
				</div>
				@if (entry.done) {
					<b>done</b>
				}
			</li>
		}
		<p>{entry.text}</p>
	</ul>
}
`);
	const graph = result.semanticGraph;
	expect(graph.branchSites).toEqual([expect.objectContaining({ testReadsRowItem: true })]);
	expect(graph.keyedRepeats.find((repeat) => repeat.itemName === 'part')).not.toHaveProperty(
		'collectionGraphNodeId',
		'state:entry',
	);
	const outerReads = graph.templateReads.filter((read) => read.source.includes('entry'));
	expect(outerReads.map((read) => read.source)).toEqual(['entry.text']);
	expect(
		result.symbolResolver.symbols.find((symbol) => symbol.kind === 'branch-update'),
	).toMatchObject({ testReads: [] });
});
