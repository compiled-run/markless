import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../src/index.ts';

/**
 * Two element collectors have to look a same-file declaration back up from an
 * identifier written in markup: the spread attribute, which needs the object
 * literal behind `{...attrs}` to know which keys it carries, and the event
 * attribute, which needs the function behind `onClick={handler}` to record the
 * handler's source.
 *
 * Both used to answer by scanning the module for the first declarator carrying
 * the name. A module holds one name many times - two components each with their
 * own `attrs`, a component-local shadowing a module-level constant - so the
 * first match is the right declaration only when the file happens to write it
 * first. These cases pin the resolved answer: the declaration the identifier
 * actually refers to.
 */

const SPREAD_EVENT = 'MARKLESS_EVENT_SPREAD_UNSUPPORTED';

async function graphFor(filename: string, lines: ReadonlyArray<string>) {
	return buildSemanticGraph({ filename, source: `${lines.join('\n')}\n` });
}

function spreadEventSpans(
	graph: Awaited<ReturnType<typeof buildSemanticGraph>>,
): ReadonlyArray<number> {
	return graph.diagnostics
		.filter((diagnostic) => diagnostic.code === SPREAD_EVENT)
		.map((diagnostic) => diagnostic.primarySpan?.start ?? -1);
}

test('a spread resolves to its own component`s object, not a same-named one above it', async () => {
	// Both components spread `attrs`. Only Alpha's object carries an event key,
	// so only Alpha's spread is the unsupported one; a name-first lookup answers
	// Alpha's object for Beta too and reports a spread Beta never wrote.
	const source = [
		'export function Alpha() @{',
		'	const attrs = { onClick: () => {} };',
		'	<div {...attrs}></div>',
		'}',
		'',
		'export function Beta() @{',
		'	const attrs = { id: "beta" };',
		'	<div {...attrs}></div>',
		'}',
	];
	const graph = await graphFor('src/SpreadComponents.tsrx', source);

	const alphaSpread = source.join('\n').indexOf('attrs}></div>');
	expect(spreadEventSpans(graph)).toEqual([alphaSpread]);
});

test('a component-local object shadows a module-level object of the same name', async () => {
	// The module-level `attrs` is written first and carries the event key. The
	// component's own `attrs` shadows it for the whole body, so the spread
	// carries `id` and nothing else.
	const graph = await graphFor('src/SpreadShadow.tsrx', [
		'const attrs = { onClick: () => {} };',
		'',
		'export function App() @{',
		'	const attrs = { id: "app" };',
		'	<div {...attrs}></div>',
		'}',
	]);

	expect(spreadEventSpans(graph)).toEqual([]);
});

test('a module-level object still resolves when the component declares no shadow', async () => {
	// The mirror of the case above: with nothing shadowing it, the module-level
	// object is what the spread refers to, and its event key is still reported.
	const graph = await graphFor('src/SpreadModuleScope.tsrx', [
		'const attrs = { onClick: () => {} };',
		'',
		'export function App() @{',
		'	<div {...attrs}></div>',
		'}',
	]);

	expect(spreadEventSpans(graph)).toHaveLength(1);
});

test('each component`s event handler resolves to its own function', async () => {
	// The miscompile this guards: Beta's button used to be recorded with Alpha's
	// function body, so the click would have run Alpha's code.
	const graph = await graphFor('src/HandlerComponents.tsrx', [
		'export function Alpha() @{',
		'	const handler = () => { console.log("alpha"); };',
		'	<button onClick={handler}>a</button>',
		'}',
		'',
		'export function Beta() @{',
		'	const handler = () => { console.log("beta"); };',
		'	<button onClick={handler}>b</button>',
		'}',
	]);

	expect(graph.events.map((event) => event.handlerSource)).toEqual([
		'() => { console.log("alpha"); }',
		'() => { console.log("beta"); }',
	]);
});

test('a component-local handler shadows a module-level function of the same name', async () => {
	const graph = await graphFor('src/HandlerShadow.tsrx', [
		'const handler = () => { console.log("module"); };',
		'',
		'export function App() @{',
		'	const handler = (event) => { console.log("local", event); };',
		'	<button onClick={handler}>go</button>',
		'}',
	]);

	expect(graph.events.map((event) => event.handlerSource)).toEqual([
		'(event) => { console.log("local", event); }',
	]);
	// The parameter list is read off the resolved function, so it moves with it.
	expect(graph.events.map((event) => event.handlerParameters)).toEqual([['event']]);
});

test('a module-level handler keeps recording the identifier, as it did before', async () => {
	// A parity guard, not a new rule. Only component-scope declarations reach
	// `localBindings` with kind `function`, so a module-level handler has no
	// local binding to resolve to and the event keeps the identifier as its
	// source. That was true of the name-first lookup too - the same test fails
	// the same way against the old code - so resolving by declaration site did
	// not move it.
	const graph = await graphFor('src/HandlerModuleScope.tsrx', [
		'const handler = () => { console.log("module"); };',
		'',
		'export function App() @{',
		'	<button onClick={handler}>go</button>',
		'}',
	]);

	expect(graph.events.map((event) => event.handlerSource)).toEqual(['handler']);
});
