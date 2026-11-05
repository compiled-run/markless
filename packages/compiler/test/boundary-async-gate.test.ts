import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { collectSsrAsyncRunners } from '../src/passes/public-render/html.ts';
import {
	ASYNC_GATE_GRAPH_NODE_PREFIX,
	resolveBoundaryRunners,
} from '../src/passes/public-render/boundary-runner.ts';

async function boundaryGate(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	const boundaryId = result.semanticGraph.asyncBoundaries[0]!.id;
	const runner = resolveBoundaryRunners(result.semanticGraph).get(boundaryId)!.runnerGraphNodeId;
	const gate = result.semanticGraph.graphBindings.find((binding) => binding.id === runner);
	const ssrRunner = collectSsrAsyncRunners({
		source: { filename, source },
		semanticGraph: result.semanticGraph,
		publicRenderPlan: result.publicRenderPlan,
		symbolResolver: result.symbolResolver,
		captureAnalysis: result.captureAnalysis,
		protocolState: result.protocolState,
		protocolView: result.protocolView,
	}).get(boundaryId)?.graphNodeId;
	const settleRunner = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'async-boundary-update' && symbol.boundaryId === boundaryId,
	)?.graphNodeId;
	const served = result.protocolView.asyncBoundaries.find(
		(boundary) => boundary.id === boundaryId,
	);
	return {
		codes: collectTsrxModuleDiagnostics(result)
			.filter((diagnostic) => diagnostic.severity === 'error')
			.map((diagnostic) => diagnostic.code),
		runner,
		gate,
		agreed: [ssrRunner, settleRunner, served?.runnerGraphNodeId].every(
			(candidate) => candidate === runner,
		),
		gatedAsync: [
			...new Set(
				(served?.asyncReads ?? [])
					.filter((read) => read.runnerSymbolId)
					.map((read) => read.graphNodeId),
			),
		].sort(),
	};
}

test('a @try reading two async values directly settles on one gate over both', async () => {
	const { codes, runner, gate, agreed, gatedAsync } = await boundaryGate(
		'src/Profile.tsrx',
		`
import { computed } from '@markless/core';
export function Profile() @{
	const user = computed(async () => ({ name: 'Ada' }));
	const posts = computed(async () => [{ id: 'p1' }]);
	<main>@try {
		<>
			<h1>{user.name}</h1>
			<p>{posts.length} posts</p>
		</>
	} @pending { <p>Loading</p> } @catch (error) { <p>{error.message}</p> }</main>
}
`,
	);
	expect(codes).toEqual([]);
	expect(runner?.startsWith(ASYNC_GATE_GRAPH_NODE_PREFIX)).toBe(true);
	expect(gate).toMatchObject({ kind: 'computed', async: false, asyncCapable: true });
	expect(gate?.dependencies?.map((dependency) => dependency.graphNodeId).sort()).toEqual([
		'computed:posts',
		'computed:user',
	]);
	expect(agreed).toBe(true);
	expect(gatedAsync).toEqual(['computed:posts', 'computed:user']);
});

test('the gate is structural across three values, one behind a sync computed, in another order', async () => {
	const { codes, runner, gate, agreed, gatedAsync } = await boundaryGate(
		'src/Harbor.tsrx',
		`
import { computed } from '@markless/core';
export function Harbor() @{
	const tide = computed(async () => ({ height: 3 }));
	const weather = computed(async () => ({ sky: 'clear' }));
	const berths = computed(async () => ['north', 'south']);
	const shout = computed(() => weather.sky.toUpperCase());
	<section>@try {
		<div>
			<b>{shout}</b>
			<ul>@for (const berth of berths; key berth) {<li>{berth}</li>}</ul>
			<span>{tide.height} m</span>
		</div>
	} @pending { <i>Waiting</i> } @catch { <i>Failed</i> }</section>
}
`,
	);
	expect(codes).toEqual([]);
	expect(runner?.startsWith(ASYNC_GATE_GRAPH_NODE_PREFIX)).toBe(true);
	expect(gate?.dependencies?.map((dependency) => dependency.graphNodeId).sort()).toEqual([
		'computed:berths',
		'computed:shout',
		'computed:tide',
	]);
	expect(agreed).toBe(true);
	expect(gatedAsync).toEqual(['computed:berths', 'computed:tide', 'computed:weather']);
});

test('a sync computed whose closure covers every other read stays the gate', async () => {
	const { codes, runner } = await boundaryGate(
		'src/Kiln.tsrx',
		`
import { computed } from '@markless/core';
export function Kiln() @{
	const glaze = computed(async () => ({ tone: 'cobalt' }));
	const label = computed(() => glaze.tone.toUpperCase());
	<article>@try { <><p>{label}</p><b>{glaze.tone}</b></> } @pending { <p>Firing</p> } @catch { <p>Cracked</p> }</article>
}
`,
	);
	expect(codes).toEqual([]);
	expect(runner).toBe('computed:label');
});

test('one async value read twice mints no gate', async () => {
	const { codes, runner } = await boundaryGate(
		'src/Orchard.tsrx',
		`
import { computed } from '@markless/core';
export function Orchard() @{
	const grove = computed(async () => ({ trees: 4, rows: 2 }));
	<div>@try { <span>{grove.trees} in {grove.rows}</span> } @pending { <span>Planting</span> } @catch { <span>Blighted</span> }</div>
}
`,
	);
	expect(codes).toEqual([]);
	expect(runner).toBe('computed:grove');
});
