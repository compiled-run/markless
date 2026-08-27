import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

/**
 * A `shared()` factory's return IS its cell set. The wrapper object every shipped
 * family writes (`return { ...s, … }`) was the only shape the walk expanded, so a
 * factory that returned the state object itself published no return properties:
 * every read of the instance stayed authored text, and the attribute residue that
 * text landed in threw `ReferenceError` at render, CSR and SSR alike.
 *
 * The two shapes now lower identically. The one shape that still cannot is an
 * inline call in return position: a node id is spelled from the name it was
 * declared with, and `return state({…})` declares none — refused by name rather
 * than compiled into a throw.
 */

const UNNAMED = 'MARKLESS_SHARED_RETURN_UNNAMED';

async function graphFor(name: string, lines: ReadonlyArray<string>) {
	return buildSemanticGraph({ filename: `/app/${name}.tsrx`, source: `${lines.join('\n')}\n` });
}

const factory = (name: string, body: ReadonlyArray<string>) => [
	"import { computed, shared, state } from '@markless/core';",
	`export const ${name}State = shared(`,
	...body,
	"\t{ scope: 'widget' },",
	');',
	`export function ${name}Root({ children }) @{`,
	`	const one = ${name}State();`,
	`	<div data-root data-tone={one.tone}>{children}</div>`,
	'}',
];

function returnedGraphProperties(
	graph: Awaited<ReturnType<typeof buildSemanticGraph>>,
): ReadonlyArray<{ name: string; graphNodeId: string; path: ReadonlyArray<string> }> {
	return (graph.sharedDefinitions[0]?.returnProperties ?? []).flatMap((property) =>
		property.kind === 'graph'
			? [{ name: property.name, graphNodeId: property.graphNodeId, path: [...property.path] }]
			: [],
	);
}

function codes(graph: Awaited<ReturnType<typeof buildSemanticGraph>>): ReadonlyArray<string> {
	return graph.diagnostics.map((diagnostic) => diagnostic.code);
}

test('returning the state object by name publishes the same properties as spreading it', async () => {
	const named = await graphFor(
		'named',
		factory('named', [
			'	() => {',
			"		const tones = state({ tone: 'plain', note: 'n' });",
			'		return tones;',
			'	},',
		]),
	);
	const wrapped = await graphFor(
		'wrapped',
		factory('wrapped', [
			'	() => {',
			"		const tones = state({ tone: 'plain', note: 'n' });",
			'		return { ...tones };',
			'	},',
		]),
	);

	// Same names, same paths, and each id points at the factory's own `tones` node.
	expect(returnedGraphProperties(named).map(({ name, path }) => [name, path])).toEqual([
		['tone', ['tone']],
		['note', ['note']],
	]);
	expect(returnedGraphProperties(named).map(({ name, path }) => [name, path])).toEqual(
		returnedGraphProperties(wrapped).map(({ name, path }) => [name, path]),
	);
	expect(returnedGraphProperties(named).map((property) => property.graphNodeId)).toEqual([
		'shared:/app/named.tsrx#namedState/state:tones',
		'shared:/app/named.tsrx#namedState/state:tones',
	]);
	expect(codes(named)).not.toContain(UNNAMED);
});

test('a factory whose whole body is the returned object publishes it', async () => {
	const graph = await graphFor('concise', [
		"import { shared, state } from '@markless/core';",
		'export const conciseState = shared(() => {',
		"	const tones = state({ tone: 'plain' });",
		'	return { ...tones };',
		"}, { scope: 'widget' });",
	]);

	expect(returnedGraphProperties(graph).map((property) => property.name)).toEqual(['tone']);
	expect(codes(graph)).not.toContain(UNNAMED);
});

test('a returned state() call is refused by name instead of compiling to an unbound read', async () => {
	const graph = await graphFor('direct', [
		"import { shared, state } from '@markless/core';",
		"export const directState = shared(() => state({ tone: 'plain' }), { scope: 'widget' });",
		'export function DirectRoot({ children }) @{',
		'	const direct = directState();',
		'	<div data-root data-tone={direct.tone}>{children}</div>',
		'}',
	]);

	const refusal = graph.diagnostics.find((diagnostic) => diagnostic.code === UNNAMED);
	expect(refusal?.severity).toBe('error');
	expect(refusal?.message).toContain('directState');
	expect(refusal?.message).toContain('state()');
});

test('a returned computed() call is refused the same way', async () => {
	const graph = await graphFor('derived', [
		"import { computed, shared, state } from '@markless/core';",
		'export const derivedState = shared(() => {',
		"	const tones = state({ tone: 'plain' });",
		'	return computed(() => tones.tone);',
		"}, { scope: 'widget' });",
	]);

	const refusal = graph.diagnostics.find((diagnostic) => diagnostic.code === UNNAMED);
	expect(refusal?.message).toContain('derivedState');
	expect(refusal?.message).toContain('computed()');
});

test('a keyed repeat over a directly returned state object resolves to its cell', async () => {
	const graph = await graphFor('list', [
		"import { shared, state } from '@markless/core';",
		'export const listBox = shared(() => {',
		"	const box = state({ items: [{ id: 'a', label: 'A' }] });",
		'	return box;',
		"}, { scope: 'widget' });",
		'export function List() @{',
		'	const box = listBox();',
		'	<ul>',
		'		@for (const item of box.items; key item.id) {',
		'			<li>{item.label}</li>',
		'		}',
		'	</ul>',
		'}',
	]);

	expect(graph.diagnostics).toEqual([]);
	expect(graph.keyedRepeats[0]?.collectionGraphNodeId).toBe(
		'shared:/app/list.tsrx#listBox/state:box',
	);
	expect(graph.keyedRepeats[0]?.collectionPath).toEqual(['items']);
});

test('a repeat over a path the returned cells do not carry is still refused', async () => {
	// The bare return becoming readable must not cost the refusal its real cases.
	const graph = await graphFor('missing', [
		"import { shared, state } from '@markless/core';",
		'export const missingBox = shared(() => {',
		"	const box = state({ items: [{ id: 'a' }] });",
		'	return box;',
		"}, { scope: 'widget' });",
		'export function List() @{',
		'	const box = missingBox();',
		'	<ul>',
		'		@for (const item of box.absent; key item.id) {',
		'			<li>{item.id}</li>',
		'		}',
		'	</ul>',
		'}',
	]);

	expect(codes(graph)).toContain('MARKLESS_REPEAT_COLLECTION_UNREADABLE');
});

test('the wrapper object shape raises no refusal', async () => {
	const graph = await graphFor(
		'control',
		factory('control', [
			'	() => {',
			"		const tones = state({ tone: 'plain' });",
			"		return { ...tones, mark() { tones.tone = 'marked'; } };",
			'	},',
		]),
	);

	expect(codes(graph)).not.toContain(UNNAMED);
});
