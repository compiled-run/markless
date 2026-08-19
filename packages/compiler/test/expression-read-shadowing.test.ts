import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

/**
 * An identifier contributes a graph read only when it actually refers to the
 * graph binding. A binding declared inside the expression being collected
 * refers to itself, whatever it is named, so it contributes nothing.
 *
 * These cases pin the resolution rules a set of shadowed names cannot state
 * and a resolved-reference view can: lexical block scoping, `var` hoisting to
 * the enclosing function, sibling scopes that never overlap, and the root of a
 * call chain.
 */
async function readSourcesFor(bodyLines: ReadonlyArray<string>): Promise<string[]> {
	const source = `${[
		"import { state, computed } from '@markless/core';",
		'',
		'export function App() @{',
		'	let count = state(0);',
		'	let total = state(0);',
		'',
		...bodyLines,
		'	<main><p>{label}</p></main>',
		'}',
	].join('\n')}\n`;
	const graph = await buildSemanticGraph({ filename: 'src/Shadow.tsrx', source });
	expect(graph.diagnostics).toEqual([]);
	return graph.stateReads.map((read) => read.source);
}

test('a derive parameter named like graph state contributes no read', async () => {
	const reads = await readSourcesFor(['	const label = computed((count) => count + 1);']);

	expect(reads).not.toContain('count');
});

test('a block-scoped declaration inside the derive shadows graph state of the same name', async () => {
	const reads = await readSourcesFor([
		'	const label = computed(() => { const count = 2; return count + 1; });',
	]);

	expect(reads).not.toContain('count');
});

test('a var declared in a nested block shadows across the whole derive body', async () => {
	// `var` hoists to the arrow's body, so the earlier `count` is that local and
	// not the graph cell, even though the declaration is written later and
	// deeper. `total` has no such local and stays a graph read.
	const reads = await readSourcesFor([
		'	const label = computed(() => {',
		'		const seen = count;',
		'		if (total) { var count = 7; }',
		'		return seen;',
		'	});',
	]);

	expect(reads).not.toContain('count');
	expect(reads).toContain('total');
});

test('a declaration in a sibling block does not shadow a read outside that block', async () => {
	// The nested `const count` is out of scope at `const seen = count`, so that
	// read is the graph cell; the one inside the block is the local.
	const reads = await readSourcesFor([
		'	const label = computed(() => {',
		'		const seen = count;',
		'		{',
		'			const count = 7;',
		'			if (count) return 0;',
		'		}',
		'		return seen;',
		'	});',
	]);

	expect(reads.filter((read) => read === 'count')).toEqual(['count']);
});

test('a catch parameter shadows graph state inside the catch body', async () => {
	const reads = await readSourcesFor([
		'	const label = computed(() => {',
		'		try { return 1; } catch (count) { return count; }',
		'	});',
	]);

	expect(reads).not.toContain('count');
});

test('a local function shadows graph state at the root of a call chain read', async () => {
	const reads = await readSourcesFor([
		'	const label = computed(() => {',
		'		function count() { return { value: 1 }; }',
		'		return count().value;',
		'	});',
	]);

	expect(reads).not.toContain('count().value');
});

test('an unshadowed graph identifier still contributes its read', async () => {
	const reads = await readSourcesFor(['	const label = computed(() => count + 1);']);

	expect(reads).toContain('count');
});

test('a name declared outside the collected expression is still read', async () => {
	// `step` is declared in the component body, not inside the derive, so the
	// derive's reference to it resolves outward and stays a read.
	const reads = await readSourcesFor([
		'	const step = 2;',
		'	const label = computed(() => count + step);',
	]);

	expect(reads).toContain('step');
});
