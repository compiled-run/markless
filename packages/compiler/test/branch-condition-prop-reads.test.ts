import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// An @if in a child whose condition reads into a prop, or combines props, is a computed the parent's routes feed.

const page = (condition: string) => `
import { state } from '@markless/core';

function Row({ post, opened, count }: { post: { id: number }; opened: number[]; count: number }) @{
	<li>
		@if (${condition}) {
			<span>open</span>
		} @else if (opened.length > 1) {
			<span>many</span>
		}
	</li>
}

export default function Page() @{
	let posts = state([{ id: 1 }, { id: 2 }]);
	let opened = state<number[]>([]);
	let count = state(0);

	<ul>
		@for (const post of posts; key post.id) {
			<Row post={post} opened={opened} count={count} />
		}
	</ul>
}
`;

async function compile(condition: string) {
	return await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: page(condition),
		symbols: [],
	});
}

test.each(['opened.includes(post.id)', 'opened.length > 0', 'count > post.id', 'count > 0'])(
	'semantic-graph: the condition %s becomes a computed the branch reads',
	async (condition) => {
		const result = await compile(condition);
		const site = result.semanticGraph.branchSites[0]!;
		expect(site.testSource).toBe(`${condition}, opened.length > 1`);
		expect(site.testComputedGraphNodeId).toBeDefined();
		expect(result.protocolView.branches[0]!.testReads.map((read) => read.graphNodeId)).toEqual([
			site.testComputedGraphNodeId,
		]);
	},
);

test('bound-symbol-resolver: the derive behind a branch condition reads the state its parent passes', async () => {
	const result = await compile('count > 0');
	const computed = result.protocolState.computed.find(
		(record) =>
			record.graphNodeId === result.semanticGraph.branchSites[0]!.testComputedGraphNodeId,
	)!;
	const row = result.boundSymbolResolver.rows.find(
		(candidate) => candidate.baseSymbolId === computed.deriveSymbolId,
	);
	expect(
		row?.captureSlots.map(({ route }) => [
			route.kind,
			'graphNodeId' in route && route.graphNodeId,
			'path' in route && route.path,
		]),
	).toEqual([
		['graph-reference', 'state:count', []],
		['graph-reference', 'state:opened', ['length']],
	]);
});
