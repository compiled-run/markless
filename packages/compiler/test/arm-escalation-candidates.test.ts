import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { linkedRenderDataBoundarySymbols } from '../src/passes/link/interface-link.ts';

const OWN_STATE_CHILD = `
import { state } from '@markless/core';

function Panel({ label }) @{
	let hits = state(0);
	<em class="panel" onClick={() => hits = hits + 1}>{label}{hits}</em>
}

export function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Panel label="ready" /> }
	</main>
}
`;

async function compilePage(source: string, filename = 'src/PagePanel.tsrx') {
	return compileTsrxModule({ filename, source, symbols: [] });
}

function linkInput(compiled: Awaited<ReturnType<typeof compilePage>>) {
	return {
		compiled,
		link: {},
		clientLink: true,
		renderDataId: 'virtual:render-data',
		resolverId: 'virtual:resolver',
		symbolModuleId: (symbolId: string) => `virtual:symbol:${symbolId}`,
		boundaryExportName: (index: number) => `boundaryUpdate${String(index)}`,
	} as const;
}

test('an arm holding a component that keeps its own value is recorded as an escalation candidate', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD);
	const candidates = compiled.symbolModules.armEscalationCandidates ?? [];
	expect(candidates).toHaveLength(1);
	expect(candidates[0]?.branchSiteId).toBeTruthy();
	expect(candidates[0]?.symbolId).toBeTruthy();
});

// Fail-closed: recording a candidate never clears the refusal on its own. Only
// a linker that actually emits the escalation symbol may retire it.
test('an unfulfilled candidate still carries its loud refusal', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD);
	const diagnostic = compiled.symbolModules.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('keeps a `hits` of its own');
});

// A linker that names no branch export fulfills nothing: the capability stays
// off and the build keeps refusing the shape.
test('no branch escalation symbol is emitted unless the linker names branch exports', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD);
	const symbols = linkedRenderDataBoundarySymbols(linkInput(compiled) as never);
	expect(symbols.filter((symbol) => symbol.manifest.kind === 'branch-update')).toHaveLength(0);
});

test('a linker that names branch exports fulfills the candidate with a prerender re-render', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD);
	const candidate = (compiled.symbolModules.armEscalationCandidates ?? [])[0]!;
	const symbols = linkedRenderDataBoundarySymbols({
		...linkInput(compiled),
		branchExportName: (index: number) => `branchUpdate${String(index)}`,
	} as never);
	const escalation = symbols.find((symbol) => symbol.manifest.kind === 'branch-update');
	expect(escalation?.branchSiteId).toBe(candidate.branchSiteId);
	expect(escalation?.row.id).toBe(candidate.symbolId);
	expect(escalation?.module.source).toContain('renderPrerenderBranch');
	expect(escalation?.module.source).toContain(JSON.stringify(candidate.branchSiteId));
	// The arm the flip asked for decides the render; the module never re-derives it.
	expect(escalation?.module.source).toContain('arm: context.arm');
});

// The flip replaces the whole range from a fresh render, so the compiler's
// per-arm plan must not also register: the served arm already carries it.
test('an escalating branch is marked in the view and carries no per-arm plan', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD);
	const candidate = (compiled.symbolModules.armEscalationCandidates ?? [])[0]!;
	const branch = (compiled.protocolView.branches ?? []).find(
		(record) => record.id === candidate.branchSiteId,
	);
	expect(branch?.escalates).toBe(true);
	expect(branch?.armRecords).toBeUndefined();
	expect(branch?.symbolId).toBe(candidate.symbolId);
});

test('a branch the compiler can rebuild keeps its per-arm plan and no escalation mark', async () => {
	const compiled = await compilePage(`
import { state } from '@markless/core';

export function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <em class="plain">ready</em> }
	</main>
}
`);
	expect(compiled.symbolModules.armEscalationCandidates ?? []).toHaveLength(0);
	const branch = (compiled.protocolView.branches ?? [])[0];
	expect(branch?.escalates).toBeUndefined();
	expect(branch?.armRecords).toBeDefined();
});

// The narrowed set: an imported child brings markup and records this module
// cannot address, so it stays plainly refused rather than becoming a candidate.
test('an imported child that has to run is refused, not escalated', async () => {
	const child = await compileTsrxModule({
		filename: 'src/Counter.tsrx',
		source: `
import { state } from '@markless/core';

export function Counter({ label }) @{
	let hits = state(0);
	<em class="counter" onClick={() => hits = hits + 1}>{label}{hits}</em>
}
`,
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/Host.tsrx',
		source: `
import { state } from '@markless/core';
import { Counter } from './Counter.tsrx';

export function App() @{
	let armed = state(false);

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Counter label="ready" /> }
	</main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './Counter.tsrx': child.moduleGraphInterface },
	});
	expect(result.symbolModules.armEscalationCandidates ?? []).toHaveLength(0);
	expect(
		result.symbolModules.diagnostics.some(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		),
	).toBe(true);
});
