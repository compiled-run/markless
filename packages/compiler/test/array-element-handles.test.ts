import { expect, test } from 'vitest';
import { buildSemanticGraph, planPayloadArena } from '../src/index.ts';
import { lowerStateAccess } from '../src/passes/state-lowering.ts';

// Cardinality is DECLARED, at the `element<T>()` call, and read syntactically
// from the type argument. `element<T[]>()` may bind on many elements; every
// other spelling keeps the exactly-one rule. These tests pin both directions,
// including the spellings the compiler deliberately refuses to guess at.

async function graphOf(name: string, source: string) {
	return await buildSemanticGraph({ filename: `src/${name}.tsrx`, source });
}

const codes = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.diagnostics.map((diagnostic) => diagnostic.code);

const twoBindings = (declaration: string) =>
	`import { element } from '@markless/core';
export function App() @{
	${declaration}
	<ul>
		<li el={optionEls}>one</li>
		<li el={optionEls}>two</li>
	</ul>
}`;

test('an array type argument lets one handle bind on many elements', async () => {
	const graph = await graphOf('ArrayHandle', twoBindings('const optionEls = element<HTMLLIElement[]>();'));

	expect(codes(graph)).toEqual([]);
	expect(graph.elementHandleBindings.map((binding) => binding.handleName)).toEqual([
		'optionEls',
		'optionEls',
	]);
	expect(
		graph.graphBindings.find((binding) => binding.kind === 'element')?.plural,
	).toBe(true);
});

test('Array<T> and readonly T[] are the same declaration', async () => {
	for (const declaration of [
		'const optionEls = element<Array<HTMLLIElement>>();',
		'const optionEls = element<ReadonlyArray<HTMLLIElement>>();',
		'const optionEls = element<readonly HTMLLIElement[]>();',
	]) {
		const graph = await graphOf('ArrayAlias', twoBindings(declaration));
		expect(codes(graph)).toEqual([]);
	}
});

test('a handle with no array type argument still refuses a second binding', async () => {
	const graph = await graphOf('SingleHandle', twoBindings('const optionEls = element<HTMLLIElement>();'));

	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_DUPLICATE']);
	expect(graph.diagnostics[0]?.suggestions?.[0]?.message).toContain('element<HTMLElement[]>()');
});

// Fail closed rather than guess: the semantic graph has no type checker, so an
// alias for an array type is not readable here. Classifying it as plural on a
// hunch would let a real collection bind with none of the ordering the runtime
// needs, so the alias reads as one element and the diagnostic says what to write.
test('an aliased array type is refused, and the diagnostic names the literal forms', async () => {
	const graph = await graphOf(
		'AliasedHandle',
		`import { element } from '@markless/core';
type Options = HTMLLIElement[];
export function App() @{
	const optionEls = element<Options>();
	<ul>
		<li el={optionEls}>one</li>
		<li el={optionEls}>two</li>
	</ul>
}`,
	);

	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_DUPLICATE']);
	expect(graph.diagnostics[0]?.suggestions?.[0]?.message).toContain(
		'written literally as T[], Array<T> or readonly T[]',
	);
});

test('a handle with no type argument at all is one element', async () => {
	const graph = await graphOf('UntypedHandle', twoBindings('const optionEls = element();'));

	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_DUPLICATE']);
});

test('an array-typed handle is refused in an IDREF position', async () => {
	const graph = await graphOf(
		'ArrayIdref',
		`import { element } from '@markless/core';
export function App() @{
	const optionEls = element<HTMLLIElement[]>();
	<section>
		<div aria-controls={optionEls}>controls</div>
		<ul><li el={optionEls}>one</li><li el={optionEls}>two</li></ul>
	</section>
}`,
	);

	expect(graph.elementHandleIdrefs).toEqual([]);
	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF');
});

// Row ownership used to take a bare identifier only; `el={select.optionEls}` is
// the shape every family walk needs, because the handle lives on the widget's
// shared() factory and the row is rendered by a part that reads it.
test('a shared() instance member is row-ownable inside a keyed repeat', async () => {
	const graph = await graphOf(
		'SharedRowHandle',
		`import { element, shared, state } from '@markless/core';
const select = shared(() => {
	const s = state({ items: [{ id: 'a' }] });
	const optionEls = element<HTMLLIElement[]>();
	return { ...s, optionEls };
}, { scope: 'widget' });
export function App() @{
	const s = select();
	<ul>@for (const item of s.items; key item.id) {
		<li el={s.optionEls}>{item.id}</li>
	}</ul>
}`,
	);

	expect(codes(graph)).toEqual([]);
	expect(graph.elementHandleBindings[0]?.rowOwner).toEqual({
		repeatId: 'repeat:0',
		keyPath: ['id'],
	});
	// The row record keys by the DECLARED name, not the member spelling.
	expect(graph.elementHandleBindings[0]?.handleName).toBe('optionEls');
});

test('the plural declaration rides the payload records the runtime reads', async () => {
	const semanticGraph = await graphOf(
		'PluralPayload',
		`import { element } from '@markless/core';
export function App() @{
	const optionEls = element<HTMLLIElement[]>();
	<ul><li el={optionEls}>one</li><li el={optionEls}>two</li></ul>
}`,
	);
	const payload = planPayloadArena({
		semanticGraph,
		stateLowering: lowerStateAccess({ semanticGraph }),
	});

	expect(payload.view.elementHandles).toEqual([
		expect.objectContaining({ name: 'optionEls', plural: true }),
		expect.objectContaining({ name: 'optionEls', plural: true }),
	]);
});
