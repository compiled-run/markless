import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const oops = `
export default function Oops({ message }) @{
	<p>{message}</p>
}
`;

const page = (catchBody: string) => `
import { computed } from '@markless/core';
import Oops from './oops.tsrx';

export default function Page() @{
	const item = computed(async () => {
		throw new Error('Not Found');
	});
	@try {
		<p>{item}</p>
	} @catch (error) {
		${catchBody}
	}
}
`;

async function compilePage(catchBody: string) {
	const child = await compileTsrxModule({ filename: 'src/oops.tsrx', source: oops, symbols: [] });
	const update = child.captureAnalysis.extractedSymbols.find(
		(symbol) => symbol.kind === 'dom-update',
	)!;
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source: page(catchBody),
		symbols: [
			{
				id: 'imported:Oops:symbol:message',
				chunk: 'virtual:markless:symbol:Oops:message',
				exportName: 'message',
				componentEdgeId: 'component-edge:0',
				captureSymbol: update,
			},
		],
	});
}

const errors = (result: Awaited<ReturnType<typeof compilePage>>) =>
	[...result.semanticGraph.diagnostics, ...result.captureAnalysis.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);

test('a @catch passing error.message to a component from another file reads it from the error cell', async () => {
	const result = await compilePage('<Oops message={error.message} />');
	const boundary = result.semanticGraph.asyncBoundaries[0]!;
	const prop = result.semanticGraph.componentEdges[0]!.props.find(
		(item) => item.name === 'message',
	);

	expect(boundary.errorGraphNodeId).toBeDefined();
	expect(prop).toMatchObject({
		kind: 'graph-reference',
		graphNodeId: boundary.errorGraphNodeId,
		path: ['message'],
	});
	expect(errors(result)).toEqual([]);
});

test('an expression over the error reaches the component through a computed over the error cell', async () => {
	const result = await compilePage("<Oops message={error.message ?? 'Something went wrong'} />");
	const boundary = result.semanticGraph.asyncBoundaries[0]!;
	const prop = result.semanticGraph.componentEdges[0]!.props.find(
		(item) => item.name === 'message',
	);
	const computed = result.semanticGraph.graphBindings.find(
		(binding) => prop?.kind === 'graph-reference' && binding.id === prop.graphNodeId,
	);

	expect(prop).toMatchObject({ kind: 'graph-reference', graphBindingKind: 'computed' });
	expect(computed?.dependencies?.map((dependency) => dependency.graphNodeId)).toEqual([
		boundary.errorGraphNodeId,
	]);
	expect(errors(result)).toEqual([]);
});

test('a prop that reads no @catch binding keeps its own route', async () => {
	const result = await compilePage("<Oops message={'Not Found'} />");

	expect(result.semanticGraph.asyncBoundaries[0]!.errorGraphNodeId).toBeUndefined();
	expect(result.semanticGraph.componentEdges[0]!.props[0]).toMatchObject({
		kind: 'serializable',
	});
});

test('error.name reaches a component from the error cell', async () => {
	const result = await compilePage('<Oops message={error.name} />');
	const cell = result.semanticGraph.asyncBoundaries[0]!.errorGraphNodeId;

	expect(result.semanticGraph.componentEdges[0]!.props[0]).toMatchObject({
		kind: 'graph-reference',
		graphNodeId: cell,
		path: ['name'],
	});
	expect(errors(result)).toEqual([]);
});

test('a nested @try reads its own boundary error cell', async () => {
	const source = `
import { computed } from '@markless/core';
import Oops from './oops.tsrx';

export default function Page() @{
	const outer = computed(async () => 'outer');
	const inner = computed(async () => 'inner');
	@try {
		<>
			<p>{outer}</p>
			@try {
				<p>{inner}</p>
			} @catch (error) {
				<Oops message={error.message} />
			}
		</>
	} @catch (error) {
		<Oops message={error.message} />
	}
}
`;
	const result = await compileTsrxModule({ filename: 'src/page.tsrx', source, symbols: [] });
	const cells = result.semanticGraph.asyncBoundaries.map((boundary) => boundary.errorGraphNodeId);
	const props = result.semanticGraph.componentEdges.map(
		(edge) => edge.props.find((item) => item.name === 'message') as { graphNodeId?: string } | undefined,
	);

	expect(new Set(cells).size).toBe(2);
	expect(props.map((prop) => prop?.graphNodeId).sort()).toEqual([...cells].sort());
	expect(errors(result)).toEqual([]);
});

const lost = async (catchBody: string) =>
	errors(await compilePage(catchBody)).map((diagnostic) => {
		const line = page(catchBody).slice(0, diagnostic.primarySpan?.start).split('\n').length;
		return `${diagnostic.code} ${line}: ${diagnostic.message}`;
	});

test('a field the server render drops, or the whole error passed on, is refused at the line that reads it', async () => {
	expect(await lost('<Oops message={error.cause} />')).toEqual([
		"MARKLESS_CATCH_ERROR_FIELD_LOST 12: `error.cause` reads `cause` from the `@catch` error, but a server-rendered page sends the browser only the error's name and message, so `cause` would be missing once the page loads.",
	]);
	expect(await lost("<Oops message={error.code ?? 'none'} />")).toEqual([
		expect.stringMatching(/^MARKLESS_CATCH_ERROR_FIELD_LOST 12: `error\.code \?\? 'none'` reads `code`/),
	]);
	expect(await lost('<Oops message={error} />')).toEqual([
		"MARKLESS_CATCH_ERROR_FIELD_LOST 12: `error` passes the whole `@catch` error to <Oops>, but a server-rendered page sends the browser only the error's name and message, so any other field <Oops> reads would be missing once the page loads.",
	]);
	expect(await lost('<p>{error.message} ({error.cause})</p>')).toEqual([
		expect.stringMatching(/^MARKLESS_CATCH_ERROR_FIELD_LOST 12: `error\.message` reads `cause`/),
	]);
});
