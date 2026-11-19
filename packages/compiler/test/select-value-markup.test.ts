import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { createNativeViewPayload, NATIVE_FACT_COLLECTORS } from '../src/native.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

async function chunks(markup: string) {
	const result = await compileTsrxModule({
		filename: 'src/Order.tsrx',
		source: `
import { state } from '@markless/core';

export default function Order() @{
	let size = state('m');
	const sizes = state([{ id: 's', label: 'Small' }, { id: 'm', label: 'Medium' }]);
	const names = state(['Red', 'Blue']);

	<main>${markup}</main>
}
`,
		symbols: [],
	});
	return result.semanticGraph.markup.chunks;
}

const template = async (markup: string) =>
	(await chunks(markup)).find((chunk) => chunk.kind === 'template')!;
const row = async (markup: string) =>
	(await chunks(markup)).find((chunk) => chunk.kind === 'repeat-row')!;
const sizeRead = { kind: 'graph-read', graphNodeId: 'state:size', path: [] };

test('each static option of a bound select is marked selected when the select value names it', async () => {
	const chunk = await template(
		'<select value={size}><option value="s">Small</option><optgroup label="Big"><option value="m">Medium</option></optgroup></select>',
	);
	expect(chunk.statics.join('|')).toBe(
		'<main><select|><option value="s"|>Small</option><optgroup label="Big"><option value="m"|>Medium</option></optgroup></select></main>',
	);
	expect(chunk.slots.filter((slot) => slot.kind === 'selected-option')).toEqual([
		expect.objectContaining({ residue: sizeRead, equals: 's' }),
		expect.objectContaining({ residue: sizeRead, equals: 'm' }),
	]);
});

test('an option without a value attribute is named by its text, whitespace collapsed', async () => {
	const chunk = await template(
		'<select value={size}><option>  Extra\n\t large </option><option label="L" /></select>',
	);
	expect(chunk.slots.filter((slot) => slot.kind === 'selected-option')).toEqual([
		expect.objectContaining({ equals: 'Extra large' }),
		expect.objectContaining({ equals: '' }),
	]);
});

test('options from a @for are named by the row value or the row text', async () => {
	const byValue = await row(
		'<select value={size}>@for (const option of sizes; key option.id) {<option value={option.id}>{option.label}</option>}</select>',
	);
	expect(byValue.slots.filter((slot) => slot.kind === 'selected-option')).toEqual([
		expect.objectContaining({
			residue: sizeRead,
			equals: expect.objectContaining({ kind: 'repeat-item', path: ['id'] }),
		}),
	]);
	const byText = await row(
		'<select value={size}>@for (const name of names; key name) {<option>{name}</option>}</select>',
	);
	expect(byText.slots.filter((slot) => slot.kind === 'selected-option')).toEqual([
		expect.objectContaining({
			equals: expect.objectContaining({ kind: 'repeat-item', path: [] }),
		}),
	]);
});

test('a literal select value marks its option in the statics', async () => {
	const chunk = await template(
		'<select value="b"><option value="a">A</option><option value="b">B</option></select>',
	);
	expect(chunk.statics.join('|')).toBe(
		'<main><select value="b"><option value="a">A</option><option value="b" selected="">B</option></select></main>',
	);
	expect(chunk.slots).toEqual([]);
});

test('an option the author marked, or outside a valued select, is left as written', async () => {
	const authored = await template(
		'<select value={size}><option value="s" selected>Small</option></select>',
	);
	expect(authored.slots.filter((slot) => slot.kind === 'selected-option')).toEqual([]);
	const unvalued = await template('<select><option value="s">Small</option></select>');
	expect(unvalued.slots).toEqual([]);
});

test('a literal select value with options from a @for compares each row value to it', async () => {
	const chunk = await row(
		'<select value="m">@for (const option of sizes; key option.id) {<option value={option.id}>{option.label}</option>}</select>',
	);
	expect(chunk.slots.filter((slot) => slot.kind === 'selected-option')).toEqual([
		expect.objectContaining({
			residue: expect.objectContaining({ kind: 'repeat-item', path: ['id'] }),
			equals: 'm',
		}),
	]);
});

test('a phone build refuses a select and its options by element, as before', async () => {
	const source = `import { state } from '@markless/core';
export function Page() @{
	let size = state('m');
	<main>
		<select value={size}><option value="s">Small</option><option value="m">Medium</option></select>
	</main>
}
`;
	const { payload, diagnostics } = createNativeViewPayload(
		await buildSemanticGraph({ filename: 'src/App.tsrx', source, nativeFacts: NATIVE_FACT_COLLECTORS }),
		{ readSource: (file) => (file === 'src/App.tsrx' ? source : undefined) },
	);
	expect(payload).toBeNull();
	expect(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.message])).toEqual([
		['MARKLESS_NATIVE_ELEMENT', 'the <select> element has no native view yet'],
		['MARKLESS_NATIVE_ELEMENT', 'the <option> element has no native view yet'],
		['MARKLESS_NATIVE_ELEMENT', 'the <option> element has no native view yet'],
	]);
});
