import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { planPublicRender } from '../src/passes/public-render/plan.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const appSource = (body: string, extra = '') =>
	`import { state } from '@markless/core';\n${extra}\nexport function App() @{\n${body}\n}\n`;
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
])('%s', async (_name, source, reason) => {
	const { plan } = await createRenderPlan('src/UnsupportedRows.tsrx', source);

	expect(plan.keyedRepeats).toEqual([]);
	expect(plan.repeatGates).toEqual([
		{
			repeatId: 'repeat:0',
			supported: false,
			reason,
		},
	]);
	expect(plan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
			severity: 'error',
			phase: 'public-render',
			passId: 'public-render-plan',
			message: expect.stringContaining(reason),
		}),
	]);
});

test.each([
	[
		'dynamic tag',
		appSource(`let tag = state('div'); let count = state(0);
<section><{tag} onClick={() => count++}>Hi</{tag}></section>`),
	],
	[
		'<style>',
		appSource(`<section class="card"><style>.card { color: red; }</style>Hi</section>`),
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

		expect(plan.diagnostics).toEqual([
			expect.objectContaining({
				code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
				severity: 'error',
				phase: 'public-render',
				passId: 'public-render-plan',
				title: expect.stringContaining(label),
				primarySpan: expect.objectContaining({ filename: 'src/Unsupported.tsrx' }),
				docsUrl: 'https://markless.dev/errors/MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
			}),
		]);
	},
);

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
	expect(plan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
			title: expect.stringContaining('@try'),
			message: expect.stringContaining('conditional-boundary-unsupported'),
		}),
	]);
});

test('planPublicRender reports a fragment component root instead of planning nothing', async () => {
	const { plan } = await createRenderPlan(
		'src/FragmentRoot.tsrx',
		appSource(`<><p>One</p><p>Two</p></>`),
	);

	expect(plan.rootTemplateHtml).toBe(null);
	expect(plan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_ROOT_UNSUPPORTED',
			severity: 'error',
			phase: 'public-render',
			passId: 'public-render-plan',
			primarySpan: expect.objectContaining({ filename: 'src/FragmentRoot.tsrx' }),
		}),
	]);
});

test('planPublicRender reports supported repeat rows skipped by component children', async () => {
	const { plan } = await createRenderPlan(
		'src/MixedList.tsrx',
		appSource(
			`let entries = state([]);
<main><Header title="Entries" /><section>@for (const entry of entries; key entry.code) {<article><h2>{entry.title}</h2></article>}</section></main>`,
			`import { Header } from './Header.tsrx';`,
		),
	);

	expect(plan.repeatGates).toEqual([{ repeatId: 'repeat:0', supported: true }]);
	expect(plan.diagnostics).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
			severity: 'error',
			phase: 'public-render',
			message: expect.stringContaining('component children'),
		}),
	]);
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
