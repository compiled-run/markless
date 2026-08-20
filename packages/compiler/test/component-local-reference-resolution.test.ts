import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';

/**
 * Component-local reference resolution: which identifier uses inside a component
 * body refer to which component-local declaration, and how many times each of
 * those declarations is written.
 *
 * Both answers are observable in the artifact - `localDeclarations[].writeCount`
 * for the counting, and a component edge's prop `kind` for the resolution, since
 * only a local resolved to a single-write function declaration classifies as a
 * `callback` prop. These tests pin that behavior so the resolution strategy can
 * change underneath them without the artifact moving.
 */

async function graphFor(componentBody: string): Promise<SemanticGraphArtifact> {
	const source = [
		"import { state } from '@markless/core';",
		'',
		'function Child({ onSelect }) @{',
		"\t<button onClick={() => onSelect('ash')}>Select</button>",
		'}',
		'',
		'export function App() @{',
		componentBody,
		'}',
		'',
	].join('\n');
	return buildSemanticGraph({ filename: 'app.tsrx', source });
}

function writeCountOf(graph: SemanticGraphArtifact, name: string): number | undefined {
	return graph.localDeclarations.find(
		(candidate) => candidate.componentName === 'App' && candidate.name === name,
	)?.writeCount;
}

function propKindOf(graph: SemanticGraphArtifact, name: string): string | undefined {
	return graph.componentEdges[0]?.props.find((prop) => prop.name === name)?.kind;
}

test('an update expression on a component-local counts as a write', async () => {
	const graph = await graphFor(
		[
			'\tlet clicks = 0;',
			'\tconst bump = () => { clicks++; };',
			'\t<Child onSelect={bump} />',
		].join('\n'),
	);

	// One write for the initializer, one for the `++`.
	expect(writeCountOf(graph, 'clicks')).toBe(2);
	expect(writeCountOf(graph, 'bump')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('destructuring assignment counts a write against every component-local it targets', async () => {
	const graph = await graphFor(
		[
			'\tlet first = 1;',
			'\tlet second = 2;',
			'\tconst source = { first: 3 };',
			'\tconst swap = () => {',
			'\t\t[first, second] = [second, first];',
			'\t\t({ first } = source);',
			'\t};',
			'\t<Child onSelect={swap} />',
		].join('\n'),
	);

	// Initializer, array pattern, object pattern.
	expect(writeCountOf(graph, 'first')).toBe(3);
	// Initializer, array pattern.
	expect(writeCountOf(graph, 'second')).toBe(2);
	expect(writeCountOf(graph, 'source')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('assigning through a member expression is not a write to the object binding', async () => {
	const graph = await graphFor(
		[
			'\tconst store = { value: 0 };',
			'\tconst bump = () => { store.value += 1; };',
			'\t<Child onSelect={bump} />',
		].join('\n'),
	);

	// `store` itself is never reassigned, so it keeps its initializer write only.
	expect(writeCountOf(graph, 'store')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('a parameter that shadows a component-local absorbs the writes aimed at it', async () => {
	const graph = await graphFor(
		[
			"\tlet handler = (song) => console.log('first', song);",
			'\tconst reset = (handler) => { handler = null; };',
			'\t<Child onSelect={handler} />',
		].join('\n'),
	);

	// The `handler = null` writes the parameter, not the component-local, so the
	// local stays single-write and still classifies as a callback.
	expect(writeCountOf(graph, 'handler')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('a block-scoped declaration that shadows a component-local absorbs its writes', async () => {
	const graph = await graphFor(
		[
			"\tlet title = 'a';",
			'\tconst relabel = () => {',
			"\t\tlet title = 'b';",
			"\t\ttitle = 'c';",
			'\t\treturn title;',
			'\t};',
			'\t<Child onSelect={relabel} />',
		].join('\n'),
	);

	expect(writeCountOf(graph, 'title')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('a parameter shadowing a component-local adds no references to the local', async () => {
	const graph = await graphFor(
		[
			'\tconst pick = (song) => console.log(song);',
			'\tconst outer = (pick) => pick;',
			'\t<Child onSelect={outer} />',
		].join('\n'),
	);

	expect(writeCountOf(graph, 'pick')).toBe(1);
	expect(writeCountOf(graph, 'outer')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('a component-local named in a prop inside a branch still resolves to its declaration', async () => {
	const graph = await graphFor(
		[
			'\tconst pick = (song) => console.log(song);',
			'\tlet visible = true;',
			'\t@if (visible) {',
			'\t\t<Child onSelect={pick} />',
			'\t}',
		].join('\n'),
	);

	expect(writeCountOf(graph, 'pick')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('a reassigned component-local stops classifying as a callback prop', async () => {
	const graph = await graphFor(
		[
			"\tlet handler = (song) => console.log('first', song);",
			"\thandler = (song) => console.log('second', song);",
			'\t<Child onSelect={handler} />',
		].join('\n'),
	);

	expect(writeCountOf(graph, 'handler')).toBe(2);
	expect(propKindOf(graph, 'onSelect')).toBe('opaque');
});

test('a for-of loop that reassigns an existing component-local counts that write', async () => {
	const graph = await graphFor(
		[
			'\tconst rows = [1, 2];',
			'\tlet cursor = 0;',
			'\tconst scan = () => { for (cursor of rows) { console.log(cursor); } };',
			'\t<Child onSelect={scan} />',
		].join('\n'),
	);

	// The loop head assigns `cursor` once per iteration, so it is a write like any
	// other. Resolution-based counting sees it; the name-and-shape walk this pass
	// used to do saw only `=` and `++`, and undercounted it as 1.
	expect(writeCountOf(graph, 'cursor')).toBe(2);
	expect(writeCountOf(graph, 'rows')).toBe(1);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});

test('a component-body function declaration resolves through its declaration identifier', async () => {
	const graph = await graphFor(
		['\tfunction pick(song) {', '\t\tconsole.log(song);', '\t}', '\t<Child onSelect={pick} />'].join(
			'\n',
		),
	);

	const declaration = graph.localDeclarations.find(
		(candidate) => candidate.componentName === 'App' && candidate.name === 'pick',
	);
	expect(declaration?.declarationKind).toBe('function');
	expect(declaration?.writeCount).toBe(1);
	// The binding id is the span of the declaration's *identifier*, not of the
	// whole function declaration.
	expect(declaration?.bindingId).toBe(
		`binding:${declaration?.declarationSpan?.start}:${declaration?.declarationSpan?.end}`,
	);
	expect(propKindOf(graph, 'onSelect')).toBe('callback');
});
