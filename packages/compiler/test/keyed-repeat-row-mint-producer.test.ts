import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE } from '../src/passes/public-render/diagnostics.ts';

// The refusal that ships the diagnostic and the refusal that withholds the row
// mint are one function, so every warning here has a row that really cannot
// grow, and every silence here has a row the payload really can build.

async function compilePage(body: string) {
	return compileTsrxModule({
		filename: 'src/Rows.tsrx',
		source: `import { state } from '@markless/core';

function Cell({ label }) @{
	<span>{label}</span>
}

export function App() @{
	let rows = state([{ id: 'a', label: 'Alpha', cls: 'plain', on: true }]);
	let chosen = state('a');

	${body}
}
`,
		symbols: [],
	});
}

function rowMintWarnings(compiled: Awaited<ReturnType<typeof compilePage>>) {
	return compiled.publicRenderPlan.diagnostics
		.filter((entry) => entry.code === KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE)
		.map((entry) => [entry.severity, entry.message]);
}

function rowRecord(compiled: Awaited<ReturnType<typeof compilePage>>) {
	return compiled.protocolView.keyedRepeats?.[0];
}

// A read outside the item is a graph node the record can name, so it mints.
test('a row reading a cell outside the item mints and stays silent', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li>{chosen}{row.label}</li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([]);
	expect(rowRecord(compiled)?.rowTemplate?.textSlots).toEqual([
		{ path: [0, 0], graphNodeId: 'state:chosen', graphPath: [] },
		{ path: [0, 1], itemPath: ['label'] },
	]);
});

// What no record can name: a value only rendering produces. The clause names the
// read itself rather than its category.
test('a row whose value only rendering produces warns, naming the read', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li>{chosen.toUpperCase()}{row.label}</li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([
		['warning', expect.stringContaining('This @for row over row renders chosen.toUpperCase()')],
	]);
	expect(rowRecord(compiled)?.rowTemplate).toBeUndefined();
});

test('a row holding a construct warns that the list can never grow', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li>@if (row.on) { <em>on</em> } @else { <em>off</em> }</li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([
		['warning', expect.stringContaining('This @for row holds @if')],
	]);
	expect(rowRecord(compiled)?.rowTemplate).toBeUndefined();
});

test('a row whose element wraps a component stays silent - both halves ship', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li data-row={row.id}><Cell label={row.label} /></li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([]);
	// The wrapper is markup, the child is identity, and the path joins them: the
	// mint fills the wrapper's own attribute and drops the child on the marker.
	expect(rowRecord(compiled)?.rowTemplate?.attributeSlots).toEqual([
		expect.objectContaining({ name: 'data-row', itemPath: ['id'] }),
	]);
	expect(rowRecord(compiled)?.rowComponent).toEqual(
		expect.objectContaining({ componentName: 'App', slotPath: expect.any(Array) }),
	);
});

// The wrapper is minted from markup, so a wrapper slot markup cannot finish
// still refuses the whole row - the child's identity does not rescue it.
test('a wrapper whose value only rendering produces warns, component inside or not', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li data-row={chosen.toUpperCase()}><Cell label={row.label} /></li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([
		['warning', expect.stringContaining('This @for row renders <Cell>')],
	]);
	expect(rowRecord(compiled)?.rowComponent).toBeUndefined();
	expect(rowRecord(compiled)?.rowTemplate).toBeUndefined();
});

// A wrapper holding a construct is refused by the same clause for the same
// reason: its anchors were counted once, for the rows the page served.
test('a wrapper holding a branch around a component warns', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li>@if (row.on) { <em>on</em> }<Cell label={row.label} /></li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([
		['warning', expect.stringContaining('This @for row renders <Cell>')],
	]);
	expect(rowRecord(compiled)?.rowComponent).toBeUndefined();
	expect(rowRecord(compiled)?.rowTemplate).toBeUndefined();
});

test('a row that IS a same-module component stays silent - the payload names the component', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <Cell label={row.label} /> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([]);
	expect(rowRecord(compiled)?.rowComponent).toEqual(
		expect.objectContaining({ componentName: 'App' }),
	);
});

test('a row with an attribute read off the item stays silent - the row template fills it', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li class={row.cls}>{row.label}</li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([]);
	expect(rowRecord(compiled)?.rowTemplate?.attributeSlots).toEqual([
		expect.objectContaining({ name: 'class', itemPath: ['cls'] }),
	]);
});

test('a plain text row stays silent - the row template fills it', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li>{row.label}</li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([]);
	expect(rowRecord(compiled)?.rowTemplate?.textSlots).toEqual([
		expect.objectContaining({ itemPath: ['label'] }),
	]);
});
