import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { resolveBoundaryRunners } from '../src/passes/public-render/boundary-runner.ts';

async function compile(body: string, setup = '') {
	const result = await compileTsrxModule({
		filename: 'src/page.tsrx',
		symbols: [],
		source: `import { computed, state } from '@markless/core';
import { fetchList, fetchOne, keep } from './api.ts';

export default function Page() @{
	let round = state(0);
	const list = computed(async () => await fetchList(round));
	const one = computed(async () => await fetchOne(round));
${setup}
	<main>
		<button onClick={() => round++}>again</button>
		${body}
	</main>
}
`,
	});
	return {
		result,
		errors: [
			...result.semanticGraph.diagnostics,
			...result.publicRenderPlan.diagnostics,
			...result.publicRenderModule.diagnostics,
			...result.symbolModules.diagnostics,
		].filter((diagnostic) => diagnostic.severity === 'error'),
	};
}

test('several reads of one async value in a run of text update that run as one joined value', async () => {
	const { result, errors } = await compile(`@try {
			<section><p>Total: {one.total} over {one.days} days</p><button>Save</button></section>
		} @pending {
			<p>loading</p>
		}`);
	expect(errors).toEqual([]);
	const updates = result.protocolView.domUpdates.filter((update) => update.target.kind === 'text');
	expect(updates).toHaveLength(1);
	expect(updates[0]!.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(resolveBoundaryRunners(result.semanticGraph).get('boundary:0')?.runnerGraphNodeId).toBe(
		'computed:one',
	);
});

test('rows at the top of a fragment @try count the elements in front of the @try', async () => {
	const { result, errors } = await compile(`<aside>side</aside>
		@try {
			<>
				<h1>{one.title}</h1>
				@for (const entry of list; key entry.id) {
					<p>{entry.name}</p>
				}
			</>
		} @pending {
			<p>loading</p>
		}`);
	expect(errors).toEqual([]);
	// The button, the aside, then the heading inside the fragment.
	expect(result.renderData.repeats[0]!.rowStartOffset).toBe(3);
});

test("a row's @try reading a list-level async value beside the row item settles on that value", async () => {
	for (const read of ['{one.find((each) => each.id === entry.id)?.count}', '{keep(one, entry.id)}']) {
		const { result, errors } = await compile(`@try {
			<ul>
				@for (const entry of list; key entry.id) {
					<li>
						@try {
							<b>{entry.name}: ${read}</b>
						} @pending {
							<i>…</i>
						}
					</li>
				}
			</ul>
		} @pending {
			<p>loading</p>
		}`);
		expect(errors).toEqual([]);
		expect(resolveBoundaryRunners(result.semanticGraph).get('boundary:1')?.runnerGraphNodeId).toBe(
			'computed:one',
		);
	}
});

test('handlers named by a body arrow or function read graph values through the graph', async () => {
	const { result, errors } = await compile(
		`@try {
			<>
				<button onClick={share}>Share</button>
				<button onClick={tally}>Tally</button>
			</>
		} @pending {
			<p>loading</p>
		}`,
		`	const share = () => {
		const shown = one;
		keep(shown.days, round);
	};
	function tally() {
		keep(one.total);
	}`,
	);
	expect(errors).toEqual([]);
	const handlers = result.symbolResolver.symbols.filter((symbol) => symbol.kind === 'event-handler');
	const readNodes = (index: number) =>
		(handlers[index] as { readonly reads: ReadonlyArray<{ readonly graphNodeId: string }> }).reads.map(
			(read) => read.graphNodeId,
		);
	expect(readNodes(1)).toEqual(['computed:one', 'state:round']);
	expect(readNodes(2)).toEqual(['computed:one']);
});
