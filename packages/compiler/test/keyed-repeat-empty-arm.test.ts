import { expect, test } from 'vitest';
import {
	buildSemanticGraph,
	compileTsrxModule,
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
		// The item-text row is exactly the tier-1 mintable shape, so the record
		// carries its rowTemplate; the assertion pins that nothing ELSE appeared.
		'rowTemplate',
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

// The arm's own reads ride as slots the mint fills, so an arm with live text is raised current.
test('an @empty arm that reads state ships its markup with the reads it fills', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let note = state('nothing');
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li title={note}>No {note} here</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.emptyArm).toEqual({
		html: '<li>No <!--markless-slot:1--> here</li>',
		textSlots: [{ path: [0, 1], graphNodeId: 'state:note', graphPath: [] }],
		attributeSlots: [{ path: [0], name: 'title', graphNodeId: 'state:note', graphPath: [] }],
	});
});

// A value only the render produces has no channel the mint can read, so that arm still ships nothing.
test('an @empty arm placing a child component ships no markup', async () => {
	const view = await viewOf(`${preamble}
function Hint(props: { text: string }) @{
	<small>{props.text}</small>
}

export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li><Hint text="none" /></li> }</ul>
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
// gated by: a repeat whose rows cannot be placed from either end ships nothing
// at all, arm included.
test('a repeat that ships no record ships no arm either', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let show = state(true);
	<ul>@if (show) { <li>header</li> }@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li>nothing</li> }@if (show) { <li>footer</li> }</ul>
}
`);
	expect(view.keyedRepeats ?? []).toHaveLength(0);
});

// Pay-per-use: only a repeat whose arm shows a live value names the module that fills one.
test('only an @empty arm showing a live value demands the empty-arm slot module', async () => {
	const demand = async (arm: string) => {
		const result = await compileTsrxModule({
			filename: 'src/App.tsrx',
			source: `${preamble}
export default function App() @{
	let rows = state([{ id: 'a' }]);
	let note = state('nothing');
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { ${arm} }</ul>
}
`,
			symbols: [],
		});
		return result.runtimeDemandMap.payloadRecords?.find((entry) => entry.kind === 'keyed-repeat')
			?.runtimeModuleIds;
	};
	expect(await demand('<li>{note}</li>')).toContain('web/fns/empty-arm-slots');
	const fixed = await demand('<li>nothing</li>');
	expect(fixed).toContain('web/fns/row-mint');
	expect(fixed).not.toContain('web/fns/empty-arm-slots');
});
