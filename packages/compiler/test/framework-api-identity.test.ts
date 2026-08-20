import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

/**
 * These cases pin the two places the semantic-graph walk used to answer a
 * binding question by comparing identifier *names*: whether a bare `state()`
 * call is really a local function of that name, and whether a computed body
 * reads the very binding it defines. Both are now answered from yuku's
 * resolved symbols, so a same-named binding in another scope no longer
 * answers for the one at the call site.
 */

const outOfScopeShadowSource = `
export function Panel() @{
	let state = 1;

	<p>{state}</p>
}

export function Counter() @{
	let count = state(0);

	<p>{count}</p>
}
`;

const realShadowSource = `
function state(value) {
	return value;
}

export function Counter() @{
	let count = state(0);

	<p>{count}</p>
}
`;

const shadowingParameterSource = `
import { state, computed } from '@markless/core';

export function Cart() @{
	let prices = state([1, 2]);
	let label = computed(() => prices.map((label, index) => \`#\${index}\`).join(''));

	<p>{label}</p>
}
`;

const realCycleSource = `
import { state, computed } from '@markless/core';

export function Cart() @{
	let price = state(2);
	let label = computed(() => label + price);

	<p>{label}</p>
}
`;

const aliasedImportSource = `
import { state as s, computed as c } from '@markless/core';

export function Counter() @{
	let count = s(0);
	let double = c(() => count * 2);

	<p>{double}</p>
}
`;

test('a local named state in another component does not shadow a bare state() call', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Counter.tsrx',
		source: outOfScopeShadowSource,
	});

	const importRequired = graph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
	);
	expect(importRequired).toHaveLength(1);
	expect(importRequired[0]?.message).toBe('Cannot use state() until it is imported from markless.');
});

test('a module-scope function named state still shadows a bare state() call', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Counter.tsrx',
		source: realShadowSource,
	});

	const importRequired = graph.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_FRAMEWORK_IMPORT_REQUIRED',
	);
	expect(importRequired).toHaveLength(1);
	expect(importRequired[0]?.message).toContain('calls your local function `state`');
});

test('a callback parameter that shares the computed name is not a dependency cycle', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Cart.tsrx',
		source: shadowingParameterSource,
	});

	expect(
		graph.diagnostics.filter(
			(diagnostic) => diagnostic.code === 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE',
		),
	).toEqual([]);
	expect(graph.graphBindings.map((binding) => binding.name)).toContain('label');
});

test('a computed body that reads its own binding is still a dependency cycle', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Cart.tsrx',
		source: realCycleSource,
	});

	expect(
		graph.diagnostics
			.filter((diagnostic) => diagnostic.code === 'MARKLESS_COMPUTED_DEPENDENCY_CYCLE')
			.map((diagnostic) => diagnostic.message),
	).toEqual([
		'`computed(() => label + price)` reads `label` — the value it is defining. `label` cannot be derived from `label`.',
	]);
});

test('aliased framework API imports still create graph bindings', async () => {
	const graph = await buildSemanticGraph({
		filename: 'src/Counter.tsrx',
		source: aliasedImportSource,
	});

	expect(graph.diagnostics).toEqual([]);
	expect(graph.graphBindings.map((binding) => `${binding.kind}:${binding.name}`)).toEqual([
		'state:count',
		'computed:double',
	]);
});
