/**
 * A shared() method's parameter list, as the inliner reads it.
 *
 * A handler that calls a `shared()` method carries no runtime instance, so the
 * call is replaced by an arrow holding the method's own parameter list and body.
 * That parameter list used to be cut at the FIRST `)` after the method name,
 * which is only right while no parameter carries parentheses of its own. A
 * parameter typed `done: () => void`, or defaulted `now = Date.now()`, was cut
 * in half; the spliced arrow did not parse; every later pass read the handler as
 * unreadable and the emitter printed `void context` — the whole handler body
 * disappeared at dispatch, with no diagnostic anywhere. That is defect 47's
 * reported shape: a call compiles clean and then silently kills the rest of the
 * handler.
 *
 * Arity itself was never the boundary — two- and three-parameter methods work,
 * and the rows below pin that too, so the select family's two-cell typeahead
 * workaround can be reverted.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

const familySource = (method: string, call: string) => `
import { shared, state } from '@markless/core';

export const buf = shared(() => {
	const s = state({ search: '', searchAt: 0, echo: '' });
	return { ...s, ${method} };
}, { scope: 'widget' });

export function Box() @{
	const b = buf();

	<div data-root>
		<button type="button" onClick={() => {
			${call}
			b.echo = 'after';
		}}>x</button>
		<p data-search>{b.search}</p>
		<p data-echo>{b.echo}</p>
	</div>
}
`;

async function compileHandler(method: string, call: string) {
	const compiled = await compileTsrxModule({
		filename: 'src/box.tsrx',
		source: familySource(method, call),
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const errors = [...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
	const symbol = compiled.symbolResolver.symbols.find(
		(candidate) => candidate.kind === 'event-handler',
	);
	const module = compiled.symbolModules.modules.find(
		(candidate) => candidate.symbolId === symbol?.id,
	);

	return { errors, inlined: symbol?.source ?? '', module: module?.source ?? '' };
}

const SEARCH_WRITE =
	'context.graph.write({ graphNodeId: "shared:src/box.tsrx#buf/state:s", path: ["search"], value: text })';
const ECHO_WRITE =
	'context.graph.write({ graphNodeId: "shared:src/box.tsrx#buf/state:s", path: ["echo"], value: \'after\' })';

// The failure this unit was cut for: whatever the method's parameter list holds,
// the statement the author wrote after the call must still run. `echo` is that
// statement, and its absence is exactly what "the handler was silently killed"
// looks like in an artifact.
test('the statement after a shared-method call survives every parameter shape', async () => {
	const shapes: ReadonlyArray<readonly [string, string, string]> = [
		['zero-arg', 'bump() { s.searchAt = 1; },', 'b.bump();'],
		['one parameter', 'typed(text: string) { s.search = text; },', "b.typed('a');"],
		[
			'two parameters',
			'typed(text: string, now: number) { s.search = text; s.searchAt = now; },',
			"b.typed('a', 1);",
		],
		[
			'three parameters',
			'typed(text: string, now: number, tail: string) { s.search = text + tail; s.searchAt = now; },',
			"b.typed('a', 1, 'z');",
		],
		[
			'a function-typed parameter',
			'typed(text: string, done: () => void) { s.search = text; done(); },',
			"b.typed('a', () => {});",
		],
		[
			'a defaulted parameter whose default is a call',
			'typed(text: string, now: number = Date.now()) { s.search = text; s.searchAt = now; },',
			"b.typed('a');",
		],
		[
			'a destructured parameter',
			'typed({ text, at }: { text: string; at: number }) { s.search = text; s.searchAt = at; },',
			"b.typed({ text: 'a', at: 1 });",
		],
	];

	for (const [label, method, call] of shapes) {
		const { errors, module } = await compileHandler(method, call);
		expect(errors, label).toEqual([]);
		// The emitter prints `void context` for a handler it could not read.
		expect(module, label).not.toContain('void context;');
		expect(module, label).toContain(ECHO_WRITE);
		// The authored call is gone, replaced by the method's own body.
		expect(module, label).not.toContain('b.typed');
		expect(module, label).not.toContain('b.bump');
	}
});

test('a two-parameter method binds both parameters and writes both cells', async () => {
	const { errors, module } = await compileHandler(
		'typed(text: string, now: number) { s.search = text; s.searchAt = now; },',
		"b.typed('a', 1);",
	);

	expect(errors).toEqual([]);
	expect(module).toContain('((text: string, now: number) => {');
	expect(module).toContain(SEARCH_WRITE);
	expect(module).toContain(
		'context.graph.write({ graphNodeId: "shared:src/box.tsrx#buf/state:s", path: ["searchAt"], value: now })',
	);
	// The arguments reach the arrow in the order they were written.
	expect(module).toContain("})('a', 1);");
});

// The parameter list of a parenthesis-carrying parameter used to be cut in half.
test('a parameter carrying parentheses of its own keeps its whole parameter list', async () => {
	const fnTyped = await compileHandler(
		'typed(text: string, done: () => void) { s.search = text; done(); },',
		"b.typed('a', () => {});",
	);
	expect(fnTyped.errors).toEqual([]);
	expect(fnTyped.module).toContain('((text: string, done: () => void) => {');
	expect(fnTyped.module).toContain(SEARCH_WRITE);
	expect(fnTyped.module).toContain('done();');

	const defaulted = await compileHandler(
		'typed(text: string, now: number = Date.now()) { s.search = text; s.searchAt = now; },',
		"b.typed('a');",
	);
	expect(defaulted.errors).toEqual([]);
	expect(defaulted.module).toContain('((text: string, now: number = Date.now()) => {');
	expect(defaulted.module).toContain(SEARCH_WRITE);
});

// Byte-stability: the shapes that already worked emit exactly what they emitted
// before the parameter-list scan changed. These two strings are the canary.
test('one-parameter and zero-argument emission is byte-unchanged', async () => {
	const zero = await compileHandler('bump() { s.searchAt = 1; },', 'b.bump();');
	expect(zero.inlined).toContain('(() => { s.searchAt = 1; })()');
	expect(zero.module).toBe(
		`export function symbol_0(context) {
  (() => {
    context.graph.write({ graphNodeId: "shared:src/box.tsrx#buf/state:s", path: ["searchAt"], value: 1 });
  })();
  ${ECHO_WRITE};
}`,
	);

	const one = await compileHandler('typed(text: string) { s.search = text; },', "b.typed('a');");
	expect(one.inlined).toContain("((text: string) => { s.search = text; })('a')");
	expect(one.module).toBe(
		`export function symbol_0(context) {
  ((text: string) => {
    ${SEARCH_WRITE};
  })('a');
  ${ECHO_WRITE};
}`,
	);
});
