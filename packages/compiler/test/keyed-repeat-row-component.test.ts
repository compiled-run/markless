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
 * What the payload says about a row whose whole content is a component.
 *
 * Such a row has a graph, not a template: one component instance per rendered
 * row. Markup could never finish it, so the record names the row by identity -
 * the edge to run and the component that owns it - and the client rebuilds the
 * row by running the same one-edge render the server ran.
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

const sameModuleRow = `import { state } from '@markless/core';
function Row({ item }) @{
	let open = state(false);
	<li onClick={() => open = !open}>{item.label}</li>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`;

test('a same-module component row ships the edge, the owning component and the item prop', async () => {
	const view = await viewOf(sameModuleRow);
	const repeat = view.keyedRepeats?.[0];
	expect(repeat).toBeDefined();
	expect(repeat).not.toHaveProperty('rowTemplate');
	expect(repeat?.rowComponent?.componentName).toBe('App');
	expect(repeat?.rowComponent?.itemPropName).toBe('item');
	expect(typeof repeat?.rowComponent?.componentEdgeId).toBe('string');
	// Three identifiers and nothing else: no markup crosses in this field.
	expect(Object.keys(repeat!.rowComponent!).sort()).toEqual([
		'componentEdgeId',
		'componentName',
		'itemPropName',
	]);
});

// Pay-per-use inside the field: a row whose props are all derived carries no
// item prop name, because no single prop IS the row's item.
test('a row that passes no bare item carries no item prop name', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ label }) @{
	let open = state(false);
	<li onClick={() => open = !open}>{label}</li>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row label={row.label} /> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowComponent).not.toHaveProperty('itemPropName');
});

// Pay-per-use, and the byte-equality half of it: a row that is markup emits no
// rowComponent at all, so its record is what it was before this existed.
test('a markup row carries no component identity', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).toHaveProperty('rowTemplate');
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

// Fail closed, phase 1: the client rebuilds the row from THIS module's render
// data, so a child that lives across an import has nothing here to run.
test('a cross-module component row ships no identity', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
import { Row } from './row.tsrx';
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

// Fail closed for the second phased reason: a row whose component is written
// around projected children needs the parent's own markup to rebuild too.
test('a projecting component row ships no identity', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ children }) @{
	let open = state(false);
	<li onClick={() => open = !open}>{children}</li>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row><b>{row.label}</b></Row> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

// The transport rides the record, so it is gated by everything the record is
// gated by: a repeat whose row start cannot be named ships nothing at all.
test('a repeat that ships no record ships no component identity either', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ item }) @{
	let open = state(false);
	<li onClick={() => open = !open}>{item.label}</li>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	let show = state(true);
	<ul>@if (show) { <li>header</li> }@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`);
	expect(view.keyedRepeats ?? []).toHaveLength(0);
});

// Position keying leaves a row with no data identity to resume against, so the
// record never ships - and neither does the component identity riding it.
test('an index-keyed component repeat ships no record', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ item }) @{
	let open = state(false);
	<li onClick={() => open = !open}>{item.label}</li>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key i) { <Row item={row} /> }</ul>
}
`);
	expect(view.keyedRepeats ?? []).toHaveLength(0);
});
