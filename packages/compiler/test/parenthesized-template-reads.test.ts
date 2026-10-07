import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// Parentheses only group: an expression the compiler keeps current without them
// stays current with them, in text, attributes and child props alike.
async function compile(markup: string) {
	const result = await compileTsrxModule({
		filename: 'src/Page.tsrx',
		source: `import { state } from '@markless/core';
function Badge(props: { readonly label: string }) @{
	<i>{props.label}</i>
}
export default function Page() @{
	let mode = state('x');
	let count = state(0);
	let names = state(['a', 'b']);
	${markup}
}
`,
		symbols: [],
	});
	return result;
}

function derive(
	result: Awaited<ReturnType<typeof compile>>,
	graphNodeId: string | undefined,
	values: Record<string, unknown>,
) {
	const binding = result.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === graphNodeId,
	);
	const names = Object.keys(values);
	return new Function(...names, `return (${binding?.functionSource})();`)(
		...names.map((name) => values[name]),
	) as unknown;
}

test.each([
	{
		markup: `<p onClick={() => count++}>{(mode === 'x' ? 'text: ' : 'title: ') + count}</p>`,
		values: { mode: 'y', count: 2 },
		expected: 'title: 2',
	},
	{
		markup: `<p onClick={() => count++}>{(count + 1) * 2}</p>`,
		values: { count: 4 },
		expected: 10,
	},
	{
		markup: `<p onClick={() => count++}>{((mode))}</p>`,
		values: { mode: 'z' },
		expected: 'z',
	},
	{
		markup: `<p onClick={() => count++}>{(mode || 'none').toUpperCase()}</p>`,
		values: { mode: '' },
		expected: 'NONE',
	},
	{
		markup: `<p onClick={() => count++}>{(names.length > count && mode) + '!'}</p>`,
		values: { names: ['a', 'b'], count: 1, mode: 'x' },
		expected: 'x!',
	},
])('a grouped text expression gets one derive: $markup', async ({ markup, values, expected }) => {
	const result = await compile(markup);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const [update, ...rest] = result.protocolView.domUpdates.filter(
		(candidate) => candidate.target?.kind === 'text' && candidate.source !== 'props.label',
	);
	expect(rest).toEqual([]);
	expect(update?.graphNodeId).toMatch(/^computed:templateExpression:/);
	expect(derive(result, update?.graphNodeId, values)).toEqual(expected);
});

test('a grouped attribute value and a grouped child prop are kept current too', async () => {
	const result = await compile(`<section onClick={() => count++}>
		<p title={(count > 1 ? 'many' : 'few') + ' items'}>x</p>
		<Badge label={(mode === 'x' ? 'on' : 'off') + count} />
	</section>`);
	expect(result.semanticGraph.diagnostics).toEqual([]);
	const title = result.protocolView.domUpdates.find(
		(candidate) => candidate.target?.kind === 'attribute',
	);
	expect(derive(result, title?.graphNodeId, { count: 3 })).toBe('many items');
	const label = result.semanticGraph.componentEdges[0]?.props.find(
		(prop) => prop.name === 'label',
	);
	expect(label).toMatchObject({ kind: 'graph-reference', graphBindingKind: 'computed' });
	expect(
		derive(result, label && 'graphNodeId' in label ? label.graphNodeId : undefined, {
			mode: 'x',
			count: 5,
		}),
	).toBe('on5');
});
