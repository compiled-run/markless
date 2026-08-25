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

test('a row reading a value that is not on the item warns that the list can never grow', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li>{chosen}{row.label}</li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([
		[
			'warning',
			expect.stringContaining('reads a value that is not a property of row'),
		],
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

test('a row whose component sits inside an element of its own warns: neither mint can finish it', async () => {
	const compiled = await compilePage(
		`<ul>@for (const row of rows; key row.id) { <li><Cell label={row.label} /></li> }</ul>`,
	);

	expect(rowMintWarnings(compiled)).toEqual([
		['warning', expect.stringContaining('This @for row renders <Cell>')],
	]);
	expect(rowRecord(compiled)?.rowComponent).toBeUndefined();
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
