import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE } from '../src/passes/public-render/diagnostics.ts';
import { repeatLocalSource } from '../src/passes/public-render/residue-reader.ts';

async function repeats(source: string) {
	const result = await compileTsrxModule({ filename: '/rows/page.tsrx', source, symbols: [] });
	return result.protocolView.keyedRepeats ?? [];
}

// A row slot reading state outside the @for ships in the row template with its reads,
// which is what keeps served and minted rows current after the state is written.
test('a class computed from outer state ships as a row slot naming its read', async () => {
	for (const [list, item, pick, on, off] of [
		['rows', 'row', 'selected', 'on', 'off'],
		['entries', 'entry', 'chosen', 'picked', 'plain'],
	] as const) {
		const [repeat] = await repeats(`
import { state } from '@markless/core';
export default function Page() @{
	let ${list} = state([{ id: 1 }]);
	let ${pick} = state(0);
	<ul>
		@for (const ${item} of ${list}; key ${item}.id) {
			<li class={${pick} === ${item}.id ? '${on}' : '${off}'}>{${item}.id}</li>
		}
	</ul>
}`);
		expect(repeat?.rowTemplate?.attributeSlots).toEqual([
			{
				path: [0],
				name: 'class',
				source: `${pick} === ${item}.id ? '${on}' : '${off}'`,
				reads: [{ graphNodeId: `state:${pick}`, path: [] }],
			},
		]);
	}
});

test('a string style over outer state ships like class, a style object refuses precisely', async () => {
	for (const [list, item, tone] of [
		['rows', 'row', 'tone'],
		['swatches', 'swatch', 'accent'],
	] as const) {
		const [styled] = await repeats(`
import { state } from '@markless/core';
export default function Page() @{
	let ${list} = state([{ id: 1, hue: 'red' }]);
	let ${tone} = state('red');
	<ul>
		@for (const ${item} of ${list}; key ${item}.id) {
			<li style={${tone} === 'red' ? 'color: red' : 'color: blue'} title={\`\${${tone}}-\${${item}.hue}\`}>{${item}.id}</li>
		}
	</ul>
}`);
		expect(styled?.rowTemplate?.attributeSlots).toEqual([
			{
				path: [0],
				name: 'style',
				source: `${tone} === 'red' ? 'color: red' : 'color: blue'`,
				reads: [{ graphNodeId: `state:${tone}`, path: [] }],
			},
			{
				path: [0],
				name: 'title',
				source: `\`\${${tone}}-\${${item}.hue}\``,
				reads: [{ graphNodeId: `state:${tone}`, path: [] }],
			},
		]);
	}
	const compiled = await compileTsrxModule({
		filename: '/rows/page.tsrx',
		source: `
import { state } from '@markless/core';
export default function Page() @{
	let rows = state([{ id: 1 }]);
	let tone = state('red');
	<ul>
		@for (const row of rows; key row.id) {
			<li style={{ color: tone }}>{row.id}</li>
		}
	</ul>
}`,
		symbols: [],
	});
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate).toBeUndefined();
	const warnings = compiled.publicRenderPlan.diagnostics.filter(
		(entry) => entry.code === KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE,
	);
	expect(warnings.map((entry) => entry.message)).toEqual([
		expect.stringContaining('sets style from a style object that reads page state'),
	]);
});

test('a prop read ships with the prop it reads, destructured or through the props object', async () => {
	for (const [param, read, prop] of [
		['{ picked, rows }', 'picked', 'picked'],
		['props', 'props.chosen', 'chosen'],
	] as const) {
		const [propped] = await repeats(`
import { state } from '@markless/core';
function List(${param}) @{
	<ul>
		@for (const row of ${param === 'props' ? 'props.rows' : 'rows'}; key row.id) {
			<li class={${read} === row.id ? 'on' : 'off'}>{row.id}</li>
		}
	</ul>
}
export default function Page() @{
	let ${prop} = state(0);
	let rows = state([{ id: 1 }]);
	<List ${prop}={${prop}} rows={rows} />
}`);
		expect(propped?.rowTemplate?.attributeSlots).toEqual([
			{
				path: [0],
				name: 'class',
				source: `${read} === row.id ? 'on' : 'off'`,
				reads: [{ graphNodeId: 'prop:props', path: [prop] }],
			},
		]);
	}
});

test('a row holding a nested @for whose rows read outer state still ships its template', async () => {
	const [outer, inner] = await repeats(`
import { state } from '@markless/core';
export default function Page() @{
	let picked = state('x');
	let lanes = state([{ id: 'x', cells: [{ id: 'x1', lane: 'x' }] }]);
	<div>
		@for (const lane of lanes; key lane.id) {
			<section class={picked === lane.id ? 'lit' : 'dim'}>
				<ol>
					@for (const cell of lane.cells; key cell.id) {
						<li class={picked === cell.lane ? 'lit' : 'dim'}>{cell.id}</li>
					}
				</ol>
			</section>
		}
	</div>
}`);
	expect(outer?.rowTemplate?.attributeSlots?.[0]).toMatchObject({
		name: 'class',
		reads: [{ graphNodeId: 'state:picked', path: [] }],
	});
	expect(inner?.rowTemplate?.attributeSlots?.[0]).toMatchObject({
		name: 'class',
		reads: [{ graphNodeId: 'state:picked', path: [] }],
	});
});

test('a row name binds the innermost row that declares it, by repeat', () => {
	const repeat = (id: string, itemName: string, extra: object = {}) =>
		({ id, itemName, ...extra }) as Parameters<typeof repeatLocalSource>[0][number];
	const repeats = [
		repeat('repeat:0', 'group', { indexName: 'at' }),
		repeat('repeat:1', 'entry', { enclosingRepeatId: 'repeat:0' }),
		repeat('repeat:2', 'entry'),
	];
	expect(repeatLocalSource(repeats, 'entry', 'repeatItem', 'ctx')).toBe('ctx.repeatItem');
	const group = repeatLocalSource(repeats, 'group', 'repeatItem', 'ctx');
	const at = repeatLocalSource(repeats, 'at', 'repeatIndex', 'ctx');
	const outer = { repeatId: 'repeat:0', repeatItem: 'g', repeatIndex: 4 };
	const read = (source: string, ctx: object) => new Function('ctx', `return ${source}`)(ctx);
	expect(read(group, { repeatId: 'repeat:1', repeatItem: 'e', repeatOuter: outer })).toBe('g');
	expect(
		read(at, { repeatId: 'repeat:1', repeatItem: 'e', repeatIndex: 0, repeatOuter: outer }),
	).toBe(4);
	expect(read(group, outer)).toBe('g');
	// A context no producer named a row for keeps the innermost read.
	expect(read(group, { repeatItem: 'plain' })).toBe('plain');
});
