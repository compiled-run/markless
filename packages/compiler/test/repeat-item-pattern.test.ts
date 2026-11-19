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

test('a key that computes from a destructured name is not read as a path', async () => {
	const result = await compile(`import { state } from '@markless/core';
export function Rows() @{
	let rows = state([] as any[]);
	<ul>@for (const { person } of rows; key person.id + 1) { <li>{person.id}</li> }</ul>
}
`);
	expect(result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_REPEAT_KEY_UNSTABLE',
	]);
});

// The row's item reaches a handler through context.locals under the compiler's item name; a destructured name is
// read at its path on that item, also when it is an argument to a function the component declares.
for (const [header, key, handler, item, args] of [
	['[face, n]', 'face', 'takeBack(face)', ['up', 2], ['up']],
	['[face, n]', 'face', 'picked.push(n)', ['up', 2], [2]],
	['[face, n]', 'face', 'takeBack(face + n)', ['up', 2], ['up2']],
	['{ id, name: { first } }', 'id', 'takeBack(first)', { id: 'a', name: { first: 'Ada' } }, ['Ada']],
	['{ code: label }', 'label', 'picked.push(label.length)', { code: 'abc' }, [3]],
] as const)
	test(`a handler in @for (const ${header} ...) given ${handler} reads the row's own values`, async () => {
		const result = await compile(`import { state } from '@markless/core';
export function Rows() @{
	let rows = state([] as any[]);
	let picked = state([] as unknown[]);
	function takeBack(value: unknown) {
		picked.push(value);
	}
	<ul>@for (const ${header} of rows; key ${key}) { <li><button onClick={() => ${handler}}>x</button></li> }</ul>
}
`);
		expect(result.symbolModules.diagnostics).toEqual([]);
		const [repeat] = result.semanticGraph.keyedRepeats;
		const module = result.symbolModules.modules.find((candidate) => candidate.kind === 'event-handler')!;
		const loaded = await import(`data:text/javascript;base64,${Buffer.from(module.source).toString('base64')}`);
		const calls: unknown[] = [];
		(Object.values(loaded)[0] as (context: unknown) => unknown)({
			locals: { [repeat!.itemName]: item },
			graph: { read: () => [], call: (call: { args: unknown[] }) => calls.push(call.args) },
		});
		expect(calls).toEqual([args]);
	});
