/**
 * A handler assignment whose right side nests a state read under a call —
 * `s.n = s.text.slice(0, 3).length` — used to ship.
 *
 * The value bands lower a read by matching a recorded read's authored text
 * against a node's own text. `s.text.slice(0, 3).length` is not recorded as a
 * read (the read collector does not descend a member chain through a call), so
 * no node in that expression matches, nothing is rewritten, and the emitted
 * symbol module carried `value: s.text.slice(0, 3).length` with `s` bound
 * nowhere in it. A symbol module is its own module: the first click threw
 * `ReferenceError: s is not defined`, and nothing at build time said so.
 *
 * The rule this file holds is one sentence: **an emitted symbol module never
 * names a state binding directly.** Either the shape is lowered — every
 * supported form below stays green and emits `context.graph.read` — or the build
 * fails with a diagnostic that names the assignment. Silence is not an option.
 *
 * The guard is deliberately a read-back over emitted modules rather than a ban
 * on one syntax. The day the read collector learns to descend that chain, the
 * name stops appearing in the module and this diagnostic goes quiet on its own,
 * with no test here to relax.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

const source = (handlerBody: string) => `
import { state } from '@markless/core';

export function App() @{
	const s = state({ text: 'hello world', n: 0 });

	<div>
		<button onClick={(event) => { ${handlerBody} }}>go</button>
		<output>{s.n}</output>
	</div>
}
`;

type Compiled = Awaited<ReturnType<typeof compileTsrxModule>>;

const compile = (handlerBody: string) =>
	compileTsrxModule({
		filename: '/workspace/app/src/Handler.tsrx',
		source: source(handlerBody),
		symbols: [],
	});

const handlerModule = (result: Compiled) => {
	const handler = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'event-handler',
	);
	const emitted = result.symbolModules.modules.find(
		(module) => module.symbolId === handler?.id,
	);
	if (!emitted) throw new Error('the fixture emitted no event-handler module');

	return emitted.source;
};

const unresolvedGraphDiagnostics = (result: Compiled) =>
	result.symbolModules.diagnostics.filter(
		(diagnostic) => diagnostic.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);

/**
 * The one claim that makes the defect impossible: whatever the compiler emits
 * for this handler, it does not name the component's state binding.
 *
 * String literals are blanked first. A lowered module is full of them —
 * `context.graph.read("state:s", ["text"])` — and the graph node id ends in the
 * binding's own name, which is a mention of the binding, not a reference to it.
 */
const namesTheBinding = (emitted: string) =>
	/(^|[^.\w$])s(?![\w$])/m.test(emitted.replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, '""'));

test('a compound right side either lowers or is refused — it never ships naming the binding', async () => {
	const result = await compile('s.n = s.text.slice(0, 3).length;');
	const emitted = handlerModule(result);
	const refusals = unresolvedGraphDiagnostics(result);

	// Both outcomes are acceptable; shipping `s` with no diagnostic is not.
	if (refusals.length === 0) {
		expect(namesTheBinding(emitted)).toBe(false);
		expect(emitted).toContain('context.graph.read("state:s", ["text"])');
		return;
	}

	expect(refusals[0]?.severity).toBe('error');
	expect(refusals[0]?.message).toContain('s.n = s.text.slice(0, 3).length');
	expect(refusals[0]?.message).toContain('ReferenceError');
});

test('the refusal is severity error, so the build cannot ship the module', async () => {
	const result = await compile('s.n = s.text.slice(0, 3).length;');
	const refusals = unresolvedGraphDiagnostics(result);
	if (refusals.length === 0) return; // The shape lowered; the guard has nothing to say.

	expect(refusals.map((diagnostic) => diagnostic.severity)).toEqual(['error']);
	expect(refusals[0]?.suggestions?.length ?? 0).toBeGreaterThan(0);
	expect(refusals[0]?.docsUrl).toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
});

test('the compound shape never emits the binding name, whichever way it is decided', async () => {
	const result = await compile('s.n = s.text.slice(0, 3).length;');
	const shipped = unresolvedGraphDiagnostics(result).length === 0;

	// Emitted-and-clean, or refused. Emitted-and-naming-`s` is the defect.
	expect(shipped && namesTheBinding(handlerModule(result))).toBe(false);
});

const SUPPORTED: ReadonlyArray<readonly [string, string, string]> = [
	['a direct read', 's.n = s.text;', 'context.graph.read("state:s", ["text"])'],
	['a read in an operand', 's.n = s.n + 1;', 'context.graph.read("state:s", ["n"]) + 1'],
	[
		'a local hop',
		'const t = s.text; s.n = t.length;',
		'const t = context.graph.read("state:s", ["text"]);',
	],
	[
		'a read through a global call',
		's.n = Number(s.text);',
		'Number(context.graph.read("state:s", ["text"]))',
	],
	[
		'an event field',
		's.text = event.currentTarget.value;',
		'value: context.element?.value',
	],
];

for (const [name, handlerBody, expected] of SUPPORTED) {
	test(`${name} still lowers, and the guard stays quiet`, async () => {
		const result = await compile(handlerBody);
		const emitted = handlerModule(result);

		expect(emitted).toContain(expected);
		expect(namesTheBinding(emitted)).toBe(false);
		expect(unresolvedGraphDiagnostics(result)).toEqual([]);
	});
}
