import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { resolveBoundaryRunners } from '../src/passes/public-render/boundary-runner.ts';

// An @if test that compares an async value is derived once the @try's async inputs settle, so the server picks its arm from their values.
const pane = (test: string, arm: string) => `import { computed } from '@markless/core';

export default function Pane() @{
	const order = computed(async () => (await fetch('/api/order')).json() as Promise<{ code: string } | null>);

	@try {
		<section>
			@if (${test}) {
				${arm}
			}
		</section>
	} @pending { <p>Loading</p> }
}
`;

async function runner(source: string) {
	const { semanticGraph } = await compileTsrxModule({
		filename: '/src/pane.tsrx',
		buildId: 'branch-test',
		resolverId: 'branch-test',
		symbols: [],
		source,
	});
	const [site] = semanticGraph.branchSites;
	return { site, resolution: resolveBoundaryRunners(semanticGraph).get(site!.asyncBoundaryId!)! };
}

test.each(['order !== null', 'order != null', 'order?.code !== undefined'])(
	'@if (%s) is derived after the gate, which waits on the async value',
	async (condition) => {
		const { site, resolution } = await runner(pane(condition, '<p>{order?.code}</p>'));
		expect(site!.testComputedGraphNodeId).toBeDefined();
		expect(resolution.derivedGraphNodeIds).toEqual([site!.testComputedGraphNodeId]);
		expect(resolution.reads.map((read) => read.graphNodeId)).toEqual(['computed:order']);
	},
);

test('the gate waits on the async value a test compares even when the arm shows none of it', async () => {
	const { resolution } = await runner(pane('order === null', '<p>No order</p>'));
	expect(resolution.reads.map((read) => read.graphNodeId)).toEqual(['computed:order']);
	expect(resolution.unresolvedSources).toEqual([]);
});
