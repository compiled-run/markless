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
