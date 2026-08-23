/**
 * U122: `aria-current={cond ? 'page' : undefined}` compiled to no update record.
 *
 * Every other "absent" alternate — `false`, `null`, `0`, `''`, even `void 0` —
 * mints the synthetic computed behind the attribute, so the attribute gets a
 * dom-update symbol and a `graph-read` residue that keeps it eligible for the
 * public render. The bare `undefined` identifier did not: it parses as an
 * Identifier rather than a Literal, so the composite read collector reported it
 * as a read source, failed to resolve it to a graph binding, and dropped the
 * whole expression. The attribute then rendered once on the first CSR paint and
 * never refreshed, and the server rendered it not at all. Nothing was red.
 *
 * These rows pin the parity: the `undefined` alternate must compile to what the
 * `false` alternate compiles to.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { buildSemanticGraph } from '../src/passes/semantic-graph/index.ts';

const FILENAME = '/workspace/src/App.tsrx';

function source(alternate: string): string {
	return `
		import { state } from '@markless/core';
		export function App() @{
			let on = state(false);
			<section><a aria-current={on ? 'page' : ${alternate}} onClick={() => on = !on}>x</a></section>
		}
	`;
}

/**
 * The two facts that decide whether the attribute lives after the first paint:
 * the residue kind the markup slot carries (an `authored-expression` residue is
 * what makes the public render skip the slot) and whether the plan minted a
 * dom-update symbol for it (no symbol, no refresh).
 */
async function compileAlternate(alternate: string) {
	const graph = await buildSemanticGraph({ filename: FILENAME, source: source(alternate) });
	const chunk = graph.markup.chunks.find((candidate) => candidate.id === 'template:App');
	const slot = chunk?.slots.find(
		(candidate): candidate is typeof candidate & { readonly residue: { readonly kind: string } } =>
			candidate.kind === 'attribute' && 'residue' in candidate,
	);
	const result = await compileTsrxModule({
		filename: FILENAME,
		resolverId: 'virtual:resolver',
		symbols: [],
		source: source(alternate),
	});
	return {
		statics: chunk?.statics.join('') ?? '',
		residueKind: slot?.residue.kind,
		symbolKinds: result.symbolResolver.symbols.map((symbol) => symbol.kind),
		templateComputeds: graph.graphBindings
			.filter((binding) => binding.id.startsWith('computed:templateExpression:'))
			.map((binding) => binding.functionSource),
	};
}

test('the false alternate mints the computed, the residue, and the dom-update symbol', async () => {
	const compiled = await compileAlternate('false');

	expect(compiled.statics).toBe('<section><a>x</a></section>');
	expect(compiled.residueKind).toBe('graph-read');
	expect(compiled.symbolKinds).toContain('dom-update');
	expect(compiled.templateComputeds).toEqual([`() => on ? 'page' : false`]);
});

test('the undefined alternate compiles to a dom-update record, not a dropped expression', async () => {
	const compiled = await compileAlternate('undefined');

	expect(compiled.residueKind).toBe('graph-read');
	expect(compiled.symbolKinds).toContain('dom-update');
	expect(compiled.templateComputeds).toEqual([`() => on ? 'page' : undefined`]);
});

test('the undefined alternate matches the false alternate everywhere the two can differ', async () => {
	const [control, subject] = await Promise.all([
		compileAlternate('false'),
		compileAlternate('undefined'),
	]);

	expect(subject.statics).toBe(control.statics);
	expect(subject.residueKind).toBe(control.residueKind);
	expect(subject.symbolKinds).toEqual(control.symbolKinds);
});

test('void 0 already behaves, which is what makes the bare identifier the whole defect', async () => {
	const compiled = await compileAlternate('void 0');

	expect(compiled.residueKind).toBe('graph-read');
	expect(compiled.symbolKinds).toContain('dom-update');
});
