import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

/**
 * A `@for` row local shadowing a graph binding of the same name.
 *
 * The row's identifier is the row's own item. Resolving it to the component's
 * binding hands every row one node, and the rows then read a value that has
 * nothing to do with them — silently, because a resolved read looks exactly like
 * a correct one downstream. `repeatRowBindsName` is the test markup residues and
 * child props already apply; handler and helper expressions now apply it too, so
 * a name an enclosing `@for` declares never reaches `resolveGraphPath`.
 *
 * What the row read lowers to instead is a separate, older gap these tests do not
 * pin: a bare row local in a handler survives as an authored identifier rather
 * than becoming `context.locals?.<name>`, which is equally true of a row local
 * that shadows nothing. When the shadowed name is a graph binding the fail-closed
 * guard in `symbol-modules` catches that surviving identifier and fails the
 * build, which is the outcome doctrine asks for: never a silent wrong read.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Rows.tsrx', source, symbols: [] });
}

function loweredReads(result: Awaited<ReturnType<typeof compile>>) {
	return result.stateLowering.reads.map((read) => `${read.source}->${read.graphNodeId}`);
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

test('a row local shadowing an element() binding is never read as that handle', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = state([{ id: 'a', label: 'Alpha' }]);
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		@for (const box of rows; key box.id) {
			<button onClick={() => measure(box)}>row</button>
		}
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	// The defect: the row local resolved to the element binding and lowered to
	// `graph.read("element:box")`, which answers with a graph cell that never
	// held a DOM node.
	expect(loweredReads(result)).not.toContain('box->element:box');
	expect(eventSymbolSources(result)).toEqual([expect.not.stringContaining('graph.read')]);
	// Nothing binds the surviving row local yet, so the build refuses rather than
	// shipping a handler that reads the wrong node.
	expect(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
});

test('a row local shadowing a state() name is never read as that cell', async () => {
	const result = await compile(`
import { state } from '@markless/core';
import { pick } from './pick.ts';

export function Page() @{
	const rows = state([{ id: 'a' }]);
	let label = state('none');

	<div>
		<p>{label}</p>
		@for (const label of rows; key label.id) {
			<button onClick={() => pick(label.id)}>row</button>
		}
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	// The `<p>{label}</p>` read outside the repeat is the state cell and stays one;
	// only the row's own `label.id` stops resolving to it.
	expect(loweredReads(result)).toEqual(['label->state:label']);
	expect(eventSymbolSources(result)).toEqual([expect.not.stringContaining('state:label')]);
	expect(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
});

test('a graph binding read inside a repeat that shadows nothing still resolves', async () => {
	// The guard against over-shadowing: being inside a `@for` is not what stops a
	// read, sharing the row's name is. A handler in the row reads the same handle
	// and the same cell as its twin outside the row, and both lower alike.
	const result = await compile(`
import { element, state } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = state([{ id: 'a' }]);
	let label = state('none');
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => measure(box, label)}>outside</button>
		@for (const row of rows; key row.id) {
			<button onClick={() => measure(box, label)}>inside</button>
		}
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);
	const expected =
		'measure(context.getElementHandle("element:box"), context.graph.read("state:label"))';
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(expected),
		expect.stringContaining(expected),
	]);
});
