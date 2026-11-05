import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import {
	KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE,
	KEYED_REPEAT_ROW_VALUE_UNPAINTED_CODE,
} from '../src/passes/public-render/diagnostics.ts';

// A @for row that reads page state but ships no row template keeps its served value forever, so the compiler says so instead.

async function compile(source: string) {
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	return {
		compiled,
		errors: compiled.publicRenderPlan.diagnostics
			.filter((entry) => entry.code === KEYED_REPEAT_ROW_VALUE_UNPAINTED_CODE)
			.map((entry) => [entry.severity, entry.message]),
	};
}

const between = (middle: string) => `
import { state } from '@markless/core';
const ROWS = [{ id: 'a', left: ['l1'], right: ['r1'] }, { id: 'b', left: ['l2'], right: ['r2'] }];
export function Page() @{
	let picked = state('a');
	<section>
		<button onClick={() => (picked = 'b')}>pick</button>
		@for (const row of ROWS; key row.id) {
			<div>
				@for (const a of row.left; key a) {
					<i>{a}</i>
				}
				${middle}
				@for (const c of row.right; key c) {
					<u>{c}</u>
				}
			</div>
		}
	</section>
}
`;

const servedOnly = (collection: string, row: string) => `
import { computed, state } from '@markless/core';
const ART = { a: { paths: [{ key: 1, d: 'M0' }] }, b: { paths: [{ key: 2, d: 'M1' }] } };
export function Page() @{
	let rows = state([{ id: 'a' }, { id: 'b' }]);
	const fixed = computed(() => [{ id: 'a' }, { id: 'b' }]);
	let picked = state('a');
	<section>
		<button onClick={() => (picked = 'b')}>pick</button>
		<ul>
			@for (const row of ${collection}; key row.id) {
				${row}
			}
		</ul>
	</section>
}
`;

test('a row value between two nested lists in one element that reads state is an error', async () => {
	const { compiled, errors } = await compile(
		between(`<b class={picked === row.id ? 'on' : 'off'}>x</b>`),
	);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate).toBeUndefined();
	expect(errors).toHaveLength(1);
	expect(errors[0]![0]).toBe('error');
	expect(errors[0]![1]).toContain("picked === row.id ? 'on' : 'off'");
	expect(errors[0]![1]).toContain('between two nested @for lists');
});

test('a row value between two nested lists that reads only the row item is no error', async () => {
	const { errors } = await compile(between(`<b class={row.id}>x</b>`));
	expect(errors).toEqual([]);
});

test('a row value after one nested list still patches, so it is no error', async () => {
	const { compiled, errors } = await compile(
		between(`<b class={picked === row.id ? 'on' : 'off'}>x</b>`).replace(
			/@for \(const c of row\.right; key c\) \{\s*<u>\{c\}<\/u>\s*\}/,
			'',
		),
	);
	expect(errors).toEqual([]);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate?.attributeSlots?.[0]).toMatchObject(
		{
			name: 'class',
			fromEnd: [1],
		},
	);
});

test('a state list whose rows hold a list only the server renders, and read state, is an error', async () => {
	const { compiled, errors } = await compile(
		servedOnly(
			'rows',
			`<li class={picked === row.id ? 'on' : 'off'}>
				@for (const p of ART[row.id].paths; key p.key) {
					<span>{p.d}</span>
				}
			</li>`,
		),
	);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate).toBeUndefined();
	expect(errors).toHaveLength(1);
	expect(errors[0]![0]).toBe('error');
	expect(errors[0]![1]).toContain('ART[row.id].paths');
});

test('a list that never gains rows patches rows holding server-only lists in place, so it is no error', async () => {
	const { compiled, errors } = await compile(
		servedOnly(
			'fixed',
			`<li class={picked === row.id ? 'on' : 'off'}>
				@for (const p of ART[row.id].paths; key p.key) {
					<span>{p.d}</span>
				}
			</li>`,
		),
	);
	expect(errors).toEqual([]);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate?.attributeSlots).toHaveLength(1);
});

test('a list that never gains rows, holding server-only rows and text reading state, is an error', async () => {
	const { compiled, errors } = await compile(
		servedOnly(
			'fixed',
			`<li>
				<b>{picked === row.id ? 'on' : 'off'}</b>
				@for (const p of ART[row.id].paths; key p.key) {
					<span>{p.d}</span>
				}
			</li>`,
		),
	);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate).toBeUndefined();
	expect(errors).toHaveLength(1);
});

test('a state list whose row has a value between two nested lists says it can never grow', async () => {
	const source = between(`<b class={row.id}>x</b>`)
		.replace('const ROWS = [', 'const START = [')
		.replace(
			"let picked = state('a');",
			"let picked = state('a');\n\tlet ROWS = state(START);",
		);
	const compiled = await compileTsrxModule({ filename: 'src/Page.tsrx', source, symbols: [] });
	const growth = compiled.publicRenderPlan.diagnostics.filter(
		(entry) => entry.code === KEYED_REPEAT_ROW_MINT_UNSUPPORTED_CODE,
	);
	expect(growth.map((entry) => entry.message)).toEqual([
		expect.stringContaining('between two nested @for lists'),
	]);
});

test('an item-only value between two nested lists leaves the rest of the row without a template, so a state read elsewhere in it is an error', async () => {
	const { compiled, errors } = await compile(
		between(`<b class={row.id}>x</b>`).replace(
			'<div>',
			"<div class={picked === row.id ? 'on' : 'off'}>",
		),
	);
	expect(compiled.protocolView.keyedRepeats?.[0]?.rowTemplate).toBeUndefined();
	expect(errors).toHaveLength(1);
	expect(errors[0]![1]).toContain("picked === row.id ? 'on' : 'off'");
});
