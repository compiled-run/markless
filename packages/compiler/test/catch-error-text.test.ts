import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

// Pass tsrx-semantic-graph: text joining a `@catch` error with graph reads reads the error from a cell the shown arm writes.

const page = `import { computed, state } from '@markless/core';

export default function Page() @{
	let attempt = state(1);
	const report = computed(async () => ({ title: 'ok' }));

	<section>
		@try {
			<p>{report.title}</p>
		} @catch (error, reset) {
			<>
				<p>{error.message} (attempt {attempt})</p>
				<button onClick={reset}>Retry</button>
			</>
		}
		<button onClick={() => attempt++}>Next</button>
	</section>
}
`;

// Same structure, every name changed: a child component, a renamed error, a prop read, and a second block that only shows the error.
const alternate = `import { computed, state } from '@markless/core';

export function Shelf({ label }: { label: string }) @{
	let error = state('outer');
	let tries = state(0);
	const books = computed(async () => [label]);
	const totals = computed(async () => 3);

	<div>
		<em>{error}</em>
		@try {
			<span>{totals}</span>
		} @catch (oops) {
			<b>{oops.message}</b>
		}
		@try {
			<ol>{books.length}</ol>
		} @catch (problem) {
			<i>Shelf {label}: {problem.message}, tries {tries}</i>
		}
		<button onClick={() => tries++}>Again</button>
	</div>
}
`;

const cellsOf = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.graphBindings.filter((binding) =>
		graph.asyncBoundaries.some((boundary) => boundary.errorGraphNodeId === binding.id),
	);

test('a @catch text joining the error with state reads the error from the boundary cell', async () => {
	const graph = await buildSemanticGraph({ filename: 'src/Page.tsrx', source: page });
	expect(graph.diagnostics).toEqual([]);
	const [cell] = cellsOf(graph);
	expect(cell).toMatchObject({ kind: 'state', initialValue: null, initialValueKnown: true });
	expect(graph.asyncBoundaries[0]?.errorGraphNodeId).toBe(cell!.id);
	const read = graph.templateReads.find((candidate) => candidate.source.includes('error.message'))!;
	const joined = graph.graphBindings.find((binding) => binding.id === read.computedGraphNodeId)!;
	expect(joined.dependencies).toEqual([
		{
			source: 'error.message',
			graphNodeId: cell!.id,
			path: ['message'],
			local: { name: 'error', members: ['message'] },
		},
		{
			source: 'attempt',
			graphNodeId: 'state:attempt',
			path: [],
			local: { name: 'attempt', members: [] },
		},
	]);
	// One update for the whole run of text: the `{attempt}` hole no longer rewrites the element on its own.
	expect(graph.templateReads.filter((candidate) => candidate.hostNodeId === read.hostNodeId)).toEqual([read]);
});

test('only the block whose text joins its error gets a cell, and the error resolves by binding, not by name', async () => {
	const graph = await buildSemanticGraph({ filename: 'src/Shelf.tsrx', source: alternate });
	expect(graph.diagnostics).toEqual([]);
	const cells = cellsOf(graph);
	expect(cells).toHaveLength(1);
	expect(graph.asyncBoundaries.map((boundary) => !!boundary.errorGraphNodeId)).toEqual([false, true]);
	const read = graph.templateReads.find((candidate) => candidate.source.includes('problem.message'))!;
	const joined = graph.graphBindings.find((binding) => binding.id === read.computedGraphNodeId)!;
	expect(joined.dependencies?.map((dependency) => dependency.graphNodeId)).toEqual([
		'prop:props',
		cells[0]!.id,
		'state:tries',
	]);
	// The page state named `error` outside the blocks is still that state.
	expect(graph.templateReads.find((candidate) => candidate.source === 'error')).toBeDefined();
	expect(graph.graphBindings.find((binding) => binding.name === 'error')?.id).toBe('state:error');
});

test('a page without the shape compiles exactly as before: no cell, no render-data field', async () => {
	const source = page.replace('{error.message} (attempt {attempt})', '{error.message}');
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(cellsOf(result.semanticGraph)).toEqual([]);
	expect(result.renderData.boundaries[0]).not.toHaveProperty('errorGraphNodeId');
	expect(result.protocolState.cells.map((cell) => cell.graphNodeId)).toEqual(['state:attempt']);
});

test('the server render writes the shown error into the cell, and handlers still refuse the error', async () => {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source: page, symbols: [] });
	const cell = result.semanticGraph.asyncBoundaries[0]!.errorGraphNodeId!;
	expect(result.renderData.boundaries[0]?.errorGraphNodeId).toBe(cell);
	expect(result.publicRenderModule.ssrModuleSource).toContain(
		`marklessSsrCatchError(marklessSsrRenderStateValues,marklessSsrPayloadState,${JSON.stringify(cell)},marklessSsrSnapshot.error,marklessSsrRenderContext,"boundary:0")`,
	);
	const handler = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: page.replace('onClick={reset}', 'onClick={() => console.log(error.message)}'),
		symbols: [],
	});
	expect(handler.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_HANDLER_READS_RENDER_LOCAL',
	);
});

test('one template literal mixing the error with state is still refused at build time', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Page.tsrx',
		source: page.replace('{error.message} (attempt {attempt})', '{`${error.message} (attempt ${attempt})`}'),
	});
	expect(graph.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_TEMPLATE_EXPRESSION_UNSUPPORTED',
	);
	expect(cellsOf(graph)).toEqual([]);
});
