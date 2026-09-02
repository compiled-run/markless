/**
 * A cell interpolated inside a child component's children (`<Label>Progress:
 * {amount}%</Label>`) is projected into the child: the parent module has no
 * host of its own for it. Filed on the element around the edge, its text
 * update rewrote that element's whole content on the first write - a section
 * holding the child, a button and an `<output>` became the text `70`.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

const PAGE = `import { state } from '@markless/core';
export function Label({ children, ...rest }) @{
	<span {...rest}>{children}</span>
}
export default function Live() @{
	let amount = state(30);
	<section>
		<Label data-testid="label">Progress: {amount}%</Label>
		<button type="button" onClick={() => { amount = 70; }}>Change</button>
		<output>{amount}</output>
	</section>
}`;

// The same shape under other names: the edge sits after the sibling, the
// projected read is bare, and the enclosing element is an article.
const ALTERNATE = `import { state } from '@markless/core';
export function Chip({ children, ...rest }) @{
	<em {...rest}>{children}</em>
}
export function Board() @{
	let hits = state(2);
	<article>
		<b>{hits}</b>
		<button type="button" onClick={() => { hits = hits + 1; }}>More</button>
		<Chip title="count">{hits}</Chip>
	</article>
}`;

test('a cell read in a child edge and in a sibling text slot updates the sibling alone', async () => {
	const result = await compile(PAGE);
	const section = result.semanticGraph.hostNodes.find((host) => host.tagName === 'section')!;
	const output = result.semanticGraph.hostNodes.find((host) => host.tagName === 'output')!;

	const amountUpdates = result.protocolView.domUpdates.filter(
		(update) => update.source === 'amount',
	);
	expect(amountUpdates.map((update) => update.hostNodeId)).toEqual([output.id]);
	expect(amountUpdates[0]!.target).toEqual({ kind: 'text' });
	expect(amountUpdates[0]!.symbolId).toBeDefined();
	expect(result.protocolView.domUpdates.some((update) => update.hostNodeId === section.id)).toBe(
		false,
	);
});

test('the projected read stays in the graph, named by the edge it is projected through', async () => {
	const result = await compile(PAGE);
	const edge = result.semanticGraph.componentEdges.find(
		(candidate) => candidate.childComponentName === 'Label',
	)!;
	const projected = result.semanticGraph.templateReads.filter(
		(read) => read.projectedComponentEdgeId !== undefined,
	);
	expect(projected).toHaveLength(1);
	expect(projected[0]).toMatchObject({ source: 'amount', projectedComponentEdgeId: edge.id });
});

test('alternate shape: the bare projected read and the sibling read split the same way', async () => {
	const result = await compile(ALTERNATE);
	const article = result.semanticGraph.hostNodes.find((host) => host.tagName === 'article')!;
	const bold = result.semanticGraph.hostNodes.find((host) => host.tagName === 'b')!;

	const hitUpdates = result.protocolView.domUpdates.filter((update) => update.source === 'hits');
	expect(hitUpdates.map((update) => update.hostNodeId)).toEqual([bold.id]);
	expect(result.protocolView.domUpdates.some((update) => update.hostNodeId === article.id)).toBe(
		false,
	);
	expect(
		result.semanticGraph.templateReads.filter((read) => read.projectedComponentEdgeId),
	).toHaveLength(1);
});

test('a read hosted by its own element inside the children is not projected', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Label({ children, ...rest }) @{
	<span {...rest}>{children}</span>
}
export function Live() @{
	let amount = state(30);
	<section>
		<Label><i>{amount}</i></Label>
		<output>{amount}</output>
	</section>
}`);
	const italic = result.semanticGraph.hostNodes.find((host) => host.tagName === 'i')!;
	const output = result.semanticGraph.hostNodes.find((host) => host.tagName === 'output')!;
	expect(
		result.protocolView.domUpdates
			.filter((update) => update.source === 'amount')
			.map((update) => update.hostNodeId)
			.sort(),
	).toEqual([italic.id, output.id].sort());
	expect(
		result.semanticGraph.templateReads.filter((read) => read.projectedComponentEdgeId),
	).toHaveLength(0);
});
