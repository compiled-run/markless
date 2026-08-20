import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	compileTsrxModule,
	createRenderData,
	lowerStateAccess,
} from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { createProtocolViewPayload } from '../src/passes/protocol-view.ts';
import { planPublicRender } from '../src/passes/public-render/plan.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

// D1 tier 3 inside arms (T104): an @if inside an async boundary arm gets real
// flip machinery — a branch record nested under the boundary's armRecords in
// the arm's own anchor space, plus a flip module that rebuilds only the
// branch range (static parts + graph-read slots + repeat rows, no component
// execution). When the @if content needs component execution, the compiler
// escalates to the boundary's arm re-render AND says so in author words (D2/D4).

const menuShapedSource = `
import { computed, state } from '@markless/core';

export function App() @{
	let drawerOpen = state(false);
	const roster = computed(async ({ signal }) => {
		const response = await fetch('/api/roster', { signal });
		return await response.json();
	});

	<main>
		@try {
			<div class="toolbar">
				<button type="button" data-drawer-toggle onClick={() => drawerOpen = !drawerOpen}>Crews</button>
				@if (drawerOpen) {
					<div class="drawer" data-drawer>
						@for (const crew of roster.crews; key crew.callsign) {
							<button class="drawer-item">{crew.callsign}</button>
						}
					</div>
				}
			</div>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
`;

async function planFixture(filename: string, source: string) {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena, stateLowering });
	const plan = planPublicRender({
		source: { filename, source },
		semanticGraph,
		payloadArena,
		symbolResolver,
	});
	return {
		semanticGraph,
		payloadArena,
		symbolResolver,
		renderData: createRenderData({ semanticGraph, symbolResolver }),
		plan,
	};
}

test('protocol view nests the arm-scoped flip record under the boundary in an arm-local anchor space', async () => {
	const { payloadArena, symbolResolver, renderData, plan } = await planFixture(
		'src/DrawerMenu.tsrx',
		menuShapedSource,
	);
	const view = createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		renderData,
		publicRenderPlan: plan,
	});

	// Page-level: no branch records, no extra anchor pairs (census unchanged).
	expect(view.branches ?? []).toEqual([]);
	const boundary = view.asyncBoundaries[0];
	expect(boundary?.startAnchor.index).toBe(0);
	expect(boundary?.endAnchor.index).toBe(1);

	const tryArm = boundary?.armRecords?.[0];
	expect(tryArm?.branches).toEqual([
		expect.objectContaining({
			id: 'branch-site:0',
			symbolId: expect.stringMatching(/^symbol:\d+$/),
			testReads: [expect.objectContaining({ graphNodeId: 'state:drawerOpen', path: [] })],
			declaredEmptyArms: [1],
			startAnchor: { strategy: 'arm-branch-comment', index: 0 },
			endAnchor: { strategy: 'arm-branch-comment', index: 1 },
		}),
	]);
	// Hosts inside the flip range are branch-owned: they leave the boundary's
	// planned locator/event sets (the branch record re-registers them per flip).
	const drawerHostIds = tryArm?.locators.map((locator) => locator.tagName) ?? [];
	expect(drawerHostIds).toEqual(['div', 'button']);
});

test('the arm-scoped flip module rebuilds the range from parts + repeat rows, no component execution', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DrawerMenu.tsrx',
		source: menuShapedSource,
		symbols: [],
	});
	const boundary = result.protocolView.asyncBoundaries[0];
	const record = boundary?.armRecords?.[0]?.branches?.[0];
	expect(record?.symbolId).toBeDefined();

	const module = result.symbolModules.modules.find(
		(candidate) => candidate.symbolId === record?.symbolId,
	);
	expect(module?.kind).toBe('branch-update');
	// Rows rebuild from a live graph read of the collection; the module never
	// imports or executes a component.
	expect(module?.source).toContain('marklessBranchRows');
	expect(module?.source).not.toContain('import ');

	// Production SSR carries the nested branch as a renderData slot. The
	// renderer owns its anchors directly; emitted code contains no HTML census.
	expect(result.publicRenderModule.renderDataModuleSource).toContain(
		'"kind":"branch","branchSiteId":"branch-site:0"',
	);
	expect(result.publicRenderModule.ssrModuleSource).not.toContain('marklessSsrHostLocators');
});

test('an @if containing a component escalates to the whole @try re-render AND diagnoses in author words', async () => {
	const childSource = `export function Panel({ label }) @{ <em class="panel">{label}</em> }`;
	const child = await compileTsrxModule({
		filename: 'src/Panel.tsrx',
		source: childSource,
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/EscalatedDetails.tsrx',
		source: `
import { computed, state } from '@markless/core';
import { Panel } from './Panel.tsrx';

export function App() @{
	let detailsOpen = state(false);
	const report = computed(async ({ signal }) => {
		const response = await fetch('/api/report', { signal });
		return await response.json();
	});

	<main>
		@try {
			<div class="stack">
				<button type="button" data-details-toggle onClick={() => detailsOpen = !detailsOpen}>Details</button>
				@if (detailsOpen) {
					<Panel label={report.title} />
				}
			</div>
		} @pending {
			<p class="pending">Loading</p>
		} @catch {
			<p class="broken">Broken</p>
		}
	</main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './Panel.tsrx': child.moduleGraphInterface },
	});

	// D2: escalation is never silent — and D4: the message speaks the author's
	// words, never arm/tier/anchor/boundary vocabulary.
	const diagnostic = result.publicRenderPlan.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_TRY_BLOCK_TOGGLE_RERENDER',
	);
	expect(diagnostic).toBeDefined();
	expect(diagnostic?.severity).toBe('warning');
	expect(diagnostic?.message).toBe(
		'this @if contains <Panel>, so toggling it re-renders the whole @try block — move the component outside the @if to keep the toggle cheap.',
	);
	for (const banned of ['arm', 'tier', 'anchor', 'boundary']) {
		expect(diagnostic?.message.toLowerCase()).not.toContain(banned);
		expect(diagnostic?.suggestions[0]?.message.toLowerCase() ?? '').not.toContain(banned);
	}

	// The toggle still WORKS: the boundary's own update module re-renders the
	// arm, so the record ships test reads that route through that path.
	const record = result.protocolView.asyncBoundaries[0]?.armRecords?.[0]?.branches?.[0];
	expect(record).toEqual(
		expect.objectContaining({
			id: 'branch-site:0',
			testReads: [expect.objectContaining({ graphNodeId: 'state:detailsOpen' })],
		}),
	);
	expect(record?.symbolId).toBeUndefined();
	expect(record?.startAnchor).toBeUndefined();
	expect(result.protocolView.asyncBoundaries[0]?.updateSymbolId).toBeDefined();
});

// U-K: at page level there is no @try to escalate to, so a component inside an
// @if either rebuilds from compiled markup or the build refuses. What it must
// never do is ship a record naming a flip module the build never wrote.
const pageLevelComponentSource = `
import { state } from '@markless/core';

function Badge() @{
	<em class="badge">Armed</em>
}

export function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Badge /> }
	</main>
}
`;

test('a page-level @if that shows a markup-only component rebuilds it without running it', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PageBadge.tsrx',
		source: pageLevelComponentSource,
		symbols: [],
	});
	const record = result.protocolView.branches?.[0];
	expect(record?.symbolId).toBeDefined();

	const module = result.symbolModules.modules.find(
		(candidate) => candidate.symbolId === record?.symbolId,
	);
	expect(module?.kind).toBe('branch-update');
	expect(module?.source).toContain('badge');
	expect(module?.source).toContain('Armed</em>');
	expect(module?.source).not.toContain('import ');
	expect(result.symbolModules.diagnostics).toEqual([]);
});

test('a page-level @if whose component has to run refuses at build time, in author words', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PagePanel.tsrx',
		source: `
import { state } from '@markless/core';

function Panel({ label }) @{
	<em class="panel">{label}</em>
}

export function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Panel label="ready" /> }
	</main>
}
`,
		symbols: [],
	});
	const record = result.protocolView.branches?.[0];
	const diagnostic = result.symbolModules.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toBe(
		'this @if (armed) cannot be rebuilt when armed changes because <Panel> has to run to produce its content.',
	);
	expect(diagnostic?.symbolId).toBe(record?.symbolId);
	// D4: the message names the author's @if, test, and component — never a
	// compiler word ("armed" below is the author's own state name).
	for (const banned of ['tier', 'anchor', 'boundary', 'symbol'])
		expect(diagnostic?.message.toLowerCase()).not.toContain(banned);

	// The build refuses; it does not ship a record pointing at a module nobody wrote.
	expect(
		result.symbolModules.modules.some((candidate) => candidate.symbolId === record?.symbolId),
	).toBe(false);
});

test('a prop-decided @if with the same content warns instead of blocking the build', async () => {
	const result = await compileTsrxModule({
		filename: 'src/PropPanel.tsrx',
		source: `
function Panel({ label }) @{
	<em class="panel">{label}</em>
}

export function Frame({ info }) @{
	<div>
		@if (info) { <Panel label={info.label} /> } @else { <em class="none">none</em> }
	</div>
}
`,
		symbols: [],
	});
	const diagnostic = result.symbolModules.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	// The caller decides whether `info` ever changes, so a caller that passes a
	// fixed value ships correctly; blocking every such file would be a false red.
	expect(diagnostic?.severity).toBe('warning');
});

