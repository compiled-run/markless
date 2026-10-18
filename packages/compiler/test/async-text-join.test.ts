import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';
import { resolveBoundaryRunners } from '../src/passes/public-render/boundary-runner.ts';

const pageSource = (markup: string) => `import { computed, state } from '@markless/core';
export default function Page() @{
	const data = computed(async () => ({ title: 'Inbox', sub: 'all' }));
	const folder = computed(async () => 'mail');
	let count = state(0);
	<section>
		@try {
			${markup};
		} @pending {
			<p>loading</p>;
		}
	</section>
}
`;

async function compile(markup: string) {
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		source: pageSource(markup),
		symbols: [],
	});
	return {
		codes: [...result.semanticGraph.diagnostics, ...result.publicRenderPlan.diagnostics].map(
			(diagnostic) => diagnostic.code,
		),
		runner: resolveBoundaryRunners(result.semanticGraph).get('boundary:0'),
	};
}

// The joined value is not the block's gate: a gate that read `count` would settle the
// block again on every write and rebuild its elements.
test('an async value joined with state in one run of text gates its @try on the async value', async () => {
	const { codes, runner } = await compile(`<p>{data.title} {count}</p>`);
	expect(codes).toEqual([]);
	expect(runner?.runnerGraphNodeId).toBe('computed:data');
	expect(runner?.derivedGraphNodeIds).toEqual(['computed:templateExpression:0']);
});

test('state before the async value, and an attribute template, gate the same way', async () => {
	for (const markup of [
		`<p>{count} in {data.title}</p>`,
		'<p title={`${data.title} ${count}`}>x</p>',
	]) {
		const { codes, runner } = await compile(markup);
		expect(codes).toEqual([]);
		expect(runner?.runnerGraphNodeId).toBe('computed:data');
	}
});

test('two async values joined with state in one @try are refused like two direct reads', async () => {
	expect((await compile(`<p>{folder}/{data.title}: {count}</p>`)).codes).toEqual([
		'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
	]);
	expect((await compile(`<p>{folder}</p>; <p>{data.title}</p>`)).codes).toEqual([
		'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
	]);
});

test('two reads of the same async value in one run of text stay a direct read', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/page.tsrx',
		source: pageSource(`<p>{data.title} / {data.sub}</p>`),
	});
	expect(graph.diagnostics).toEqual([]);
});
