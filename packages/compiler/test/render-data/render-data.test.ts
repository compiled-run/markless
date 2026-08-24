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

test('renderData owns root native static HTML and host coordinates', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Static.tsrx',
		source: `export function App() @{ <main class="page"><h1>Hello</h1><p>Ready</p></main> }`,
		symbols: [],
	});
	const root = result.renderData.chunks.find(
		(chunk) => chunk.id === result.renderData.root?.templateId,
	);

	expect(root?.statics).toEqual(['<main class="page"><h1>Hello</h1><p>Ready</p></main>']);
	expect(root?.hosts.map((host) => host.coordinate.path)).toEqual([[0], [0, 0], [0, 1]]);
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

test('renderData keeps repeat trailing-sibling content without a plan projection', async () => {
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

	expect(result.publicRenderPlan.diagnostics).toEqual([]);
	expect(result.renderData.repeats).toContainEqual(
		expect.objectContaining({ repeatId: 'repeat:0', rowChunkId: 'repeat:repeat:0:row' }),
	);
	const root = result.renderData.chunks.find((chunk) => chunk.id === 'template:App');
	expect(root?.statics.join('')).toContain('<li>Trailing</li>');
});

test('renderData keeps call-expression collections off the direct repeat path', async () => {
	const result = await compileTsrxModule({
		filename: 'src/FilteredRows.tsrx',
		source: `
import { state } from '@markless/core';
function visibleRows(rows: readonly { id: string; label: string }[]) {
	return rows.filter((row) => row.id !== 'hidden');
}
export function App() @{
	let rows = state([{ id: 'one', label: 'One' }, { id: 'hidden', label: 'Hidden' }]);
	<ul>@for (const row of visibleRows(rows); key row.id) { <li>{row.label}</li> }</ul>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.keyedRepeats).toEqual([
		expect.objectContaining({
			collectionSource: 'visibleRows(rows)',
		}),
	]);
	expect(result.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toBeUndefined();
	expect(result.renderData.repeats).toEqual([
		expect.objectContaining({ directSupported: false }),
	]);
});

test('renderData keeps a same-file child async chunk visible while the legacy emitter fails loudly', async () => {
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
			severity: 'error',
		}),
	);
	expect(result.renderData.chunks).toContainEqual(
		expect.objectContaining({
			id: 'async:boundary:0:arm:try',
			statics: expect.arrayContaining([expect.stringContaining('<strong>')]),
		}),
	);
});

test('renderData references non-literal state initializers and sync derives by keyed symbol', async () => {
	const result = await compileTsrxModule({
		filename: 'src/KeyedValues.tsrx',
		source: `
import { state, computed } from '@markless/core';
import { makeSeed } from './seed.ts';
export function App() @{
	const seed = state(makeSeed());
	const doubled = computed(() => seed.count * 2);
	<output>{doubled}</output>
}
`,
		symbols: [],
	});

	const initializer = result.renderData.initialValues.find(
		(entry) => entry.graphNodeId === 'state:seed',
	);
	const derive = result.renderData.initialValues.find(
		(entry) => entry.graphNodeId === 'computed:doubled',
	);
	expect(initializer?.value).toEqual({ kind: 'symbol-function', symbolId: expect.any(String) });
	expect(derive?.value).toEqual({ kind: 'symbol-function', symbolId: expect.any(String) });
	const initializerSymbolId =
		initializer?.value.kind === 'symbol-function' ? initializer.value.symbolId : undefined;
	expect(
		result.symbolModules.modules.find((module) => module.symbolId === initializerSymbolId),
	).toEqual(expect.objectContaining({ kind: 'state-initializer' }));
});

test('moduleGraphInterface publishes child chunk summaries and component inputs', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Card.tsrx',
		source: `export function Card({ title }: { title: string }) @{ <article><h2>{title}</h2></article> }`,
		symbols: [],
	});

	expect(result.moduleGraphInterface.render).toEqual({
		version: 1,
		components: [
			expect.objectContaining({
				componentName: 'Card',
				rootChunkId: 'template:Card',
				childChunks: [],
				inputs: [expect.objectContaining({ localName: 'title', path: ['title'] })],
			}),
		],
	});
});

test('renderData carries the authored collection for repeats that are not graph reads', async () => {
	const inline = await compileTsrxModule({
		filename: 'src/InlineNav.tsrx',
		source: `
export function App() @{
	<ul>@for (const entry of [{ href: '/a', title: 'Alpha' }]; key entry.href) { <li>{entry.title}</li> }</ul>
}
`,
		symbols: [],
	});
	const moduleConst = await compileTsrxModule({
		filename: 'src/ModuleNav.tsrx',
		source: `
const nav = [{ href: '/a', title: 'Alpha' }, { href: '/b', title: 'Beta' }];
export function App() @{
	<ul>@for (const entry of nav; key entry.href) { <li>{entry.title}</li> }</ul>
}
`,
		symbols: [],
	});
	const imported = await compileTsrxModule({
		filename: 'src/ImportedNav.tsrx',
		source: `
import { nav } from './nav.ts';
export function App() @{
	<ul>@for (const entry of nav; key entry.href) { <li>{entry.title}</li> }</ul>
}
`,
		symbols: [],
	});

	for (const [result, collectionSource] of [
		[inline, "[{ href: '/a', title: 'Alpha' }]"],
		[moduleConst, 'nav'],
		[imported, 'nav'],
	] as const) {
		expect(result.semanticGraph.keyedRepeats).toEqual([
			expect.objectContaining({ collectionSource }),
		]);
		expect(result.semanticGraph.keyedRepeats[0]?.collectionGraphNodeId).toBeUndefined();
		expect(result.renderData.repeats).toEqual([
			expect.objectContaining({
				repeatId: 'repeat:0',
				collectionSource,
				directSupported: false,
			}),
		]);
		expect(result.renderData.repeats[0]?.collectionGraphNodeId).toBeUndefined();
	}
});

test('renderData leaves graph-backed repeat collections on the graph read', async () => {
	const result = await compileTsrxModule({
		filename: 'src/StateRows.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.label}</li> }</ul>
}
`,
		symbols: [],
	});

	expect(result.renderData.repeats).toEqual([
		expect.objectContaining({
			repeatId: 'repeat:0',
			collectionGraphNodeId: 'state:rows',
			directSupported: true,
		}),
	]);
	expect(result.renderData.repeats[0]).not.toHaveProperty('collectionSource');
});

test('renderData carries one interaction per host+event for a handler array', async () => {
	const result = await compileTsrxModule({
		filename: 'src/ArrayHandler.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let order = state('');
	<button type="button" onClick={[() => (order = order + 'A'), () => (order = order + 'B')]}>{order}</button>
}
`,
		symbols: [],
	});

	// The semantic graph keeps a record per authored entry; render-data must not,
	// or direct CSR attaches one listener per entry and runs every handler twice.
	expect(result.semanticGraph.events).toHaveLength(2);
	expect(result.renderData.interactions).toEqual([
		expect.objectContaining({
			hostNodeId: result.semanticGraph.events[0]?.hostNodeId,
			eventName: 'click',
			symbolIds: [expect.any(String), expect.any(String)],
		}),
	]);
});

test('renderData keeps one row eventControl per handler entry for a row handler array', async () => {
	const result = await compileTsrxModule({
		filename: 'src/RowArrayHandler.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let trace = state('');
	let rows = state([{ id: 'alpha' }, { id: 'bravo' }]);
	<main>
		<p>{trace}</p>
		<ul>@for (const row of rows; key row.id) { <li onClick={[() => (trace = trace + 'A'), () => (trace = trace + 'B')]}>{row.id}</li> }</ul>
	</main>
}
`,
		symbols: [],
	});

	// The semantic graph keeps a record per authored entry, and each entry already
	// fans out to the whole host+event handler list, so an undeduped repeat record
	// carries entries-squared controls (four here) instead of one per entry.
	expect(result.semanticGraph.events).toHaveLength(2);
	const eventControls = result.renderData.repeats[0]?.eventControls ?? [];
	expect(eventControls.map((control) => control.symbolId)).toHaveLength(2);
	expect(new Set(eventControls.map((control) => control.symbolId)).size).toBe(2);
	expect(eventControls.map((control) => control.eventName)).toEqual(['click', 'click']);
	// Authored order, and every entry's own source - the whole ordered list survives.
	expect(eventControls.map((control) => control.handlerSource)).toEqual([
		"() => (trace = trace + 'A')",
		"() => (trace = trace + 'B')",
	]);
});

test('renderData keeps one interaction per distinct host+event pair', async () => {
	const result = await compileTsrxModule({
		filename: 'src/TwoEvents.tsrx',
		source: `
import { state } from '@markless/core';
export function App() @{
	let count = state(0);
	<div>
		<button type="button" onClick={[() => count++, () => count++]} onFocus={() => count--}>{count}</button>
		<a href="#x" onClick={() => count++}>Link</a>
	</div>
}
`,
		symbols: [],
	});

	expect(
		result.renderData.interactions.map(
			(interaction) => `${interaction.hostNodeId}:${interaction.eventName}`,
		),
	).toEqual([...new Set(
		result.semanticGraph.events.map((event) => `${event.hostNodeId}:${event.eventName}`),
	)]);
	expect(result.renderData.interactions).toHaveLength(3);
});
