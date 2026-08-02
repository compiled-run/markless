import { expect, test } from 'vitest';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/protocol';
import { compileTsrxModule } from '../../src/compile-module.ts';

test('renderData is a registered graph-derived artifact with chunks and residue tables', async () => {
	const result = await compileTsrxModule({
		filename: 'src/App.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function App() @{
	let tag = state('article');
	let active = state(true);
	let rows = state([{ id: 'a', label: 'A' }]);
	const rowCount = computed(() => rows.length);
	const details = computed(async () => ({ label: 'Ready' }));

	<main>
		<{tag} class="card"><strong>{rows[0].label}</strong></{tag}>
		@if (active) { <p>On</p> } @else { <p>Off</p> }
		@for (const row of rows; key row.id) { <li>{row.label}</li> }
		@try { <output>{details.label}</output> } @pending { <i>Wait</i> } @catch (error) { <b>{error.message}</b> }
		<button onClick={() => active = !active}>Toggle</button>
	</main>
}
`,
		symbols: [],
	});

	expect(result.passGraph.orderedPassIds).toContain('render-data');
	expect(result.renderData).toMatchObject({
		passId: 'render-data',
		filename: 'src/App.tsrx',
		root: { componentName: 'App', templateId: 'template:App' },
	});
	expect(result.renderData.chunks.some((chunk) => chunk.kind === 'dynamic-host-children')).toBe(
		true,
	);
	expect(result.renderData.initialValues.map((entry) => entry.graphNodeId)).toEqual(
		expect.arrayContaining(['state:tag', 'state:active', 'state:rows', 'computed:rowCount']),
	);
	expect(result.renderData.initialValues).toContainEqual(
		expect.objectContaining({
			graphNodeId: 'computed:rowCount',
			value: { kind: 'symbol-function', symbolId: expect.any(String) },
		}),
	);
	expect(result.renderData.branches).toEqual([
		expect.objectContaining({
			branchSiteId: 'branch-site:0',
			testReads: [expect.objectContaining({ graphNodeId: 'state:active' })],
			armChunkIds: ['branch:branch-site:0:arm:0', 'branch:branch-site:0:arm:1'],
		}),
	]);
	expect(result.renderData.repeats).toEqual([
		expect.objectContaining({
			repeatId: 'repeat:0',
			collectionGraphNodeId: 'state:rows',
			keyPath: ['id'],
			rowChunkId: 'repeat:repeat:0:row',
		}),
	]);
	expect(result.renderData.boundaries).toEqual([
		expect.objectContaining({
			boundaryId: 'boundary:0',
			runnerGraphNodeId: 'computed:details',
			initiallyServedArm: ASYNC_BOUNDARY_ARM.pending,
			armChunkIds: expect.objectContaining({
				try: 'async:boundary:0:arm:try',
				pending: 'async:boundary:0:arm:pending',
				catch: 'async:boundary:0:arm:catch',
			}),
		}),
	]);
	expect(result.renderData.interactions).toEqual([
		expect.objectContaining({
			eventName: 'click',
			symbolIds: [expect.any(String)],
		}),
	]);
});

test('renderData root and native static HTML agree with the public plan for a static page', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Static.tsrx',
		source: `export function App() @{ <main class="page"><h1>Hello</h1><p>Ready</p></main> }`,
		symbols: [],
	});
	const root = result.renderData.chunks.find(
		(chunk) => chunk.id === result.renderData.root?.templateId,
	);

	expect(root?.statics).toEqual([result.publicRenderPlan.rootTemplateHtml]);
	expect(root?.hosts.map((host) => host.coordinate.path)).toEqual([[0], [0, 0], [0, 1]]);
	expect(result.publicRenderPlan.staticHostLocators.map((host) => host.hostPath)).toEqual([
		[],
		[0],
		[1],
	]);
});

test('renderData keeps dynamic-host interaction symbols on the dynamic host slot', async () => {
	const result = await compileTsrxModule({
		filename: 'src/DynamicButton.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let tag = state('button');
	let pressed = state(false);
	<main><{tag} onClick={() => pressed = true}>Press</{tag}></main>
}
`,
		symbols: [],
	});
	const root = result.renderData.chunks.find((chunk) => chunk.id === 'template:App');
	const dynamicHost = root?.slots.find((slot) => slot.kind === 'dynamic-host');

	expect(dynamicHost).toEqual(
		expect.objectContaining({
			kind: 'dynamic-host',
			hostNodeId: 'h1',
			coordinate: { kind: 'comment-anchor', path: [0, 0] },
		}),
	);
	expect(result.renderData.interactions).toContainEqual(
		expect.objectContaining({
			hostNodeId: 'h1',
			eventName: 'click',
			symbolIds: [expect.any(String)],
		}),
	);
});

test('renderData keeps the repeat trailing-sibling landmine visible while the public plan rejects it', async () => {
	const result = await compileTsrxModule({
		filename: 'src/RepeatLandmine.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	const rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.id}</li> }<li>Trailing</li></ul>
}
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.repeatGates).toContainEqual(
		expect.objectContaining({ repeatId: 'repeat:0', supported: false }),
	);
	expect(result.publicRenderPlan.diagnostics).toContainEqual(
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
			severity: 'warning',
		}),
	);
	expect(result.publicRenderPlan.rootTemplateHtml).toContain('<li>Trailing</li>');
	expect(result.publicRenderPlan.rootTemplateHtml).not.toContain('<li> </li>');
	expect(result.renderData.repeats).toContainEqual(
		expect.objectContaining({ repeatId: 'repeat:0', rowChunkId: 'repeat:repeat:0:row' }),
	);
	const root = result.renderData.chunks.find((chunk) => chunk.id === 'template:App');
	expect(root?.statics.join('')).toContain('<li>Trailing</li>');
});

test('renderData keeps a same-file child async chunk visible while the public plan pins the drop', async () => {
	const result = await compileTsrxModule({
		filename: 'src/AsyncChildLandmine.tsrx',
		source: `
import { computed } from '@markless/core';
function Child() @{
	const data = computed(async () => 'Ready');
	@try { <strong>{data}</strong> } @pending { <i>Wait</i> } @catch (error) { <b>{error.message}</b> }
}
export function App() @{ <main><Child /></main> }
`,
		symbols: [],
	});

	expect(result.publicRenderPlan.diagnostics).toContainEqual(
		expect.objectContaining({
			code: 'MARKLESS_PUBLIC_RENDER_UNSUPPORTED_CONSTRUCT',
			severity: 'warning',
		}),
	);
	expect(result.publicRenderPlan.rootTemplateHtml).toBe('<main></main>');
	expect(result.renderData.chunks).toContainEqual(
		expect.objectContaining({
			id: 'async:boundary:0:arm:try',
			statics: expect.arrayContaining([expect.stringContaining('<strong>')]),
		}),
	);
});
