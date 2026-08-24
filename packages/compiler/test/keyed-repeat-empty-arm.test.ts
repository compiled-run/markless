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
 * What the payload says about a repeat's `@empty` arm.
 *
 * A repeat served with rows never paints its arm, so the client has no markup to
 * raise when the collection empties later. The record carries that markup - but
 * only for an arm the client can finish alone, because the mint wires nothing:
 * it renders the markup, puts it in the row span, and tells the element census.
 * Every arm needing more than that ships nothing, and the served behaviour is
 * exactly what it was.
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

// Pay-per-use, and the byte-equality half of it: a repeat that declared no
// `@empty` arm emits the same record it emitted before this field existed, so
// nothing about its payload moved.
test('a repeat with no @empty arm carries no arm markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('emptyArm');
	expect(Object.keys(view.keyedRepeats![0]!).sort()).toEqual([
		'collectionGraphNodeId',
		'collectionPath',
		'id',
		'itemName',
		'keyPath',
		'parentHostNodeId',
		'rowElementCount',
		'rowEvents',
		'rowStartOffset',
	]);
});

test('a static @empty arm ships its finished markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li>nothing</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.emptyArm).toEqual({ html: '<li>nothing</li>' });
});

// Fail closed: a read inside the arm is a slot, and the mint has no way to fill
// one. Half an arm is worse than none, so the repeat ships no arm at all.
test('an @empty arm that reads state ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let note = state('nothing');
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li>{note}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('emptyArm');
});

// Fail closed for the other reason: the markup here IS static, but a record
// names a host inside it. The mint registers nothing, so shipping this arm would
// paint a button that does nothing when pressed.
test('an @empty arm carrying a handler ships no markup', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li><button onClick={() => rows = [{ id: 'a' }]}>reset</button></li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('emptyArm');
});

// The transport rides the record, so it is gated by everything the record is
// gated by: a repeat whose row start cannot be named ships nothing at all, arm
// included.
test('a repeat that ships no record ships no arm either', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let show = state(true);
	<ul>@if (show) { <li>header</li> }@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li>nothing</li> }</ul>
}
`);
	expect(view.keyedRepeats ?? []).toHaveLength(0);
});
