import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

// Pins the yuku-tsrx parse boundary: a member-expression tag (<family.part>)
// holds a construct in its children exactly as the identifier spelling does,
// and the construct lands in the component-projection chunk either way.

function moduleWith(body: string) {
	return `import { state } from '@markless/core';
import { toaster } from './ui.ts';
import { ToasterRoot } from './toaster-root.ts';

export function App() @{
	let items = state(['a', 'b']);
	let open = state(true);

${body}
}`;
}

async function graphOf(body: string) {
	return buildSemanticGraph({ filename: 'src/Dotted.tsrx', source: moduleWith(body) });
}

function projectionSlotKinds(graph: Awaited<ReturnType<typeof graphOf>>) {
	return graph.markup.chunks
		.filter((chunk) => chunk.kind === 'component-projection')
		.map((chunk) => chunk.slots.map((slot) => slot.kind));
}

test('an identifier tag holds @for and @if in its children', async () => {
	expect(
		projectionSlotKinds(
			await graphOf(`	<ToasterRoot>
		@for (const item of items; key item) {
			<p>{item}</p>
		}
	</ToasterRoot>`),
		),
	).toEqual([['repeat']]);
	expect(
		projectionSlotKinds(
			await graphOf(`	<ToasterRoot>
		@if (open) {
			<p>x</p>
		}
	</ToasterRoot>`),
		),
	).toEqual([['branch']]);
});

test('a member-expression tag holds plain elements in its children', async () => {
	const graph = await graphOf(`	<toaster.root>
		<p>x</p>
	</toaster.root>`);
	expect(graph.diagnostics).toEqual([]);
	expect(projectionSlotKinds(graph)).toEqual([[]]);
});

test('a member-expression tag holds @for in its children', async () => {
	const graph = await graphOf(`	<toaster.root>
		@for (const item of items; key item) {
			<p>{item}</p>
		}
	</toaster.root>`);
	expect(graph.diagnostics).toEqual([]);
	expect(projectionSlotKinds(graph)).toEqual([['repeat']]);
});

test('a member-expression tag holds @if in its children', async () => {
	const graph = await graphOf(`	<toaster.root>
		@if (open) {
			<p>x</p>
		}
	</toaster.root>`);
	expect(graph.diagnostics).toEqual([]);
	expect(projectionSlotKinds(graph)).toEqual([['branch']]);
	expect(graph.branchSites).toHaveLength(1);
});

test('nesting the member-expression tag under an element keeps the construct in the projection', async () => {
	const graph = await graphOf(`	<section>
		<toaster.root>
			@for (const item of items; key item) {
				<p>{item}</p>
			}
		</toaster.root>
	</section>`);
	expect(graph.diagnostics).toEqual([]);
	expect(projectionSlotKinds(graph)).toEqual([['repeat']]);
});
