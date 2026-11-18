import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const ITEMS = `const ITEMS = [{ name: 'lyra' }, { name: 'maia' }, { name: 'nova' }];`;

const COMPUTED_ROWS = `
import { computed, state } from '@markless/core';
${ITEMS}
export function Page() @{
	let current = state('maia');
	const picked = computed(() => current.toUpperCase());
	<ul>
		@for (const item of ITEMS; key item.name) {
			<li data-checked={picked === item.name ? 'yes' : 'no'} onClick={() => current = item.name}>{item.name}</li>
		}
	</ul>
}
`;

const SHARED_ROWS = `
import { shared, state } from '@markless/core';
${ITEMS}
export const choice = shared(() => {
	const chosen = state({ name: 'maia' });
	return chosen;
});
function Rows() @{
	const chosen = choice();
	<ol>
		@for (const item of ITEMS; key item.name) {
			<li data-on={chosen.name === item.name ? 'on' : 'off'} onClick={() => chosen.name = item.name}>{item.name}</li>
		}
	</ol>
}
export function Page() @{
	<main><Rows /></main>
}
`;

const compile = (source: string) =>
	compileTsrxModule({ filename: 'src/RowSlots.tsrx', source, symbols: [] });

test('a computed only row slots read is served, so rows know what they painted', async () => {
	const compiled = await compile(COMPUTED_ROWS);
	const view = compiled.protocolView.keyedRepeats?.[0]?.rowTemplate;
	expect(view?.attributeSlots?.find((slot) => slot.name === 'data-checked')).toMatchObject({
		reads: [{ graphNodeId: 'computed:picked', path: [] }],
	});
	expect(compiled.publicRenderModule.ssrModuleSource).toMatch(
		/marklessSsrServeComputed\([^)]*"computed:picked"/,
	);
});

test('a row slot reading a shared() member follows that member’s graph node', async () => {
	const compiled = await compile(SHARED_ROWS);
	const slot = compiled.protocolView.keyedRepeats?.[0]?.rowTemplate?.attributeSlots?.find(
		(candidate) => candidate.name === 'data-on',
	);
	expect(slot).toMatchObject({
		source: "chosen.name === item.name ? 'on' : 'off'",
		reads: [{ graphNodeId: 'shared:src/RowSlots.tsrx#choice/state:chosen', path: ['name'] }],
	});
});

test('a same-module child seeds the shared() cell its row expression reads', async () => {
	const compiled = await compile(SHARED_ROWS);
	const ssr = compiled.publicRenderModule.ssrModuleSource;
	const childValues = /const marklessSsrStateValuesRows = new Map\(\[([^]*?)\]\);/.exec(ssr)?.[1];
	expect(childValues).toContain('"shared:src/RowSlots.tsrx#choice/state:chosen"');
});

const CONSTANT_ROWS_WITH_INNER_LISTS = (row: string) => `
import { state } from '@markless/core';
const ROWS = [{ key: 0, a: [{ key: 0 }], b: [{ key: 0 }] }, { key: 1, a: [{ key: 0 }], b: [{ key: 0 }] }];
const SHAPES = [[{ key: 0 }], [{ key: 0 }], [{ key: 0 }]];
export function Page() @{
	let lit = state(0);
	<div>
		<button onClick={() => (lit = lit + 1)}>go</button>
		<svg>
			@for (const row of ROWS; key row.key) {
				${row}
			}
		</svg>
	</div>
}
`;

const rowClassReads = async (row: string) =>
	(await compile(CONSTANT_ROWS_WITH_INNER_LISTS(row))).protocolView.keyedRepeats
		?.find((repeat) => repeat.id === 'repeat:0')
		?.rowTemplate?.attributeSlots?.find((slot) => slot.name === 'class')?.reads;

test('a row holding two sibling lists keeps the class slot that reads page state', async () => {
	expect(
		await rowClassReads(
			`<g class={lit > row.key ? 'on' : 'off'}>@for (const x of row.a; key x.key) {<path d="M0 0" />}@for (const y of row.b; key y.key) {<text>t</text>}</g>`,
		),
	).toEqual([{ graphNodeId: 'state:lit', path: [] }]);
});

test('a constant row holding a list only the server renders keeps the class slot that reads page state', async () => {
	expect(
		await rowClassReads(
			`<g class={lit > row.key ? 'on' : 'off'}><g>@for (const x of SHAPES[row.key + 1]!; key x.key) {<path d="M0 0" />}</g></g>`,
		),
	).toEqual([{ graphNodeId: 'state:lit', path: [] }]);
});

const rowTemplateOf = async (row: string) =>
	(await compile(CONSTANT_ROWS_WITH_INNER_LISTS(row))).protocolView.keyedRepeats?.find(
		(repeat) => repeat.id === 'repeat:0',
	)?.rowTemplate;

test('a row slot after an inner list is counted from the end of its parent', async () => {
	const template = await rowTemplateOf(
		`<g>@for (const x of row.a; key x.key) {<path d="M0 0" />}<text class={lit > row.key ? 'on' : 'off'}>t</text></g>`,
	);
	expect(template?.attributeSlots?.find((slot) => slot.name === 'class')).toMatchObject({
		path: [0, 1],
		fromEnd: [1],
	});
});

test('a row slot between two inner lists has no count, so the row ships no template', async () => {
	expect(
		await rowTemplateOf(
			`<g>@for (const x of row.a; key x.key) {<path d="M0 0" />}<text class={lit > row.key ? 'on' : 'off'}>t</text>@for (const y of row.b; key y.key) {<path d="M0 0" />}</g>`,
		),
	).toBeUndefined();
});

test('a row holding a list only the server renders ships no template when a text slot could force a rebuild', async () => {
	expect(
		await rowTemplateOf(
			`<g><g>@for (const x of SHAPES[row.key + 1]!; key x.key) {<path d="M0 0" />}</g><text>{lit > row.key ? 'on' : 'off'}</text></g>`,
		),
	).toBeUndefined();
});
