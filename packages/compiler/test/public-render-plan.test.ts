import { expect, test } from 'vitest';
import { buildSemanticGraph, lowerStateAccess } from '../src/index.ts';
import { planPayloadArena } from '../src/passes/payload-arena.ts';
import { planPublicRender } from '../src/passes/public-render-plan.ts';
import { planSymbolResolver } from '../src/passes/symbol-resolver.ts';

const appSource = (body: string, extra = '') =>
	`import { state } from '@arcade/core';\n${extra}\nexport function App() @{\n${body}\n}\n`;
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
