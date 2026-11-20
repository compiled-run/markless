import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { linkedRenderDataBoundarySymbols } from '../src/passes/link/interface-link.ts';
import { UNLINKED_RENDER } from './support/unlinked-render.ts';

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

// Fail-closed: a candidate the page cannot re-render, because a component it
// renders has no interface in this compile, keeps its loud refusal.
test('a candidate the page cannot re-render still carries its loud refusal', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD + UNLINKED_RENDER);
	const diagnostic = compiled.symbolModules.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('keeps a `hits` of its own');
});

test('a candidate the page can re-render ships with no refusal', async () => {
	const compiled = await compilePage(OWN_STATE_CHILD);
	expect(
		compiled.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		),
	).toBeUndefined();
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

const IMPORTED_COUNTER = `
import { state } from '@markless/core';

export function Counter({ label }) @{
	let hits = state(0);
	<em class="counter" onClick={() => hits = hits + 1}>{label}{hits}</em>
}
`;

async function compileHost(props: string) {
	const child = await compileTsrxModule({
		filename: 'src/Counter.tsrx',
		source: IMPORTED_COUNTER,
		symbols: [],
	});
	return compileTsrxModule({
		filename: 'src/Host.tsrx',
		source: `
import { state } from '@markless/core';
import { Counter } from './Counter.tsrx';

export function App() @{
	let armed = state(false);
	let name = state('ready');

	<main>
		<button type="button" onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Counter ${props} /> }
	</main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './Counter.tsrx': child.moduleGraphInterface },
	});
}

// Given only constants, an imported child renders in the browser exactly as the server rendered it.
test('an imported child given only constants escalates and says it renders in the browser', async () => {
	const result = await compileHost('label="ready"');
	expect(result.symbolModules.armEscalationCandidates ?? []).toHaveLength(1);
	expect(
		result.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER',
		),
	).toMatchObject({
		severity: 'warning',
		message: expect.stringContaining('by running <Counter>'),
	});
});

test('an imported child given a value that changes escalates and says it renders in the browser', async () => {
	const result = await compileHost('label={name}');
	expect(result.symbolModules.armEscalationCandidates ?? []).toHaveLength(1);
	expect(
		result.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER',
		),
	).toMatchObject({
		severity: 'warning',
		message: expect.stringContaining('by running <Counter>'),
	});
	expect(
		result.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		),
	).toBeUndefined();
});

const PANEL_FAMILY = `
import { shared, state } from '@markless/core';

export const panelState = shared(() => {
	const panel = state({ open: false });
	return { ...panel };
}, { scope: 'subtree' });

export function PanelRoot({ children }) @{
	const panel = panelState();
	<div ui-open={panel.open}>{children}</div>
}

export function PanelToggle({ children }) @{
	const panel = panelState();
	<button aria-expanded={panel.open ? 'true' : 'false'} onClick={() => panel.open = !panel.open}>{children}</button>
}
`;

const FRAME = `
import { state } from '@markless/core';

export function Frame({ children }) @{
	let hits = state(0);
	<section onClick={() => hits = hits + 1}>{hits}{children}</section>
}
`;

// Projected children render with the page, so an imported child given them runs in the browser like one given constants.
for (const [shape, childSource, names, arm, runs, widget] of [
	['a family root holding its parts', PANEL_FAMILY, 'PanelRoot, PanelToggle', '<PanelRoot><PanelToggle>Open</PanelToggle></PanelRoot>', 'PanelRoot', true],
	['a stateful frame holding page markup', FRAME, 'Frame', '<Frame><p>{label}</p></Frame>', 'Frame', false],
] as const)
	test(`an imported child given children escalates: ${shape}`, async () => {
		const child = await compileTsrxModule({ filename: 'src/Parts.tsrx', source: childSource, symbols: [] });
		const compileWith = (unlinked: string) =>
			compileTsrxModule({
				filename: 'src/PartsHost.tsrx',
				source:
					`
import { state } from '@markless/core';
import { ${names} } from './Parts.tsrx';

export function App() @{
	let label = state('note');
	let visible = state(false);

	<main>
		@if (visible) { ${arm} }
		<button type="button" onClick={() => visible = !visible}>Show</button>
	</main>
}
` + unlinked,
				symbols: [],
				importedModuleInterfaces: { './Parts.tsrx': child.moduleGraphInterface },
			});
		const result = await compileWith('');
		expect(result.symbolModules.armEscalationCandidates ?? []).toHaveLength(1);
		// Only an arm that can root a widget files one, so a page without such an @if downloads nothing for it.
		const escalation = linkedRenderDataBoundarySymbols({
			...linkInput(result),
			link: { importedModuleInterfaces: { './Parts.tsrx': child.moduleGraphInterface } },
			branchExportName: (index: number) => `branchUpdate${String(index)}`,
		} as never).find((symbol) => symbol.manifest.kind === 'branch-update');
		expect(result.symbolModules.armEscalationCandidates?.[0]?.rootsWidgets === true).toBe(widget);
		expect(escalation?.module.source.includes('for (const definition of rendered.sharedDefinitions ?? [])')).toBe(widget);
		expect(
			result.symbolModules.diagnostics.map((candidate) => [candidate.code, candidate.severity, candidate.message]),
		).toEqual([
			[
				'MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER',
				'warning',
				`when visible changes, the browser renders this @if's content by running <${runs}>, instead of rebuilding it from compiled markup. Each time the content appears, <${runs}> starts fresh: anything it kept from the last time it was shown is gone.`,
			],
		]);
		const unlinked = await compileWith(UNLINKED_RENDER);
		expect(
			unlinked.symbolModules.diagnostics.find(
				(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
			)?.message,
		).toBe(`this @if (visible) cannot be rebuilt when visible changes because <${runs}> has to run to produce its content.`);
	});

const IMPORTED_SCENE = `
function describe(seed) {
	return 'scene-' + seed;
}

export function Scene({ seed }) @{
	<p title={seed}>{describe(seed)}</p>
}
`;

// No state and no handler: the child publishes markup, but what it shows moves with the caller's value.
test('an imported child showing a value derived from a changing prop escalates', async () => {
	const child = await compileTsrxModule({
		filename: 'src/Scene.tsrx',
		source: IMPORTED_SCENE,
		symbols: [],
	});
	const result = await compileTsrxModule({
		filename: 'src/SceneHost.tsrx',
		source: `
import { state } from '@markless/core';
import { Scene } from './Scene.tsrx';

export function App() @{
	let view = state('none');
	let seed = state(3);

	<main>
		<button type="button" onClick={() => view = 'scene'}>Show</button>
		<button type="button" onClick={() => seed = seed + 1}>Seed</button>
		@switch (view) {
			@case 'scene': { <Scene seed={seed} /> }
			@default: { <p>none</p> }
		}
	</main>
}
`,
		symbols: [],
		importedModuleInterfaces: { './Scene.tsrx': child.moduleGraphInterface },
	});
	expect(result.symbolModules.armEscalationCandidates ?? []).toHaveLength(1);
	expect(
		result.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER',
		),
	).toMatchObject({
		severity: 'warning',
		message: expect.stringContaining('by running <Scene>'),
	});
});

const ASYNC_LIST_IN_IF = `
import { computed, state } from '@markless/core';

async function find(term) {
	return [{ slug: term, title: term }];
}

export function Finder() @{
	let shown = state(false);
	let term = state('');
	const found = computed(async () => await find(term));

	<section>
		<button type="button" onClick={() => shown = !shown}>Find</button>
		@if (shown) {
			<ol>
				@try {
					@for (const hit of found; key hit.slug) {
						<li>{hit.title}</li>
					}
				} @pending {
					<li>Waiting</li>
				}
			</ol>
		}
	</section>
}
`;

test('an @if holding a @try block escalates and says the @try block renders in the browser', async () => {
	const compiled = await compilePage(ASYNC_LIST_IN_IF, 'src/Finder.tsrx');
	const candidates = compiled.symbolModules.armEscalationCandidates ?? [];
	expect(candidates).toHaveLength(1);
	const warning = compiled.symbolModules.diagnostics.find(
		(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER',
	);
	expect(warning).toMatchObject({ severity: 'warning' });
	expect(warning?.message).toBe(
		"when shown changes, the browser renders this @if's content by running the @try block it holds, instead of rebuilding it from compiled markup. Each time the content appears, the @try block it holds starts fresh: anything it kept from the last time it was shown is gone.",
	);
	expect(
		compiled.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		),
	).toBeUndefined();
	const unlinked = await compilePage(ASYNC_LIST_IN_IF + UNLINKED_RENDER, 'src/Finder.tsrx');
	expect(
		unlinked.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
		)?.message,
	).toBe('this @if (shown) cannot be rebuilt when shown changes because it holds a @try block.');
	const symbols = linkedRenderDataBoundarySymbols({
		...linkInput(compiled),
		branchExportName: (index: number) => `branchUpdate${String(index)}`,
	} as never);
	expect(
		symbols.find((symbol) => symbol.manifest.kind === 'branch-update')?.branchSiteId,
	).toBe(candidates[0]?.branchSiteId);
});

const CHECKED_ROWS_IN_IF = `
import { state } from '@markless/core';

const THEMES = [{ id: 'dusk', title: 'Dusk' }, { id: 'noon', title: 'Noon' }];

export function ThemeMenu() @{
	let open = state(true);
	let theme = state('noon');

	<nav>
		<button type="button" onClick={() => open = !open}>Themes</button>
		@if (open) {
			<menu>
				@for (const entry of THEMES; key entry.id) {
					<li aria-current={theme === entry.id ? 'true' : undefined} onClick={() => theme = entry.id}>{entry.title}</li>
				}
			</menu>
		}
	</nav>
}
`;

const NESTED_IF_IN_IF = `
import { computed, state } from '@markless/core';

export function Filters() @{
	let visible = state(true);
	let picks = state([]);
	const count = computed(() => picks.length);

	<aside>
		<button type="button" onClick={() => visible = !visible}>Filter</button>
		@if (visible) {
			<fieldset>
				<label onClick={() => picks = ['open']}>Open</label>
				@if (count > 0) {
					<button type="button" onClick={() => picks = []}>Reset</button>
				}
			</fieldset>
		}
	</aside>
}
`;

for (const [shape, source, filename, test_, runs, refusal] of [
	[
		'rows whose attribute reads state from outside the row',
		CHECKED_ROWS_IN_IF,
		'src/ThemeMenu.tsrx',
		'open',
		'the @for block it holds',
		'a repeated row inside it holds an attribute binding',
	],
	[
		'a nested @if',
		NESTED_IF_IN_IF,
		'src/Filters.tsrx',
		'visible',
		'the @if it holds',
		'it holds a branch binding',
	],
] as const)
	test(`an @if holding ${shape} escalates and names what the browser runs`, async () => {
		const compiled = await compilePage(source, filename);
		const candidates = compiled.symbolModules.armEscalationCandidates ?? [];
		expect(candidates).toHaveLength(1);
		const warning = compiled.symbolModules.diagnostics.find(
			(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_RENDERS_IN_BROWSER',
		);
		expect(warning).toMatchObject({ severity: 'warning' });
		expect(warning?.message).toBe(
			`when ${test_} changes, the browser renders this @if's content by running ${runs}, instead of rebuilding it from compiled markup. Each time the content appears, ${runs} starts fresh: anything it kept from the last time it was shown is gone.`,
		);
		expect(
			compiled.symbolModules.diagnostics.find(
				(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
			),
		).toBeUndefined();
		const unlinked = await compilePage(source + UNLINKED_RENDER, filename);
		expect(
			unlinked.symbolModules.diagnostics.find(
				(candidate) => candidate.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED',
			)?.message,
		).toBe(`this @if (${test_}) cannot be rebuilt when ${test_} changes because ${refusal}.`);
		const symbols = linkedRenderDataBoundarySymbols({
			...linkInput(compiled),
			branchExportName: (index: number) => `branchUpdate${String(index)}`,
		} as never);
		expect(
			symbols.find((symbol) => symbol.manifest.kind === 'branch-update')?.branchSiteId,
		).toBe(candidates[0]?.branchSiteId);
	});

const NESTED_ARM_DERIVE = `
import { computed, state } from '@markless/core';

async function load(id) {
	return { name: 'item-' + id };
}

function Form({ id }) @{
	const item = computed(async () => load(id));
	let busy = state(false);
	const locked = computed(() => false || busy);
	@try {
		<button disabled={locked} onClick={() => busy = !busy}>{item.name}</button>
	} @pending {
		<span>Loading</span>
	}
}

function Shell() @{
	let open = state(false);
	<section>
		<button onClick={() => open = !open}>Open</button>
		@if (open) { <Form id={1} /> }
	</section>
}

export default function Page() @{
	<main><h1>Items</h1><Shell /></main>
}
`;

// An arm rendered two components below the page names its values through every edge prefix on the way down.
test('a linked render loads a same-file symbol through nested component edge prefixes', async () => {
	const compiled = await compilePage(NESTED_ARM_DERIVE, 'src/NestedArm.tsrx');
	const symbols = linkedRenderDataBoundarySymbols({
		...linkInput(compiled),
		branchExportName: (index: number) => `branchUpdate${String(index)}`,
	} as never);
	const source = symbols.find((symbol) => symbol.manifest.kind === 'branch-update')?.module.source ?? '';
	const loader = /function marklessLoadLinkedSymbol\(symbolId\) \{[\s\S]*?\n\}/.exec(source)?.[0];
	expect(loader).toBeDefined();
	const prefixes = [...loader!.matchAll(/startsWith\("(c\d+:)"\)/g)].map((match) => match[1]!);
	expect(prefixes.length).toBeGreaterThan(1);
	const loaded: string[] = [];
	const load = new Function('marklessLoadLocalSymbol', `${loader}\nreturn marklessLoadLinkedSymbol;`)(
		(symbolId: string) => loaded.push(symbolId),
	) as (symbolId: string) => void;
	for (const outer of prefixes) for (const inner of prefixes) load(`${outer}${inner}symbol:7`);
	expect(new Set(loaded)).toEqual(new Set(['symbol:7']));
});
