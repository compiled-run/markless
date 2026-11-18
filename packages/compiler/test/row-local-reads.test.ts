import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';
import { expressionSlotValue } from '../src/passes/row-mint.ts';

const rows = (
	declarations: string,
	value: string,
) => `import { computed, state } from '@markless/core';
const ROWS = [{ key: 1, name: 'a' }, { key: 2, name: 'b' }];
export function Rows() @{
	let picked = state(1);
	const label = computed(() => 'n' + picked);
	${declarations}
	<main>
		<ul>
			@for (const row of ROWS; key row.key) {
				<li class={${value}}>{row.name}</li>
			}
		</ul>
		<button onClick={() => (picked = 2)}>pick</button>
	</main>
}
`;

async function rowValueReads(declarations: string, value: string) {
	const result = await compileTsrxModule({
		filename: 'src/Rows.tsrx',
		source: rows(declarations, value),
		symbols: [],
	});
	const graph = result.semanticGraph;
	const chunk = graph.markup.chunks.find((candidate) => candidate.id === 'repeat:repeat:0:row')!;
	const slot = chunk.slots.find((candidate) => candidate.kind === 'attribute')!;
	const read = expressionSlotValue(slot, graph, 'Rows', new Set(['row']));
	return {
		reads:
			read === null || !('source' in read)
				? read
				: (read.reads ?? []).map((entry) => entry.graphNodeId).sort(),
		codes: collectTsrxModuleDiagnostics(result).map((diagnostic) => diagnostic.code),
	};
}

test.each([
	[
		'a body helper',
		`const on = (row: { key: number }) => picked === row.key;`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
	[
		'a function declaration',
		`function on(row: { key: number }) { return picked === row.key; }`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
	[
		'a helper chain',
		`const current = () => picked;\n\tconst on = (row: { key: number }) => current() === row.key;`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
	[
		'a factory closure',
		`const make = () => (row: { key: number }) => picked === row.key;\n\tconst on = make();`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
	[
		'a helper reading a computed',
		`const tag = (row: { key: number }) => label + row.key;`,
		`tag(row)`,
		['computed:label'],
	],
	[
		'a helper beside a direct read',
		`const on = (row: { key: number }) => label + row.key;`,
		`on(row) + picked`,
		['computed:label', 'state:picked'],
	],
	[
		'a helper whose default parameter reads state',
		`const on = (row: { key: number }, at = picked) => at === row.key;`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
	[
		'a factory whose returned function has a default parameter reading state',
		`const make = () => (row: { key: number }, at = picked) => at === row.key;\n\tconst on = make();`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
	[
		'a helper naming a local spelled like the row item',
		`const row = () => picked;\n\tconst on = (item: { key: number }) => row() === item.key;`,
		`on(row) ? 'on' : 'off'`,
		['state:picked'],
	],
])(
	'a @for row value reading state through %s reads that state',
	async (_, declarations, value, expected) => {
		expect(await rowValueReads(declarations, value)).toEqual({ reads: expected, codes: [] });
	},
);

test('a helper that reads no state leaves the row value with no reads', async () => {
	expect(
		await rowValueReads(
			`const twice = (row: { key: number }) => row.key * 2;`,
			`'k' + twice(row)`,
		),
	).toEqual({
		reads: [],
		codes: [],
	});
});

test('a local with no definition to follow refuses the row value and says so', async () => {
	expect(await rowValueReads(`let mark: string;\n\tmark = 'x';`, `mark + row.name`)).toEqual({
		reads: null,
		codes: ['MARKLESS_ROW_VALUE_LOCAL_UNFOLLOWED'],
	});
});

test('a helper reads the state it closes over even when the row item shares that state\'s name', async () => {
	const source = rows('const on = (row: { key: number }) => picked === row.key;', "on(picked) ? 'on' : 'off'").replace(
		'@for (const row of ROWS; key row.key)',
		'@for (const picked of ROWS; key picked.key)',
	).replace('{row.name}', '{picked.name}');
	const result = await compileTsrxModule({ filename: 'src/Rows.tsrx', source, symbols: [] });
	expect(result.semanticGraph.rowLocalReads?.map((entry) => [entry.name, entry.reads.map((read) => read.graphNodeId)])).toEqual([
		['on', ['state:picked']],
	]);
});
