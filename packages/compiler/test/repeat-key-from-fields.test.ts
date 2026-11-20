import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A @for key joined from the row's own fields travels as pieces of text and item paths the browser joins per row.
async function compile(header: string, key: string, extra = '') {
	return compileTsrxModule({
		filename: 'src/rows.tsrx',
		symbols: [],
		source: `import { state } from '@markless/core';
export function Rows() @{
	let rows = state([] as any[]);
	let picked = state('');
	${extra}
	<ul>@for (const ${header} of rows; index n; key ${key}) { <li><button onClick={() => (picked = 'x')}>x</button></li> }</ul>
}
`,
	});
}

for (const [header, key, keyParts] of [
	['line', '`${line.id}:${line.size}`', [['id'], ':', ['size']]],
	['entry', "'#' + entry.sku + '/' + entry.variant.code", ['#', ['sku'], '/', ['variant', 'code']]],
	['cell', "cell.row + '-' + cell.col", [['row'], '-', ['col']]],
	['{ id, size }', '`${size}@${id}`', [['size'], '@', ['id']]],
	['[name, n2]', '`${name}` + n2', [['0'], ['1']]],
	['item', '`${item}`', [[]]],
	['row', "`<${row.a}` + '|' + `${row.b}>`", ['<', ['a'], '|', ['b'], '>']],
] as const)
	test(`key ${key} over (const ${header}) builds as text and item path pieces`, async () => {
		const result = await compile(header, key);
		expect(result.semanticGraph.diagnostics).toEqual([]);
		const [repeat] = result.semanticGraph.keyedRepeats;
		expect(repeat?.keyPath).toEqual([]);
		expect(repeat?.keyParts).toEqual(keyParts);
		expect(result.protocolView.keyedRepeats?.[0]?.keyParts).toEqual(keyParts);
		expect(result.renderData.repeats[0]).toMatchObject({ keyPath: [], keyParts });
		expect(result.renderData.repeats[0]).not.toHaveProperty('itemKey');
	});

test('a key that is one path on the item carries no key parts', async () => {
	const result = await compile('line', 'line.id');
	expect(result.semanticGraph.keyedRepeats[0]).not.toHaveProperty('keyParts');
	expect(result.protocolView.keyedRepeats?.[0]).not.toHaveProperty('keyParts');
	expect(result.renderData.repeats[0]).not.toHaveProperty('keyParts');
});

for (const [key, extra] of [
	['lineKey(line)', 'function lineKey(value: any) { return value.id; }'],
	['line.id + line.size', ''],
	['`${line.id}-${n}`', ''],
	['`${line.id}-${picked}`', ''],
	['`${line.id}-${line.tags.join()}`', ''],
	['`${line.id + line.size}`', ''],
] as const)
	test(`key ${key} is refused, naming the key forms that build`, async () => {
		const result = await compile('line', key, extra);
		expect(result.semanticGraph.keyedRepeats).toEqual([]);
		const [diagnostic] = result.semanticGraph.diagnostics;
		expect(diagnostic?.code).toBe('MARKLESS_REPEAT_KEY_UNSTABLE');
		expect(diagnostic?.message).toContain('`key line.id`');
		expect(diagnostic?.message).toContain('template literal');
		expect(diagnostic?.message).toContain('index i; key i');
	});
