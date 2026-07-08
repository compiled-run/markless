import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { planPublicRender } from '../src/passes/public-render/plan.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const appSource = (body: string, extra = '') =>
	`import { state } from '@markless/core';\n${extra}\nexport function App() @{\n${body}\n}\n`;
const stateAndComputedSource = (body: string) =>
	`import { state, computed } from '@markless/core';\nexport function App() @{\n${body}\n}\n`;
const supportedSource = appSource(
	`let entries = state([]); let chosen = state(null);
<main><section>@for (const entry of entries; key entry.code) {<article class={chosen === entry.code ? 'picked' : 'plain'}><h2>{entry.title}</h2><button onClick={() => chosen = entry.code}>Choose</button></article>}</section></main>`,
);

test('planPublicRender emits compiler-proven direct DOM artifacts for a simple keyed repeat', async () => {
	const { plan } = await createRenderPlan('src/EntryList.tsrx', supportedSource);
	const repeat = plan.keyedRepeats[0];

	expect(plan.passId).toBe('public-render-plan');
	expect(plan.rootTemplateHtml).toBe('<main><section></section></main>');
	expect(plan.staticHostNodeIds).toEqual([expect.any(String), repeat?.parentHostNodeId]);
	expect(plan.staticHostNodeIds).not.toContain(repeat?.rowHostNodeId);
	expect(plan.staticEventControls).toEqual([]);
	expect(plan.repeatGates).toEqual([
		{
			repeatId: 'repeat:0',
			supported: true,
		},
	]);
	expect(repeat).toEqual(
		expect.objectContaining({
			repeatId: 'repeat:0',
			parentHostNodeId: expect.any(String),
			rowHostNodeId: expect.any(String),
			itemName: 'entry',
			collectionGraphNodeId: 'state:entries',
			collectionPath: [],
			keyPath: ['code'],
			rowTemplateHtml: '<article class=""><h2> </h2><button>Choose</button></article>',
			parentLocator: expect.objectContaining({
				hostNodeId: expect.any(String),
				strategy: 'dom-order',
				tagName: 'section',
			}),
		}),
	);
	expect(repeat?.parentLocator.hostNodeId).toBe(repeat?.parentHostNodeId);
	expect(repeat?.textWrites).toEqual([
		{ source: 'entry.title', itemPath: ['title'], nodePath: [0, 0] },
	]);
	expect(repeat?.classWrites).toEqual([
		{
			source: "chosen === entry.code ? 'picked' : 'plain'",
			hostPath: [],
			stateGraphNodeId: 'state:chosen',
			statePath: [],
			itemPath: ['code'],
			trueClass: 'picked',
			falseClass: 'plain',
		},
	]);
	expect(repeat?.eventControls).toEqual([
		{
			eventName: 'click',
			hostPath: [1],
			handlerSource: '() => chosen = entry.code',
			symbolId: 'symbol:0',
			itemContext: {
				kind: 'keyed-repeat-item',
				repeatId: 'repeat:0',
				itemName: 'entry',
				keyPath: ['code'],
			},
		},
	]);
	expect(plan.diagnostics).toEqual([]);
});

test('planPublicRender records static event host paths for direct public emit', async () => {
	const { plan, symbolResolver } = await createRenderPlan(
		'src/Toolbar.tsrx',
		appSource(`
let actions = state({ runs: 0, clears: 0 });
<nav>
	<button onClick={() => actions.runs++}>Run</button>
	<span><button onClick={() => actions.clears++}>Clear</button></span>
</nav>`),
	);
	const runSymbol = symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('actions.runs++'),
	);
	const clearSymbol = symbolResolver.symbols.find((symbol) =>
		symbol.source.includes('actions.clears++'),
	);

	expect(runSymbol).toBeDefined();
	expect(clearSymbol).toBeDefined();
	expect(plan.rootTemplateHtml).toBe(
		'<nav><button>Run</button><span><button>Clear</button></span></nav>',
	);
	expect(plan.staticEventControls).toEqual([
		{
			eventName: 'click',
			hostNodeId: runSymbol!.hostNodeId,
			hostPath: [0],
			symbolIds: [runSymbol!.id],
		},
		{
			eventName: 'click',
			hostNodeId: clearSymbol!.hostNodeId,
			hostPath: [1, 0],
			symbolIds: [clearSymbol!.id],
		},
	]);
});

test('planPublicRender reports state created inside a keyed repeat row with row-scope guidance', async () => {
	const { plan } = await createRenderPlan(
		'src/RowState.tsrx',
		appSource(
			`let rows = state([{ id: 'a', label: 'Alpha' }]); <ul>@for (const row of rows; key row.id) { let selected = state(false); <li>{row.label}</li> }</ul>`,
		),
	);

	expect(plan.keyedRepeats).toEqual([]);
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED',
				title: 'Per-row state in keyed repeats is not supported yet',
				message: expect.stringContaining('state() creates "selected" inside a keyed @for row'),
				why: expect.stringContaining('each row would need its own cell keyed by row identity'),
				suggestions: [
					expect.objectContaining({
						message: expect.stringContaining('Lift the state to a collection on the parent'),
					}),
				],
				docsUrl: 'https://markless.dev/errors/MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED',
			}),
		]),
	);
	expect(plan.diagnostics).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				message: expect.stringContaining('single-row-root-required'),
			}),
		]),
	);
});

test('planPublicRender reports computed created inside a keyed repeat row with row-scope guidance', async () => {
	const { plan } = await createRenderPlan(
		'src/RowComputed.tsrx',
		stateAndComputedSource(
			`let rows = state([{ id: 'a', label: 'Alpha' }]); <ul>@for (const row of rows; key row.id) { const label = computed(() => row.label); <li>{row.label}</li> }</ul>`,
		),
	);

	expect(plan.keyedRepeats).toEqual([]);
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_STATE_REPEAT_ROW_SCOPE_UNSUPPORTED',
				message: expect.stringContaining('computed() creates "label" inside a keyed @for row'),
				suggestions: [
					expect.objectContaining({
						message: expect.stringContaining('one state() holding per-row data keyed by the row key'),
					}),
				],
			}),
		]),
	);
	expect(plan.diagnostics).not.toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				message: expect.stringContaining('single-row-root-required'),
			}),
		]),
	);
});

test.each([
	[
		'rejects fragment row roots with multiple children',
		appSource(
			`let items = state([]); <ul>@for (const item of items; key item.id) {<><li>{item.name}</li><li>{item.detail}</li></>}</ul>`,
		),
		'single-row-root-required',
	],
	[
		'rejects interleaved static siblings in the repeat parent',
		appSource(
			`let items = state([]); <ul><li>No records</li>@for (const item of items; key item.id) {<li>{item.name}</li>}</ul>`,
		),
		'repeat-parent-must-contain-only-repeat',
	],
	[
		'rejects nested repeats',
		appSource(
			`let groups = state([]); <ul>@for (const group of groups; key group.id) {<li>@for (const member of group.members; key member.id) {<span>{member.name}</span>}</li>}</ul>`,
		),
		'nested-repeat-unsupported',
	],
	[
		'rejects unsupported complex bindings',
		appSource(
			`let items = state([]); <ul>@for (const item of items; key item.id) {<li>{label(item.name)}</li>}</ul>`,
			'function label(value) { return String(value); }',
		),
		'unsupported-row-binding',
	],
	[
		'rejects component rows with a component-specific suggestion',
		`export function Tree({ node }) @{
<li>{node.name}<ul>@for (const child of node.children; key child.id) { <Tree node={child} /> }</ul></li>
}`,
		'row-component-content-unsupported',
		'The @for row root is a component (<Tree />); the row root anchors row identity, so wrap it in a host element (for example <li><Tree /></li>).',
	],
])('%s', async (_name, source, reason, suggestion) => {
	const { plan } = await createRenderPlan('src/UnsupportedRows.tsrx', source);

	expect(plan.keyedRepeats).toEqual([]);
	expect(plan.repeatGates).toEqual([
		{
			repeatId: 'repeat:0',
			supported: false,
			reason,
		},
	]);
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
				passId: 'public-render-plan',
				message: expect.stringContaining(reason),
				...(suggestion
					? {
							suggestions: [
								expect.objectContaining({
									message: expect.stringContaining(suggestion),
								}),
							],
						}
					: {}),
			}),
		]),
	);
});

test.each([
	[
		'member-expression component',
		appSource(`<section><ui.Row /></section>`, `const ui = { Row() @{ <li>Hi</li> } };`),
	],
	[
		'@try',
		appSource(
			`let value = state('ready');
<section>@if (value) { @try { <p>{value}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> } }</section>`,
		),
	],
	[
		'@empty',
		appSource(
			`let items = state([]);
<ul>@for (const item of items; key item.id) {<li>{item.name}</li>} @empty {<li>@if (true) { <em>none</em> }</li>}</ul>`,
		),
	],
])(
	'planPublicRender reports %s content the render module would silently drop',
	async (label, source) => {
		const { plan } = await createRenderPlan('src/Unsupported.tsrx', source);

		expect(plan.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
					severity: 'error',
					phase: 'public-render',
					passId: 'public-render-plan',
					title: expect.stringContaining(label),
					primarySpan: expect.objectContaining({ filename: 'src/Unsupported.tsrx' }),
					docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
				}),
			]),
		);
	},
);

test('planPublicRender gates plain-host record-free branch sites as supported', async () => {
	const { plan } = await createRenderPlan(
		'src/BranchCard.tsrx',
		appSource(
			`let open = state(true);
<section>@if (open) { <p>Shown</p> } @else { <p>Hidden</p> }</section>`,
		),
	);

	expect(plan.branchReactivityGates).toEqual([
		{ branchSiteId: 'branch-site:0', supported: true },
	]);
	expect(plan.diagnostics).toEqual([]);
});

test('planPublicRender supports event-bearing arms and gates conditional ones', async () => {
	const { plan: eventPlan } = await createRenderPlan(
		'src/EventBranch.tsrx',
		appSource(
			`let open = state(true); let count = state(0);
<section>@if (open) { <button onClick={() => count++}>Go</button> }</section>`,
		),
	);
	// L4 lifted the record-free requirement: event-bearing arms are supported
	// and their records ride the branch record as arm-relative host paths.
	expect(eventPlan.branchReactivityGates).toEqual([
		{ branchSiteId: 'branch-site:0', supported: true },
	]);
	expect(eventPlan.branchArms).toEqual([
		expect.objectContaining({
			branchSiteId: 'branch-site:0',
			declaredEmptyArms: [1],
			arms: [expect.any(Array), []],
		}),
	]);

	const { plan: nestedPlan } = await createRenderPlan(
		'src/NestedBranch.tsrx',
		appSource(
			`let open = state(true); let inner = state(false);
<section>@if (open) { <div>@if (inner) { <p>In</p> }</div> }</section>`,
		),
	);
	expect(nestedPlan.branchReactivityGates).toEqual([
		expect.objectContaining({
			branchSiteId: 'branch-site:0',
			supported: false,
			reason: 'nested-branch-unsupported',
		}),
		expect.objectContaining({
			branchSiteId: 'branch-site:1',
			supported: false,
			reason: 'nested-branch-unsupported',
		}),
	]);
});

test.each([
	[
		'arm-content-unsupported',
		appSource(
			`let open = state(true);
<section>@if (open) { <Card label="A" /> } @else { <Card label="B" /> }</section>`,
			`function Card({ label }) @{ <article>{label}</article> }`,
		),
	],
	[
		'nested-branch-unsupported',
		appSource(
			`let open = state(true);
<section>@if (open) { @if (open) { <p>Nested</p> } } @else { <p>Closed</p> }</section>`,
		),
	],
	[
		'conditional-branch-unsupported',
		appSource(
			`let open = state(true); let entries = state([]);
<section>@for (const entry of entries; key entry.id) { <article>@if (open) { <p>{entry.name}</p> }</article> }</section>`,
		),
	],
])('B917 planPublicRender reports unsupported branch gate %s', async (reason, source) => {
	const { plan } = await createRenderPlan('src/BranchUnsupported.tsrx', source);
	const gates = plan.branchReactivityGates.filter((gate) => !gate.supported);

	expect(gates).toEqual(
		expect.arrayContaining([expect.objectContaining({ supported: false, reason })]),
	);
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining(
			gates.map((gate) =>
				expect.objectContaining({
					code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
					message: expect.stringContaining(gate.reason),
				}),
			),
		),
	);
});

test('planPublicRender gates a top-level plain-pending async boundary as supported', async () => {
	const { plan } = await createRenderPlan(
		'src/AsyncCard.tsrx',
		appSource(
			`let value = state('ready');
<section>@try { <p>{value}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> }</section>`,
		),
	);

	expect(plan.asyncBoundaryGates).toEqual([{ boundaryId: 'boundary:0', supported: true }]);
	expect(plan.diagnostics).toEqual([]);
});

test('planPublicRender keeps conditional async boundaries gated and diagnosed', async () => {
	const { plan } = await createRenderPlan(
		'src/ConditionalAsync.tsrx',
		appSource(
			`let value = state('ready');
<section>@if (value) { @try { <p>{value}</p> } @pending { <p>Loading</p> } @catch { <p>Broken</p> } }</section>`,
		),
	);

	expect(plan.asyncBoundaryGates).toEqual([
		{
			boundaryId: 'boundary:0',
			supported: false,
			reason: 'conditional-boundary-unsupported',
		},
	]);
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
				title: expect.stringContaining('@try'),
				message: expect.stringContaining('conditional-boundary-unsupported'),
			}),
		]),
	);
});

test('planPublicRender plans plain host-element fragment roots', async () => {
	const { plan } = await createRenderPlan(
		'src/FragmentRoot.tsrx',
		appSource(`let label = state('Hi');
<><header>{label}</header><p>Two</p></>`),
	);

	expect(plan.rootTemplateHtml).toBe('<header> </header><p>Two</p>');
	expect(plan.diagnostics).toEqual([]);
	expect(plan.staticHostLocators).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ tagName: 'header', hostPath: [0] }),
			expect.objectContaining({ tagName: 'p', hostPath: [1] }),
		]),
	);
});

test('planPublicRender keeps component-child fragment roots diagnosed with a scoped reason', async () => {
	// Control-flow fragment children are supported since L4; component and
	// bare-expression children still need the projection/anchor work.
	const { plan } = await createRenderPlan(
		'src/DynamicFragmentRoot.tsrx',
		appSource(`let label = state('Hi');
<>{label}</>`),
	);

	expect(plan.rootTemplateHtml).toBe(null);
	expect(plan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
			severity: 'error',
			phase: 'public-render',
			passId: 'public-render-plan',
			primarySpan: expect.objectContaining({ filename: 'src/DynamicFragmentRoot.tsrx' }),
		}),
	]);
});

test('planPublicRender does not flag supported repeat rows on component-composed pages (need 6)', async () => {
	const { plan } = await createRenderPlan(
		'src/MixedList.tsrx',
		appSource(
			`let entries = state([]);
<main><Header title="Entries" /><section>@for (const entry of entries; key entry.code) {<article><h2>{entry.title}</h2></article>}</section></main>`,
			`import { Header } from './Header.tsrx';`,
		),
	);

	expect(plan.repeatGates).toEqual([{ repeatId: 'repeat:0', supported: true }]);
	// Component-composed pages now render repeat rows (dashboard-migration
	// need 6): no unsupported-construct diagnostic for the @for.
	expect(plan.diagnostics).toEqual([]);
});

async function createRenderPlan(filename: string, source: string) {
	const semanticGraph = await buildSemanticGraph({ filename, source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({
		semanticGraph,
		payloadArena,
		stateLowering,
	});
	const plan = planPublicRender({
		source: { filename, source },
		semanticGraph,
		payloadArena,
		symbolResolver,
	});

	return { plan, payloadArena, semanticGraph, stateLowering, symbolResolver };
}

test('planPublicRender supports component invocations in keyed repeat rows with item-scope props', async () => {
	const { plan } = await createRenderPlan(
		'src/Catalog.tsrx',
		`import { state } from '@markless/core';
import { TagBadge } from './TagBadge.tsrx';

export default function Catalog() @{
	let picked = state('none');
	let goods = state([
		{ sku: 'g1', title: 'First' },
		{ sku: 'g2', title: 'Second' },
	]);

	<main>
		<ul class="goods">
			@for (const good of goods; key good.sku) {
				<li data-sku={good.sku} onClick={() => picked = good.sku}><TagBadge title={good.title} /><span class="meta">{good.title}</span></li>
			}
		</ul>
		<output data-picked>{picked}</output>
	</main>
}`,
	);

	// Item text bindings AFTER the component stay plannable: they render per
	// row through the SSR/CSR mappers, and their positional write plans only
	// feed the direct-DOM row path, which component rows never use.
	expect(plan.repeatGates).toEqual([
		{ repeatId: 'repeat:0', supported: true, componentRows: true },
	]);
	const repeat = plan.keyedRepeats[0];
	expect(repeat?.eventControls).toEqual([
		expect.objectContaining({ eventName: 'click', hostPath: [] }),
	]);
	expect(
		plan.diagnostics.filter((diagnostic) => diagnostic.message.includes('@for')),
	).toEqual([]);
});

test('planPublicRender allows row reads rooted at page props (render-constant)', async () => {
	// Mirror of the dashboard issues list: row hrefs combine a route param
	// (page prop, constant per render) with item fields. Pages with props never
	// use the direct-DOM row machinery, so prop reads are safe row bindings.
	const { plan } = await createRenderPlan(
		'src/IssueList.tsrx',
		`import { computed } from '@markless/core';
import { TagBadge } from './TagBadge.tsrx';

export default function IssueList({ params }) @{
	const model = computed(async () => ({ rows: [{ id: 'i1', title: 'First' }] }));

	<main>
		<section class="rows">
			@for (const row of model.rows; key row.id) {
				<article data-href={'#/r/' + params.repo + '/issues/' + row.id}><TagBadge title={params.repo} /><span>{row.title}</span></article>
			}
		</section>
	</main>
}`,
	);

	expect(plan.repeatGates).toEqual([
		expect.objectContaining({ repeatId: 'repeat:0', supported: true, componentRows: true }),
	]);
});

test('planPublicRender rejects row components whose props read beyond the item scope', async () => {
	const { plan } = await createRenderPlan(
		'src/Catalog.tsrx',
		`import { state } from '@markless/core';
import { TagBadge } from './TagBadge.tsrx';

export default function Catalog() @{
	let picked = state('none');
	let goods = state([{ sku: 'g1', title: 'First' }]);

	<main>
		<ul class="goods">
			@for (const good of goods; key good.sku) {
				<li data-sku={good.sku}><TagBadge title={picked} /></li>
			}
		</ul>
	</main>
}`,
	);

	expect(plan.repeatGates).toEqual([
		{ repeatId: 'repeat:0', supported: false, reason: 'row-component-content-unsupported' },
	]);
	// D4: the refusal explains itself in the author's vocabulary, exact text.
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				message:
					'The @for rows are not compiler-proven (reason: row-component-content-unsupported), so the render module drops the list content.',
				suggestions: [
					{
						message:
							'Components in @for rows render markup only: their props and children may read only the repeat item (and index), they cannot take event props, and row events must come before the component. Move other reads into the item, or lift the component out of the row.',
					},
				],
			}),
		]),
	);
});

test('planPublicRender rejects row events positioned after a component in the row', async () => {
	const { plan } = await createRenderPlan(
		'src/Catalog.tsrx',
		`import { state } from '@markless/core';
import { TagBadge } from './TagBadge.tsrx';

export default function Catalog() @{
	let picked = state('none');
	let goods = state([{ sku: 'g1', title: 'First' }]);

	<main>
		<ul class="goods">
			@for (const good of goods; key good.sku) {
				<li><TagBadge title={good.title} /><button onClick={() => picked = good.sku}>Pick</button></li>
			}
		</ul>
	</main>
}`,
	);

	expect(plan.repeatGates).toEqual([
		{ repeatId: 'repeat:0', supported: false, reason: 'row-component-content-unsupported' },
	]);
});

test('planPublicRender diagnoses React-style children inspection as opaque', async () => {
	const { plan } = await createRenderPlan(
		'src/ChildrenMap.tsrx',
		`import { state } from '@markless/core';

export function Card({ children }) @{
	const items = children.map((child) => child);

	<section>
		<ul>{items}</ul>
	</section>
}
`,
	);

	// Spec 01: children are an opaque compiler-owned template projection —
	// inspect/map/clone/count/mutate must diagnose, not silently misbehave.
	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: 'MARKLESS_CHILDREN_OPAQUE',
				severity: 'error',
				phase: 'public-render',
				message: expect.stringContaining('opaque'),
			}),
		]),
	);
});

test('planPublicRender diagnoses children.length reads as opaque', async () => {
	const { plan } = await createRenderPlan(
		'src/ChildrenCount.tsrx',
		`export function Card({ children }) @{
	const count = children.length;

	<section data-count={count}>{children}</section>
}
`,
	);

	expect(plan.diagnostics).toEqual(
		expect.arrayContaining([expect.objectContaining({ code: 'MARKLESS_CHILDREN_OPAQUE' })]),
	);
});

test('planPublicRender keeps plain children placement undiagnosed', async () => {
	const { plan } = await createRenderPlan(
		'src/ChildrenPlain.tsrx',
		`export function Card({ children }) @{
	<section>{children}</section>
}
`,
	);

	expect(
		(plan.diagnostics ?? []).filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_CHILDREN_OPAQUE',
		),
	).toEqual([]);
});
