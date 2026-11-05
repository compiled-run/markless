import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A destructured @for loop name reads each of its names off one row item the compiler names.
async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/rows.tsrx', source, symbols: [] });
}

for (const [header, key, keyPath, aliases] of [
	[
		'[dish, n]',
		'dish',
		['0'],
		[
			['dish', ['0']],
			['n', ['1']],
		],
	],
	[
		'{ id, name: { first } }',
		'id',
		['id'],
		[
			['id', ['id']],
			['first', ['name', 'first']],
		],
	],
	[
		'{ code: label, tags: [lead] }',
		'label',
		['code'],
		[
			['label', ['code']],
			['lead', ['tags', '0']],
		],
	],
] as const)
	test(`@for (const ${header} ...; key ${key}) keys and reads the row through the item`, async () => {
		const result = await compile(`import { state } from '@markless/core';
export function Rows() @{
	let rows = state([] as any[]);
	<ul>@for (const ${header} of rows; key ${key}) { <li data-key={${key}}>{${aliases[1]![0]}}</li> }</ul>
}
`);
		expect(result.semanticGraph.diagnostics).toEqual([]);
		const [repeat] = result.semanticGraph.keyedRepeats;
		expect(repeat?.keyPath).toEqual(keyPath);
		expect(repeat?.itemAliases?.map((alias) => [alias.name, alias.path])).toEqual(aliases);
		expect(repeat?.itemPattern).toBe(header);
		const row = result.renderData.chunks.find((chunk) => chunk.kind === 'repeat-row')!;
		expect(
			row.slots.flatMap((slot) =>
				'residue' in slot && (slot.residue as { kind: string }).kind === 'repeat-item'
					? [(slot.residue as { path: ReadonlyArray<string> }).path]
					: [],
			),
		).toEqual([keyPath, aliases[1]![1]]);
	});

for (const header of ['{ id, name = "none" }', '[first, ...rest]', '{ [field]: value }'])
	test(`@for (const ${header} ...) is refused by name instead of rendering no rows`, async () => {
		const result = await compile(`import { state } from '@markless/core';
const field = 'id';
export function Rows() @{
	let rows = state([] as any[]);
	<ul>@for (const ${header} of rows; key rows.length) { <li>x</li> }</ul>
}
`);
		expect(result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'MARKLESS_REPEAT_ITEM_PATTERN_UNSUPPORTED',
		]);
	});
