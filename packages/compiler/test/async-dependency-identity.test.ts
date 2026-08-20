import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * Computed dependencies are collected from the derive body. Which graph node an
 * identifier in that body names is a question about resolution, not about
 * spelling: a `const` the body declares itself shadows any graph binding of the
 * same name, so a use of it is a use of the local. Answering by name reports
 * such a body as a dependency cycle on itself.
 */
test('a const shadowing the computed name inside its own body is not a dependency cycle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Ledger.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Ledger() @{
	const rate = state(2);
	const total = computed(() => {
		const total = rate * 3;
		return total + 1;
	});

	<p>{total}</p>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);

	const total = result.semanticGraph.graphBindings.find(
		(binding) => binding.kind === 'computed' && binding.name === 'total',
	);
	expect(total).toBeDefined();
	expect((total?.dependencies ?? []).map((dependency) => dependency.graphNodeId)).toEqual([
		'state:rate',
	]);
});

test('a parameter shadowing the computed name inside its own body is not a dependency cycle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Basket.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Basket() @{
	const prices = state([1, 2, 3]);
	const subtotal = computed(() =>
		prices.reduce((subtotal, price) => subtotal + price, 0),
	);

	<p>{subtotal}</p>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);

	const subtotal = result.semanticGraph.graphBindings.find(
		(binding) => binding.kind === 'computed' && binding.name === 'subtotal',
	);
	expect(
		(subtotal?.dependencies ?? []).some((dependency) => dependency.graphNodeId === 'computed:subtotal'),
	).toBe(false);
});

test('a computed that really reads another computed still records the dependency', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Invoice.tsrx',
		source: `
import { computed, state } from '@markless/core';

export function Invoice() @{
	const rate = state(2);
	const total = computed(() => rate * 3);
	const withTax = computed(() => total * 1.2);

	<p>{withTax}</p>
}
`,
		symbols: [],
	});

	expect(result.semanticGraph.diagnostics).toEqual([]);

	const withTax = result.semanticGraph.graphBindings.find(
		(binding) => binding.kind === 'computed' && binding.name === 'withTax',
	);
	expect((withTax?.dependencies ?? []).map((dependency) => dependency.graphNodeId)).toEqual([
		'computed:total',
	]);
});

test('two computeds that really depend on each other are still a dependency cycle', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Loop.tsrx',
		source: `
import { computed } from '@markless/core';

export function Loop() @{
	const left = computed(() => right + 1);
	const right = computed(() => left + 1);

	<p>{left}</p>
}
`,
		symbols: [],
	});

	expect(
		result.semanticGraph.diagnostics.map((diagnostic) => diagnostic.code),
	).toContain('MARKLESS_COMPUTED_DEPENDENCY_CYCLE');
});
