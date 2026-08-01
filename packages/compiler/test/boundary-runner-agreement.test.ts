import { expect, test } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { collectSsrAsyncRunners } from '../src/passes/public-render/html.ts';

const boundarySource = `
import { computed, state } from '@markless/core';

export function ReleaseFeed() @{
	let density = state('comfortable');
	const feed = computed(async () => ({
		releases: [{ id: 'r1', title: 'First' }],
	}));

	<main>
		@try {
			<section data-density={density}>
				<ul>@for (const release of feed.releases; key release.id) {
					<li>{release.title}</li>
				}</ul>
			</section>
		} @pending { <p>Loading</p> } @catch { <p>Failed</p> }
	</main>
}
`;

test('browser arm render, SSR runner, and settle symbol agree on one boundary graph node', async () => {
	const filename = 'src/ReleaseFeed.tsrx';
	const result = await compileTsrxModule({ filename, source: boundarySource, symbols: [] });
	const boundaryId = result.semanticGraph.asyncBoundaries[0]?.id;
	const armRender = result.publicRenderPlan.asyncBoundaryArmRenders.find(
		(entry) => entry.boundaryId === boundaryId,
	);
	const browserGraphNodeId = armRender?.bodyLines
		.join('\n')
		.match(/context\.graph\.read\("([^"]+)"/)?.[1];
	const ssrGraphNodeId = collectSsrAsyncRunners({
		source: { filename, source: boundarySource },
		semanticGraph: result.semanticGraph,
		publicRenderPlan: result.publicRenderPlan,
		symbolResolver: result.symbolResolver,
		captureAnalysis: result.captureAnalysis,
		protocolState: result.protocolState,
		protocolView: result.protocolView,
	}).get(boundaryId!)?.graphNodeId;
	const settleGraphNodeId = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'async-boundary-update' && symbol.boundaryId === boundaryId,
	)?.graphNodeId;
	const emittedBoundary = result.protocolView.asyncBoundaries.find(
		(boundary) => boundary.id === boundaryId,
	);

	// Re-deriving SSR from the first template read would select this plain state
	// read and drop the runner. Keeping the trap explicit makes the agreement
	// assertion fail if that old direction returns.
	expect(
		result.semanticGraph.templateReads.find((read) => read.asyncBoundaryId === boundaryId)
			?.source,
	).toBe('density');
	expect({
		browserGraphNodeId,
		ssrGraphNodeId,
		settleGraphNodeId,
		protocolGraphNodeId: emittedBoundary?.runnerGraphNodeId,
		initiallyServedArm: emittedBoundary?.initiallyServedArm,
	}).toEqual({
		browserGraphNodeId: 'computed:feed',
		ssrGraphNodeId: 'computed:feed',
		settleGraphNodeId: 'computed:feed',
		protocolGraphNodeId: 'computed:feed',
		initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
	});
});

test('boundary runner agreement is structural across alternate names and markup', async () => {
	const filename = 'src/KilnRoster.tsrx';
	const source = `
import { computed, state } from '@markless/core';
export function KilnRoster() @{
	let finish = state('matte');
	const roster = computed(async () => ({ members: [{ key: 'm1', name: 'Ada' }] }));
	<article>@try {
		<div><h1 data-finish={finish}>Kiln roster</h1><ol>@for (const member of roster.members; key member.key) {<li class="maker">{member.name}</li>}</ol></div>
	} @pending { <i>Heating</i> } @catch { <b>Cold</b> }</article>
}
`;
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	const boundaryId = result.semanticGraph.asyncBoundaries[0]?.id;
	const browserGraphNodeId = result.publicRenderPlan.asyncBoundaryArmRenders
		.find((entry) => entry.boundaryId === boundaryId)
		?.bodyLines.join('\n')
		.match(/context\.graph\.read\("([^"]+)"/)?.[1];
	const ssrGraphNodeId = collectSsrAsyncRunners({
		source: { filename, source },
		semanticGraph: result.semanticGraph,
		publicRenderPlan: result.publicRenderPlan,
		symbolResolver: result.symbolResolver,
		captureAnalysis: result.captureAnalysis,
		protocolState: result.protocolState,
		protocolView: result.protocolView,
	}).get(boundaryId!)?.graphNodeId;
	const settleGraphNodeId = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'async-boundary-update' && symbol.boundaryId === boundaryId,
	)?.graphNodeId;

	expect({ browserGraphNodeId, ssrGraphNodeId, settleGraphNodeId }).toEqual({
		browserGraphNodeId: 'computed:roster',
		ssrGraphNodeId: 'computed:roster',
		settleGraphNodeId: 'computed:roster',
	});
});

test('a parts-covered boundary with no authored sync gate and two async reads fails loudly', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CompassCard.tsrx',
		source: `
import { computed } from '@markless/core';
export function CompassCard() @{
	const east = computed(async () => ({ label: 'east' }));
	const west = computed(async () => ({ label: 'west' }));
	<main>@try { <p>{east.label}-{west.label}</p> } @pending { <p>Loading</p> } @catch { <p>Failed</p> }</main>
}
`,
		symbols: [],
	});

	const boundaryId = result.semanticGraph.asyncBoundaries[0]?.id;
	expect(result.publicRenderPlan.asyncBoundaryGates).toContainEqual({
		boundaryId,
		supported: true,
	});
	expect(result.publicRenderPlan.asyncBoundaryArms).toContainEqual(
		expect.objectContaining({ boundaryId }),
	);
	expect(result.publicRenderPlan.asyncBoundaryArmRenders).toEqual([]);
	expect(
		result.symbolResolver.symbols.find(
			(symbol) => symbol.kind === 'async-boundary-update' && symbol.boundaryId === boundaryId,
		)?.graphNodeId,
	).toBeUndefined();
	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
				severity: 'error',
			}),
		]),
	);
});

test('a supported boundary with no resolvable async runner fails loudly', async () => {
	const result = await compileTsrxModule({
		filename: 'src/CalledCollection.tsrx',
		source: `
import { computed } from '@markless/core';
export function CalledCollection() @{
	const rows = computed(async () => [{ id: 'r1', title: 'First' }]);
	const selectRows = () => rows;
	<main>@try { <ul>@for (const row of selectRows(); key row.id) {<li>{row.title}</li>}</ul> } @pending { <p>Loading</p> } @catch { <p>Failed</p> }</main>
}
`,
		symbols: [],
	});

	const boundaryId = result.semanticGraph.asyncBoundaries[0]?.id;
	expect(result.publicRenderPlan.asyncBoundaryGates).toContainEqual({
		boundaryId,
		supported: true,
	});
	expect(
		result.symbolResolver.symbols.some(
			(symbol) => symbol.kind === 'async-boundary-update' && symbol.boundaryId === boundaryId,
		),
	).toBe(false);
	expect(result.publicRenderPlan.asyncBoundaryArmRenders).toEqual([]);
	expect(collectTsrxModuleDiagnostics(result)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_GATE_PLAN_DISAGREEMENT',
				severity: 'error',
			}),
		]),
	);
});
