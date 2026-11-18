import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A component body runs once. A plain local computed from state is a copy of
// that moment, and one object placed at two state paths updates only through
// the path that was written: a template that would show either is refused.

async function compile(body: string, markup: string) {
	return compileTsrxModule({
		filename: 'src/Copies.tsrx',
		source: `import { computed, state } from '@markless/core';

export function Copies() @{
	let basket = state([{ sku: 'a', qty: 1 }]);
	let owner = state({ name: 'Ada' });
	${body}
	<div>
		${markup}
		<button onClick={() => { basket.push({ sku: 'b', qty: 2 }); owner.name = 'Bo'; }}>go</button>
	</div>
}
`,
		symbols: [],
	});
}

function errors(result: Awaited<ReturnType<typeof compile>>) {
	return [...result.semanticGraph.diagnostics, ...result.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

test.each([
	[
		'const filled = basket.filter((line) => line.qty > 0);',
		'<output>{filled.length}</output>',
		'basket',
	],
	["const byName = new Map([['o', owner]]);", "<output>{byName.get('o').name}</output>", 'owner'],
	['const holder = { who: owner };', '<output>{holder.who.name}</output>', 'owner'],
	[
		"const count = basket.length; const word = count > 1 ? 'lines' : 'line';",
		'<output>{word}</output>',
		'count',
	],
])('a template read of a body copy of state is refused: %s', async (body, markup, source) => {
	const result = await compile(body, markup);

	expect(errors(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_TEMPLATE_READS_STATE_COPY',
			message: expect.stringContaining(`from the state "${source}"`),
		}),
	]);
});

test('a computed(), an alias of a state path and a constant are not copies', async () => {
	const result = await compile(
		"const filled = computed(() => basket.filter((line) => line.qty > 0)); const first = basket[0]; const label = 'Lines';",
		'<output>{filled.length}</output><output>{first.sku}</output><output>{label}</output>',
	);

	expect(errors(result)).toEqual([]);
});

test.each([
	[
		'a row body',
		'<ul>@for (const line of basket; key line.sku) { const many = line.qty > owner.name.length; <li aria-current={many}>{line.sku}</li> }</ul>',
	],
	[
		'an @if arm',
		"@if (basket.length > 0) { const word = basket.length > 1 ? 'lines' : 'line'; <output>{word}</output> }",
	],
])('a const in %s re-runs with that block, so reading it is not a copy', async (_, markup) => {
	const result = await compile('', markup);

	expect(errors(result)).toEqual([]);
});

test('a row const built from a body copy of state is still refused', async () => {
	const result = await compile(
		'const filled = basket.filter((line) => line.qty > 0);',
		'<ul>@for (const line of basket; key line.sku) { const shown = filled.length; <li>{shown}</li> }</ul>',
	);

	expect(errors(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_TEMPLATE_READS_STATE_COPY',
			message: expect.stringContaining('from the state "basket"'),
		}),
	]);
});

test('one object placed in state twice is refused at its second place', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Twice.tsrx',
		source: `import { state } from '@markless/core';

export function Twice() @{
	const common = { v: 1 };
	let pair = state({ left: common, right: common });
	let other = state({ copy: { ...common } });
	<output>{pair.right.v + other.copy.v}</output>
}
`,
		symbols: [],
	});

	expect(errors(result)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_STATE_SHARED_OBJECT',
			message: expect.stringContaining(
				'"common" is placed in state twice, at pair.left and pair.right',
			),
		}),
	]);
});
