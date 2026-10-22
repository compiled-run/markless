import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// One expression that combines state with a body `const` stays current: the const is
// recomputed from its definition inside the derive that stands behind the expression.
async function compile(body: string) {
	const result = await compileTsrxModule({
		filename: 'src/Cart.tsrx',
		source: `import { state } from '@markless/core';
const PRICES = { small: 14, large: 20 };
export default function Cart() @{
${body}
}
`,
		symbols: [],
	});
	expect(result.semanticGraph.diagnostics).toEqual([]);
	return result;
}

function derive(functionSource: string | undefined, values: Record<string, unknown>) {
	const names = Object.keys(values);
	return new Function('PRICES', ...names, `return (${functionSource})();`)(
		{ small: 14, large: 20 },
		...names.map((name) => values[name]),
	) as unknown;
}

test.each([
	{
		name: 'text multiplying state by a literal const',
		body: `let bags = state(2);
	const price = 14;
	<p onClick={() => bags++}>{bags * price}</p>`,
		target: 'text',
		values: { bags: 3 },
		value: 42,
	},
	{
		name: 'an attribute reading a const built from a module value',
		body: `let cups = state(1);
	const unit = PRICES.large;
	const label = 'cost';
	<button title={label + ': ' + cups * unit} onClick={() => cups++}>add</button>`,
		target: 'attribute',
		values: { cups: 2 },
		value: 'cost: 40',
	},
])('$name updates from its state read', async ({ body, target, values, value }) => {
	const result = await compile(body);
	const updates = result.protocolView.domUpdates.filter(
		(update) => update.target?.kind === target,
	);
	expect(updates).toHaveLength(1);
	const binding = result.semanticGraph.graphBindings.find(
		(candidate) => candidate.id === updates[0]!.graphNodeId,
	);
	expect(binding?.kind).toBe('computed');
	expect(derive(binding?.functionSource, values)).toBe(value);
});
