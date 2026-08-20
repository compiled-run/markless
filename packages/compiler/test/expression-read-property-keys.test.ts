import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

/**
 * A static object-literal key names a field. It is not an expression, so it
 * reads nothing - exactly as `session.user` reads `session` and never a
 * standalone `user`. Only a computed key `{ [k]: v }` evaluates an expression,
 * and only then does its contents contribute reads.
 */
async function readSourcesFor(bodyLines: ReadonlyArray<string>): Promise<string[]> {
	const source = `${[
		"import { state, computed } from '@markless/core';",
		'',
		'export function App() @{',
		'	let count = state(0);',
		'',
		...bodyLines,
		'	<main><p>{label}</p></main>',
		'}',
	].join('\n')}\n`;
	const graph = await buildSemanticGraph({ filename: 'src/Keys.tsrx', source });
	expect(graph.diagnostics).toEqual([]);
	return graph.stateReads.map((read) => read.source);
}

test('a static object-literal key named like graph state contributes no read', async () => {
	const reads = await readSourcesFor(['	const label = computed(() => ({ count: 1 }));']);

	expect(reads).not.toContain('count');
});

test('a computed object-literal key still contributes the read it evaluates', async () => {
	const reads = await readSourcesFor(['	const label = computed(() => ({ [count]: 1 }));']);

	expect(reads).toContain('count');
});

test('shorthand property contributes exactly one read for its single identifier', async () => {
	// `{ count }` writes the name once and means one read, even though the key
	// and the value are the same identifier.
	const reads = await readSourcesFor(['	const label = computed(() => ({ count }));']);

	expect(reads.filter((read) => read === 'count')).toEqual(['count']);
});
