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

/**
 * The same view, for a row whose component lives in another file.
 *
 * The child module compiles first and publishes its module-graph interface; the
 * owner then compiles against it, exactly as a real build orders the two. The
 * interface is what the owner's mint decision reads, so a test that omits it is
 * pinning the unlinked case, not the cross-module one.
 */
async function viewOfImportedRow(childSource: string, ownerSource: string) {
	const child = await buildSemanticGraph({ filename: 'src/row.tsrx', source: childSource });
	const importedModuleInterfaces = { './row.tsrx': child.moduleGraphInterface };
	const semanticGraph = await buildSemanticGraph({
		filename: 'src/App.tsrx',
		source: ownerSource,
		importedModuleInterfaces,
	});
	const stateLowering = lowerStateAccess({ semanticGraph });
	const payloadArena = planPayloadArena({ semanticGraph, stateLowering });
	const symbolResolver = planSymbolResolver({ semanticGraph, payloadArena });
	return createProtocolViewPayload({
		payloadArena,
		symbolResolver,
		semanticGraph,
		source: { importedModuleInterfaces },
		renderData: createRenderData({ semanticGraph, symbolResolver }),
		publicRenderPlan: {
			asyncBoundaryGates: [],
			branchReactivityGates: [],
			keyedRepeats: [],
		} as never,
	});
}

const importingApp = `import { state } from '@markless/core';
import { Row } from './row.tsrx';
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`;

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
	// Three identifiers and nothing else: no markup crosses in this field, and no
	// slot path - a row that IS the component has no wrapper to place it in, so
	// its record is byte-identical to what it was before wrappers were minted.
	expect(Object.keys(repeat!.rowComponent!).sort()).toEqual([
		'componentEdgeId',
		'componentName',
		'itemPropName',
	]);
});

// The wrapped shape, which is the checklist idiom: the row element is markup and
// the child is identity, joined by the path of the marker the child replaces.
const wrappedRow = `import { state } from '@markless/core';
function Row({ label }) @{
	<span>{label}</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={row.id}><Row label={row.label} /></li> }</ul>
}
`;

test('a row element wrapping a component ships the wrapper markup and the child identity', async () => {
	const view = await viewOf(wrappedRow);
	const repeat = view.keyedRepeats?.[0];
	expect(repeat?.rowTemplate?.html).toContain('<li');
	expect(repeat?.rowTemplate?.attributeSlots).toEqual([
		expect.objectContaining({ name: 'data-row', itemPath: ['id'] }),
	]);
	expect(repeat?.rowComponent?.componentName).toBe('App');
	expect(repeat?.rowComponent?.slotPath).toEqual([0, 0]);
});

// A wrapper with no slots of its own is still a wrapper: the markup half carries
// the element and nothing else, and the path still says where the child lands.
test('a bare wrapper element around a component ships markup with no slots', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ label }) @{
	<span>{label}</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li><Row label={row.label} /></li> }</ul>
}
`);
	const repeat = view.keyedRepeats?.[0];
	expect(Object.keys(repeat!.rowTemplate!)).toEqual(['html']);
	expect(repeat?.rowComponent?.slotPath).toEqual([0, 0]);
});

// The wrapper is minted from markup, so a wrapper slot markup cannot finish
// refuses the whole row rather than shipping a half of each.
test('a wrapper reading outside its item ships neither half', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ label }) @{
	<span>{label}</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	let title = state('t');
	<ul>@for (const row of rows; key row.id) { <li data-row={title}><Row label={row.label} /></li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

// Two children in one row is two graphs to place, and the record names one.
test('a row wrapping two components ships neither half', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ label }) @{
	<span>{label}</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li><Row label={row.label} /><Row label={row.id} /></li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

// The gates are the row's, not the wrapper's: a child whose module published no
// interface here leaves its construct census unknowable, and unknowable refuses.
test('a wrapper around an unlinked cross-module component ships neither half', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
import { Row } from './row.tsrx';
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={row.id}><Row label={row.label} /></li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a wrapper around a branching component ships neither half', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ label }) @{
	let open = state(false);
	<span onClick={() => open = !open}>@if (open) { <b>{label}</b> }</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={row.id}><Row label={row.label} /></li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
});

test('a wrapper around a projecting component ships neither half', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ children }) @{
	<span>{children}</span>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={row.id}><Row><b>{row.label}</b></Row></li> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowTemplate');
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

// Fail closed on the unknowable: with no interface for the child's module, this
// compile cannot tell whether the child branches, and a guess would mint a row
// that indexes into another row's anchors at click time.
test('a component row whose module published no interface ships no identity', async () => {
	const view = await viewOf(importingApp);
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

// A branch inside the row component anchors into a census the page counted once,
// at boot, for the rows it served. A row born after resume has no counted
// anchors, so the mint is withheld and the page keeps today's no-growth
// behaviour instead of indexing into another row's anchors.
const branchingRow = `import { state } from '@markless/core';
function Row({ item }) @{
	let open = state(false);
	<li onClick={() => open = !open}>@if (open) { <b>{item.label}</b> }</li>
}
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`;

test('a row component whose body branches ships no identity', async () => {
	const view = await viewOf(branchingRow);
	const repeat = view.keyedRepeats?.[0];
	expect(repeat).toBeDefined();
	expect(repeat).not.toHaveProperty('rowComponent');
	expect(repeat).not.toHaveProperty('rowTemplate');
});

// The twin: same row, same component, no branch in the body - the field still
// ships, so the gate only ever withholds.
test('the plain twin of a branching row component still ships its identity', async () => {
	const view = await viewOf(sameModuleRow);
	expect(view.keyedRepeats?.[0]?.rowComponent?.componentName).toBe('App');
});

test('a row component whose body switches ships no identity', async () => {
	const view = await viewOf(`import { state } from '@markless/core';
function Row({ item }) @{
	<li>@switch (item.kind) { @case 'a': { <b>a</b> } @default: { <i>b</i> } }</li>
}
export function App() @{
	let rows = state([{ id: 'a', kind: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

test('a row component whose body opens a boundary ships no identity', async () => {
	const view = await viewOf(`import { computed, state } from '@markless/core';
function Row({ item }) @{
	const details = computed(async () => ({ title: item.id }));
	<li>@try { <b>{details.title}</b> } @catch { <i>failed</i> }</li>
}
export function App() @{
	let rows = state([{ id: 'a' }]);
	<ul>@for (const row of rows; key row.id) { <Row item={row} /> }</ul>
}
`);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
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

/**
 * A row whose component lives in another file mints on the same terms as a
 * local one.
 *
 * Nothing about the mint is same-module: the record names the OWNER component
 * and the edge inside it, and the row render walks that owner's import chain to
 * reach the child. What the owner's compile cannot see is the child's markup, so
 * the one question it must still answer - does the child branch or open a
 * boundary - is answered off the interface the child's module published.
 */
const plainImportedRow = `export function Row({ item }) @{
	<li>{item.label}</li>
}
`;

test('an imported component row ships the edge and the owning component', async () => {
	const view = await viewOfImportedRow(plainImportedRow, importingApp);
	const repeat = view.keyedRepeats?.[0];
	expect(repeat).not.toHaveProperty('rowTemplate');
	// The owner, not the child: the row render looks the child up through this
	// component's own edge, which is what carries the import.
	expect(repeat?.rowComponent?.componentName).toBe('App');
	expect(repeat?.rowComponent?.itemPropName).toBe('item');
	expect(typeof repeat?.rowComponent?.componentEdgeId).toBe('string');
	expect(Object.keys(repeat!.rowComponent!).sort()).toEqual([
		'componentEdgeId',
		'componentName',
		'itemPropName',
	]);
});

test('an imported component inside a row wrapper ships both halves', async () => {
	const view = await viewOfImportedRow(
		`export function Row({ label }) @{
	<span>{label}</span>
}
`,
		`import { state } from '@markless/core';
import { Row } from './row.tsrx';
export function App() @{
	let rows = state([{ id: 'a', label: 'A' }]);
	<ul>@for (const row of rows; key row.id) { <li data-row={row.id}><Row label={row.label} /></li> }</ul>
}
`,
	);
	const repeat = view.keyedRepeats?.[0];
	expect(repeat?.rowTemplate?.html).toContain('<li');
	expect(repeat?.rowComponent?.componentName).toBe('App');
	expect(repeat?.rowComponent?.slotPath).toEqual([0, 0]);
});

// Both arms render one element, so the interface's element count agrees on a
// number: the branch is caught by the arm chunks the interface lists, which is
// the fact that has to carry this case rather than the count.
const branchingImportedRow = `export function Row({ item }) @{
	<li>@if (item.on) { <b>{item.label}</b> } @else { <i>{item.label}</i> }</li>
}
`;

test('an imported component whose body branches ships no identity', async () => {
	const child = await buildSemanticGraph({
		filename: 'src/row.tsrx',
		source: branchingImportedRow,
	});
	const entry = child.moduleGraphInterface.render.components[0];
	expect(entry?.elementCount).toBe(2);
	expect(entry?.childChunks.map((chunk) => chunk.kind)).toEqual(['branch-arm', 'branch-arm']);

	const view = await viewOfImportedRow(branchingImportedRow, importingApp);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

test('an imported component whose body opens a boundary ships no identity', async () => {
	const view = await viewOfImportedRow(
		`import { computed } from '@markless/core';
export function Row({ item }) @{
	const details = computed(async () => ({ title: item.id }));
	<li>@try { <b>{details.title}</b> } @catch { <i>failed</i> }</li>
}
`,
		importingApp,
	);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

// A count render time decides - here a nested @for - never resolves to a number,
// so the interface answers "unknown" and the row refuses on that alone.
test('an imported component whose element count is unknown ships no identity', async () => {
	const view = await viewOfImportedRow(
		`export function Row({ item }) @{
	<li>@for (const tag of item.tags; key tag.id) { <b>{tag.name}</b> }</li>
}
`,
		importingApp,
	);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});

// The interface publishes chunk kinds per component but never says which
// components a given one reaches, so a branch anywhere in the child's module
// refuses the row. Lifting this needs the interface to carry each component's
// own transitive construct answer instead of a per-component chunk list.
test('a branch elsewhere in the imported module refuses the row', async () => {
	const view = await viewOfImportedRow(
		`export function Row({ item }) @{
	<li>{item.label}</li>
}
export function Other({ item }) @{
	<p>@if (item.on) { <b>x</b> } @else { <i>y</i> }</p>
}
`,
		importingApp,
	);
	expect(view.keyedRepeats?.[0]).not.toHaveProperty('rowComponent');
});
