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
 * Where a repeat's rows begin, and what stands in for them when there are none.
 *
 * The resume reconcile addresses rows by position among the parent's child
 * ELEMENTS and a repeat leaves no anchor comment behind, so both facts have to
 * be stated by the compiler or they cannot be known at all.
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

test('rows that start their parent say nothing about where they begin', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowStartOffset');
});

test('a static sibling in front of the rows is counted onto the row start', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowStartOffset).toBe(1);
});

// Text before the rows occupies a child index and produces no element, so it
// must not move the row start; counting nodes rather than elements would.
test('text in front of the rows does not move the row start', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let title = state('t');
	<ul>{title}@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats).toHaveLength(1);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowStartOffset');
});

// Fail closed: an `@if` in front of the rows renders an arm-dependent number of
// elements, so no offset can be stated and the repeat ships no record at all
// rather than a record that would pair every key with the wrong element.
test('a branch in front of the rows drops the repeat record', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	let show = state(true);
	<ul>@if (show) { <li>header</li> }@for (const row of rows; key row.id) { <li>{row.id}</li> }</ul>
}
`);
	expect(view.keyedRepeats ?? []).toHaveLength(0);
});

// An `@empty` arm sits after the rows, so it never moves the row start.
test('an @empty arm after the rows leaves the row start alone', async () => {
	const view = await viewOf(`${preamble}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul><li>header</li>@for (const row of rows; key row.id) { <li>{row.id}</li> } @empty { <li>nothing</li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]?.rowStartOffset).toBe(1);
});
