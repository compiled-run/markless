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
	expect(projected[0]).toMatchObject({
		projectedComponentEdgeId: edge.id,
		computedGraphNodeId: edge.children.text?.graphNodeId,
	});
	expect(projected[0]!.source).toContain('amount');
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

// Text-only children render as one text node inside the child, so the edge records the
// value that text follows and the child's `{children}` update is bound to it per edge.
function boundChildrenRoutes(result: Awaited<ReturnType<typeof compile>>) {
	return result.boundSymbolResolver.rows.flatMap((row) =>
		row.captureSlots.flatMap((slot) =>
			slot.legacyGraphRead?.path[0] === 'children'
				? [{ edge: row.componentEdgePath.at(-1), route: slot.route }]
				: [],
		),
	);
}

test('text-only children route the child text update to the value they render', async () => {
	const result = await compile(PAGE);
	const edge = result.semanticGraph.componentEdges.find(
		(candidate) => candidate.childComponentName === 'Label',
	)!;
	const text = edge.children.text!;
	expect(text.graphBindingKind).toBe('computed');
	const binding = result.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === text.graphNodeId,
	);
	expect(
		new Function('amount', `return (${binding?.functionSource})();`)(70),
	).toBe('Progress: 70%');
	expect(binding?.dependencies?.map((dependency) => dependency.graphNodeId)).toEqual([
		'state:amount',
	]);
	expect(boundChildrenRoutes(result)).toEqual([
		{
			edge: edge.id,
			route: expect.objectContaining({ kind: 'graph-reference', graphNodeId: text.graphNodeId }),
		},
	]);
});

test('alternate shape: a lone cell read routes straight to its cell, with no computed', async () => {
	const result = await compile(ALTERNATE);
	const edge = result.semanticGraph.componentEdges.find(
		(candidate) => candidate.childComponentName === 'Chip',
	)!;
	expect(edge.children.text).toMatchObject({ graphNodeId: 'state:hits', path: [] });
	expect(boundChildrenRoutes(result)).toEqual([
		{ edge: edge.id, route: expect.objectContaining({ graphNodeId: 'state:hits', path: [] }) },
	]);
});

test('children holding an element, or only static text, route nothing', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Label({ children }) @{
	<span>{children}</span>
}
export function Live() @{
	let amount = state(30);
	<section>
		<Label><i>{amount}</i></Label>
		<Label>fixed words</Label>
		<output>{amount}</output>
	</section>
}`);
	expect(result.semanticGraph.componentEdges.map((edge) => edge.children.text)).toEqual([
		undefined,
		undefined,
	]);
	expect(boundChildrenRoutes(result)).toEqual([]);
});

test('the child sizes its children hole as text beside static text and elements', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Note({ children }) @{
	<small>note: {children}</small>
}
export function Tag(props) @{
	<code>{props.children}<i>!</i></code>
}
export function Page() @{
	let hits = state(1);
	<p>
		<Note>{hits} hits</Note>
		<Tag>{hits}</Tag>
	</p>
}`);
	const targets = result.protocolView.domUpdates
		.filter((update) => update.path[0] === 'children')
		.map((update) => update.target);
	expect(targets).toEqual([
		{ kind: 'text', prefix: 'note: ' },
		{ kind: 'text', textNode: 0 },
	]);
});

test('a shared seed travels only with the component whose body writes it', async () => {
	const result = await compile(`import { shared, state } from '@markless/core';
const meter = shared(() => {
	const s = state({ own: '' });
	return s;
}, { scope: 'widget' });
export function MeterCaption({ children }) @{
	const m = meter();
	<em ui-own={m.own}>{children}</em>
}
export function MeterReadout({ children }) @{
	const m = meter();
	m.own = children;
	<b>{children}</b>
}
export function Page() @{
	let level = state(2);
	<div>
		<MeterCaption>{level} high</MeterCaption>
		<MeterReadout>level {level}</MeterReadout>
	</div>
}`);
	const seeds = result.protocolState.sharedSeeds ?? [];
	expect(seeds).toHaveLength(1);
	const ssr = result.publicRenderModule.ssrModuleSource;
	const selection = (name: string) =>
		/marklessSelectStateNodes\(marklessCloneState\(payloadState\), (.*?)\);/.exec(
			ssr.slice(ssr.indexOf(`async function marklessRenderSsr${name}(`)),
		)?.[1];
	expect(selection('MeterReadout')).toMatch(/, \[0\]$/);
	// The module's first component renders as its root entry.
	expect(selection('')).toMatch(/, \[\]$/);
	expect(selection('Page')).toMatch(/, \[\]$/);
});
