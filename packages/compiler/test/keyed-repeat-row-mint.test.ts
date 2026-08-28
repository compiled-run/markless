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
		semanticGraph,
		renderData: createRenderData({ semanticGraph, symbolResolver }),
		publicRenderPlan: {
			asyncBoundaryGates: [],
			branchReactivityGates: [],
			keyedRepeats: [],
		} as never,
	});
}

const preamble = `import { state } from '@markless/core';\n`;

// A bare call is the stand-in for a value only rendering produces: the read
// collector cannot see inside the function, so nothing says what would move the
// answer and no computed is minted for it. A method call ON a read value is a
// different shape - it lifts, and the rows below pin that it mints.
const renderOnlyHelper = `function shout(value: string) { return String(value).toUpperCase(); }\n`;

// Pay-per-use, and the byte-equality half of it: a repeat whose row this refuses
// emits the same record it emitted before this field existed, so nothing about
// its payload moved.
test('a repeat whose row is not mintable carries no row markup', async () => {
	const view = await viewOf(`${preamble}${renderOnlyHelper}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let theme = state('dark');
	<ul>@for (const row of rows; key row.id) { <li class={shout(theme)}>t</li> }</ul>
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

// A read outside the item names the graph node instead of an item property, and
// the mint takes it once, when it builds the row - which is what a served row's
// own outside read does too, since a row host carries no dom-update record.
test('a row that reads state outside the item ships the graph node and the path', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let note = state('x');
	<ul>@for (const row of rows; key row.id) { <li>{note}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]?.rowTemplate?.textSlots).toEqual([
		{ path: [0, 0], graphNodeId: expect.stringContaining('note'), graphPath: [] },
	]);
});

// Fail closed on what is left: a value only rendering produces has no channel in
// the record at all, so the whole template stays off.
test('a row whose value only rendering produces ships no markup', async () => {
	const view = await viewOf(`${preamble}${renderOnlyHelper}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let note = state('x');
	<ul>@for (const row of rows; key row.id) { <li>{shout(note)}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

// The other side of that line, and why the refusal above is about the read and
// not about the punctuation: a method call ON an outside cell is lifted into a
// computed before the mint looks, so the row template fills it from the graph
// like any other outside read.
test('a row whose text calls a method on an outside cell ships the lifted graph pair', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let list = state(['x', 'y']);
	<ul>@for (const row of rows; key row.id) { <li>{list.join('|')}</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowTemplate?.textSlots).toEqual([
		{
			path: [0, 0],
			graphNodeId: expect.stringContaining('templateExpression'),
			graphPath: [],
		},
	]);
});

// The third shape: an attribute whose value is read off the item. There is no
// marker for it - the statics join around the missing value - so the path names
// the ELEMENT and the slot carries the attribute name to write.
test('a row whose attribute reads the item ships the element path and the name', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a', label: 'L' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={row.id}>{row.label}</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowTemplate).toEqual({
		html: '<li><!--markless-slot:1--></li>',
		textSlots: [{ path: [0, 0], itemPath: ['label'] }],
		attributeSlots: [{ path: [0], name: 'data-row', itemPath: ['id'] }],
	});
});

// Pay-per-use inside the field too: a row with no dynamic attribute ships no
// attributeSlots at all, so its template is the bytes it was.
test('a row with no dynamic attribute ships no attribute slots', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowTemplate).not.toHaveProperty('attributeSlots');
});

// An attribute reads outside the item on the same terms its text does.
test('a row whose attribute reads state outside the item ships the graph pair', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let theme = state('dark');
	<ul>@for (const row of rows; key row.id) { <li class={theme}>t</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowTemplate?.attributeSlots).toEqual([
		{ path: [0], name: 'class', graphNodeId: 'state:theme', graphPath: [] },
	]);
});

// Fail closed for the other reason: every slot that is neither text nor an
// attribute is a part the mint does not fill. One test per slot kind the row can
// hold, plus the two attribute values the mint cannot reach.

// The mint reads paths off the item; it does not evaluate expressions, so an
// attribute value computed from the item is still outside what it can finish.
test('a row whose attribute value is a computed expression ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={'r-' + row.id}>t</li> }</ul>
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
// rendered widget with a graph of its own. Markup could never finish such a row,
// so this half stays refused - and the row is named by identity instead.
test('a repeat whose row roots a widget ships identity, not markup', async () => {
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
	expect(view.keyedRepeats?.[0]?.rowComponent).toMatchObject({ componentName: 'App' });
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
