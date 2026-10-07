import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Interpolations that render into one text node update as one joined text. A body
// `const` among them is recomputed from its definition, so a write to the reactive
// hole keeps the constant's text instead of replacing the whole node with its own value.
async function joinedTexts(body: string, params = '') {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
const MODULE_MARK = '#';
export default function Page(${params}) @{
${body}
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result.protocolView.domUpdates
		.filter((update) => update.target?.kind === 'text')
		.map((update) => {
			const binding = result.semanticGraph.graphBindings.find(
				(candidate) => candidate.id === update.graphNodeId,
			);
			return { update, binding };
		});
}

// Runs the joined text's derive with the graph values it reads.
function renderJoined(functionSource: string | undefined, values: Record<string, unknown>) {
	const names = Object.keys(values);
	return new Function('MODULE_MARK', ...names, `return (${functionSource})();`)(
		'#',
		...names.map((name) => values[name]),
	) as string;
}

test.each([
	{
		name: 'a const before the state hole',
		body: `const label = 'Clicks';
	let count = state(0);
	<button onClick={() => count++}>{label} {count}</button>`,
		values: { count: 1 },
		text: 'Clicks 1',
		local: 'label',
	},
	{
		name: 'a const after the state hole',
		body: `let score = state(3);
	const unit = 'pts';
	<p onClick={() => score++}>{score}: {unit}</p>`,
		values: { score: 4 },
		text: '4: pts',
		local: 'unit',
	},
	{
		name: 'consts on both sides with static text around them',
		body: `const left = 'L';
	const right = 'R';
	let middle = state('m');
	<p onClick={() => (middle = 'n')}>before {left}-{middle}-{right} after</p>`,
		values: { middle: 'n' },
		text: 'before L-n-R after',
		local: 'left',
	},
	{
		name: 'two state holes around a const',
		body: `const joiner = ' and ';
	let first = state(10);
	let second = state(0);
	<p onClick={() => { first++; second++; }}>{first}{joiner}{second}</p>`,
		values: { first: 11, second: 1 },
		text: '11 and 1',
		local: 'joiner',
	},
	{
		name: 'a const derived from a module value',
		body: `const marker = MODULE_MARK + 'tag';
	let hits = state(0);
	<span onClick={() => hits++}>{marker} {hits}</span>`,
		values: { hits: 2 },
		text: '#tag 2',
		local: 'marker',
	},
])('$name joins into one text that keeps the constant', async ({ body, values, text, local }) => {
	const texts = await joinedTexts(body);
	expect(texts).toHaveLength(1);
	const [{ update, binding }] = texts as [(typeof texts)[number]];
	expect(update.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(binding?.functionSource).not.toMatch(new RegExp(`\\b${local}\\b`));
	expect(renderJoined(binding?.functionSource, values)).toBe(text);
});

test('a const derived from props joins with a state ternary', async () => {
	const texts = await joinedTexts(
		`const heading = props.title.toUpperCase();
	let open = state(false);
	<button onClick={() => (open = !open)}>{heading} {open ? 'v' : '>'}</button>`,
		'props: { readonly title: string }',
	);
	expect(texts).toHaveLength(1);
	const [{ update, binding }] = texts as [(typeof texts)[number]];
	expect(update.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(binding?.dependencies?.map((dependency) => dependency.graphNodeId).sort()).toEqual([
		'prop:props',
		'state:open',
	]);
	expect(renderJoined(binding?.functionSource, { props: { title: 'Menu' }, open: true })).toBe(
		'MENU v',
	);
});

test('a joined run beside an element writes only its own text node', async () => {
	const texts = await joinedTexts(`const lead = 'Total';
	const tail = 'items';
	let total = state(1);
	<p onClick={() => total++}>{lead} <b>now</b> {total} {tail}</p>`);
	expect(texts).toHaveLength(1);
	const [{ update, binding }] = texts as [(typeof texts)[number]];
	expect(update.target).toEqual({ kind: 'text', textNode: -1 });
	expect(renderJoined(binding?.functionSource, { total: 5 })).toBe(' 5 items');
});
