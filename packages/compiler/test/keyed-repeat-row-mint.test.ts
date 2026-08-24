import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	createProtocolViewPayload,
	createRenderData,
	lowerStateAccess,
	planPayloadArena,
	planSymbolResolver,
} from '../src/index.ts';

/**
 * What the payload says about one row of a keyed repeat.
 *
 * A row appended to the collection after resume was never served, so the client
 * has no markup to raise for it. The record carries that markup - but only for a
 * row the client can finish alone, because the mint wires nothing: it renders the
 * markup, fills each text position from the item, and puts the row in the row
 * span. Every row needing more than that ships nothing, and the served behaviour
 * is exactly what it was.
 */
async function viewOf(source: string) {
	const semanticGraph = await buildSemanticGraph({ filename: 'src/App.tsrx', source });
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });
	return createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		renderData: createRenderData({ semanticGraph, symbolResolver }),
		publicRenderPlan: {
			asyncBoundaryGates: [],
			branchReactivityGates: [],
			keyedRepeats: [],
		} as never,
	});
}

const preamble = `import { state } from '@markless/core';\n`;

// Pay-per-use, and the byte-equality half of it: a repeat whose row this refuses
// emits the same record it emitted before this field existed, so nothing about
// its payload moved.
test('a repeat whose row is not mintable carries no row markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li class={row.id}>t</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
	expect(Object.keys(view.keyedRepeats![0]!).sort()).toEqual([
		'collectionGraphNodeId',
		'collectionPath',
		'id',
		'itemName',
		'keyPath',
		'parentHostNodeId',
		'rowElementCount',
		'rowEvents',
	]);
});

// The two shapes the mint can finish. A row with no slots is markup and nothing
// else, so it ships with no textSlots field at all.
test('a fully static row ships its finished markup and no text slots', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li>fixed</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowTemplate).toEqual({ html: '<li>fixed</li>' });
});

// The slot markers stay in the html: they ARE the text positions, and the paths
// are fragment-relative, so `[0, 0]` is the first child of the row root.
test('a row whose text reads the item ships the markers and the paths', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a', title: 'T' }]);
	<ul>@for (const row of rows; key row.id) { <li><b>{row.id}</b><i>{row.title}</i></li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowTemplate).toEqual({
		html: '<li><b><!--markless-slot:0--></b><i><!--markless-slot:1--></i></li>',
		textSlots: [
			{ path: [0, 0, 0], itemPath: ['id'] },
			{ path: [0, 1, 0], itemPath: ['title'] },
		],
	});
});

// Fail closed: the value comes from outside the row, so a minted row cannot fill
// it from the item it was minted for. Half a row is worse than none.
test('a row that reads state outside the item ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let note = state('x');
	<ul>@for (const row of rows; key row.id) { <li>{note}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

// Fail closed for the other reason: every non-text slot is a part the mint does
// not fill. One test per slot kind the row can hold.
test('a row with an attribute binding ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li class={row.id}>t</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a row holding an @if ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a', on: true }]);
	<ul>@for (const row of rows; key row.id) { <li>@if (row.on) { <b>yes</b> }</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a row holding a nested repeat ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a', tags: [{ id: 't' }] }]);
	<ul>@for (const row of rows; key row.id) { <li>@for (const tag of row.tags; key tag.id) { <b>{tag.id}</b> }</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a row holding an async boundary ships no markup', async () => {
	const view = await viewOf(`import { computed, state } from '@markless/core';
export function App() @{
	let rows = state([{ id: 'a' }]);
	const detail = computed(async () => 'd');
	<ul>@for (const row of rows; key row.id) { <li>@try { <b>{detail}</b> } @pending { <b>...</b> }</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a row spreading attributes ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a', attrs: { title: 't' } }]);
	<ul>@for (const row of rows; key row.id) { <li {...row.attrs}>t</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a row with a dynamic host ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a', tag: 'b' }]);
	<ul>@for (const row of rows; key row.id) { <li><{row.tag}>t</{row.tag}></li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

// A widget-rooting repeat: each row's content is a component, so each row is one
// rendered widget with a graph of its own. The mint builds markup and nothing
// else, so it can never start a widget - the row ships no template.
test('a repeat whose row roots a widget ships no markup', async () => {
	const view = await viewOf(`import { shared, state } from '@markless/core';
export const rowState = shared(() => ({ open: state(false) }), { scope: 'widget' });
function Row({ label }) @{
	const own = rowState();
	<span onClick={() => own.open = true}>{label}</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row label={row.label} /> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

// The transport rides the record, so it is gated by everything the record is
// gated by: a repeat whose row start cannot be named ships nothing at all, row
// markup included.
test('a repeat that ships no record ships no row markup either', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let show = state(true);
	<ul>@if (show) { <li>header</li> }@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats ?? []).toHaveLength(0);
});
