/**
 * Defect 53 asked whether the build gate reads severity from every diagnostic
 * producer or only from the semantic graph. U192 saw a severity-`error`
 * `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` for a module that
 * nonetheless appeared to build, which would mean `symbolModules.diagnostics`
 * reaches no gate.
 *
 * It does reach the gate. `transformTsrxModuleWithPrerenderWakeClosure` — the
 * one entry every transform path funnels through, including the link re-runs —
 * collects diagnostics with `collectTsrxModuleDiagnostics`, which walks the
 * whole compiled result rather than a named list of artifacts, filters
 * `severity === 'error'`, and throws `MARKLESS_COMPILE_BLOCKED`.
 *
 * What this file pins is the doctrine, not the trace: severity `error` from any
 * producer must stop the build. The first fixture is the load-bearing one —
 * its *only* error comes from `symbolModules`, so if the gate ever narrows to
 * the semantic graph, nothing else in the suite would notice.
 */
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '@markless/compiler';
import { expect, test } from 'vitest';
import { MarklessCompileError } from '../src/dev-error/index.ts';
import { transformTsrxModule } from '../src/transform.ts';

const SYMBOL_MODULE_ERROR = 'MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE';

/**
 * A state read nested under a call. The read collector does not descend a
 * member chain through a call, so nothing is rewritten and the emitted symbol
 * module still names `s`. The read-back audit in the `symbol-modules` pass is
 * the only producer that reports it, which is what makes this the isolating
 * fixture.
 */
const COMPOUND_RHS_SOURCE = `import { state } from '@markless/core';

export function App() @{
	const s = state({ text: 'hello world', n: 0 });

	<div>
		<button onClick={(event) => { s.n = s.text.slice(0, 3).length; }}>go</button>
		<output>{s.n}</output>
	</div>
}`;

const compile = (filename: string, source: string) =>
	compileTsrxModule({ filename, source, symbols: [] });

const transform = (filename: string, source: string) =>
	transformTsrxModule({ filename, source, buildId: 'severity-gating-test' });

const errorCodes = (diagnostics: ReadonlyArray<{ code: string; severity: string }>) =>
	diagnostics.filter((diagnostic) => diagnostic.severity === 'error').map((d) => d.code);

/**
 * The fixture only isolates the gate while `symbol-modules` is the sole
 * producer of an error for it. If the compiler ever learns to lower this shape,
 * or another pass starts erroring on it too, the end-to-end assertions below
 * would pass for the wrong reason — so this test fails loudly rather than
 * letting them go quiet.
 */
test('the compound right side still errors, and only the symbol-modules pass reports it', async () => {
	const compiled = await compile('src/Handler.tsrx', COMPOUND_RHS_SOURCE);

	expect(errorCodes(compiled.symbolModules.diagnostics)).toEqual([SYMBOL_MODULE_ERROR]);
	expect(errorCodes(compiled.semanticGraph.diagnostics)).toEqual([]);
	expect(errorCodes(collectTsrxModuleDiagnostics(compiled))).toEqual([SYMBOL_MODULE_ERROR]);
});

test('an error whose only producer is symbolModules still blocks the build', async () => {
	let caught: unknown;
	try {
		await transform('src/Handler.tsrx', COMPOUND_RHS_SOURCE);
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeInstanceOf(MarklessCompileError);
	const error = caught as MarklessCompileError;
	expect(error.message).toContain('MARKLESS_COMPILE_BLOCKED');
	expect(error.message).toContain(SYMBOL_MODULE_ERROR);
	// The structured payload the dev overlay renders carries it too, so the
	// developer sees the error rather than only the warnings around it.
	expect(error.payload.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_ERROR,
	);
});

/**
 * The collection boundary is a walk over the whole compiled result, not a list
 * of artifact names. A future artifact that carries diagnostics is gated the
 * day it is added, with no gate change — this pins that property directly, so
 * it survives any fixture the compiler later learns to lower.
 */
test('the collector reaches an error nested under any artifact, not just the known ones', () => {
	const errorDiagnostic = {
		code: 'MARKLESS_TEST_ONLY_NESTED_ERROR',
		severity: 'error',
		phase: 'public-render',
		message: 'nested',
		suggestions: [],
	};
	const collected = collectTsrxModuleDiagnostics({
		semanticGraph: { diagnostics: [] },
		futureArtifact: { nested: { deeper: { diagnostics: [errorDiagnostic] } } },
	} as never);

	expect(collected.map((diagnostic) => diagnostic.code)).toContain(
		'MARKLESS_TEST_ONLY_NESTED_ERROR',
	);
});

// The other half of a gate that means anything: it must not block on warnings.
test('a module carrying only warnings still builds', async () => {
	const result = await transform(
		'src/HostWrite.tsrx',
		`export function HostWrite() @{
			<button onClick={(event) => {
				(event.target as HTMLElement).dataset.done = 'yes';
			}}>Write</button>
		}`,
	);

	expect(result.code).toBeTypeOf('string');
	expect(result.code.length).toBeGreaterThan(0);
});
