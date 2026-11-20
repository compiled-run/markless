import { expect, test } from 'vitest';
import type { SemanticMarkupSlot } from '../src/artifacts.ts';
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
const selected = (chunk: { readonly slots: ReadonlyArray<SemanticMarkupSlot> }) =>
	chunk.slots.flatMap((slot) =>
		slot.kind === 'attribute' && slot.selectedOption
			? [slot.name, slot.residue.kind === 'authored-expression' ? slot.residue.source : slot.residue]
			: [],
	);

test('each static option of a bound select is marked selected when the select value names it', async () => {
	const chunk = await template(
		'<select value={size}><option value="s">Small</option><optgroup label="Big"><option value="m">Medium</option></optgroup></select>',
	);
	expect(chunk.statics.join('|')).toBe(
		'<main><select|><option value="s"|>Small</option><optgroup label="Big"><option value="m"|>Medium</option></optgroup></select></main>',
	);
	expect(selected(chunk)).toEqual([
		'selected',
		'String((size))===String("s")',
		'selected',
		'String((size))===String("m")',
	]);
});

test('an option without a value attribute is named by its text, whitespace collapsed', async () => {
	const chunk = await template(
		'<select value={size}><option>  Extra\n\t large </option><option label="L" /></select>',
	);
	expect(selected(chunk)).toEqual([
		'selected',
		'String((size))===String("Extra large")',
		'selected',
		'String((size))===String("")',
	]);
});

test('options from a @for are named by the row value or the row text', async () => {
	const byValue = await row(
		'<select value={size}>@for (const option of sizes; key option.id) {<option value={option.id}>{option.label}</option>}</select>',
	);
	expect(selected(byValue)).toEqual(['selected', 'String((size))===String((option.id))']);
	const byText = await row(
		'<select value={size}>@for (const name of names; key name) {<option>{name}</option>}</select>',
	);
	expect(selected(byText)).toEqual(['selected', 'String((size))===String((name))']);
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
	expect(selected(authored)).toEqual([]);
	const unvalued = await template('<select><option value="s">Small</option></select>');
	expect(unvalued.slots).toEqual([]);
});

test('a literal select value with options from a @for compares each row value to it', async () => {
	const chunk = await row(
		'<select value="m">@for (const option of sizes; key option.id) {<option value={option.id}>{option.label}</option>}</select>',
	);
	expect(selected(chunk)).toEqual(['selected', 'String("m")===String((option.id))']);
});

const phone = async (markup: string) => {
	const source = `import { state } from '@markless/core';
export function Page() @{
	let size = state('m');
	const sizes = state(['s', 'm']);
	<main>${markup}</main>
}
`;
	return createNativeViewPayload(
		await buildSemanticGraph({ filename: 'src/App.tsrx', source, nativeFacts: NATIVE_FACT_COLLECTORS }),
		{ readSource: (file) => (file === 'src/App.tsrx' ? source : undefined) },
	);
};

test('a phone build chooses a row option by the literal select value it compares as text', async () => {
	const { payload, diagnostics } = await phone(
		'<select value="m">@for (const s of sizes; key s) {<option value={s}>{s}</option>}</select>',
	);
	expect(diagnostics).toEqual([]);
	expect(payload!.nodes.find((node) => node.kind === 'element' && node.element === 'option')).toMatchObject({
		bindings: [
			{ attribute: 'value', value: { item: 'repeat:0' } },
			{
				property: 'selected',
				value: {
					binary: '===',
					left: { template: ['', { literal: 'm' }] },
					right: { template: ['', { item: 'repeat:0' }] },
				},
			},
		],
	});
});

test('a phone build refuses a bound select value by its own name, and nothing for the options', async () => {
	const { payload, diagnostics } = await phone(
		'<select value={size}><option value="s">Small</option><option value="m">Medium</option></select>',
	);
	expect(payload).toBeNull();
	expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
		'the <select> h1 binds `value`; a native build chooses an option through its `selected`',
	]);
});
