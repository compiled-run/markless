import { expect, test } from 'vitest';
import { parseModule } from '../src/js-ast.ts';
import { selectPublicRenderRoot } from '../src/passes/public-render/plan.ts';
import { collectUndeclaredTemplateReadDiagnostics } from '../src/passes/public-render/validation.ts';
import type { AnyNode } from '../src/ast/nodes.ts';

/**
 * `collectUndeclaredTemplateReadDiagnostics` used to answer "which name in this
 * template read is not declared anywhere?" by building a set of every name it
 * could see declared — module statements, component props, body declarations,
 * catch parameters — and scanning each read's authored source with a regex for
 * a name the set did not contain. It now asks the semantic view instead: an
 * identifier use with no resolved symbol is an undeclared read.
 *
 * These cases pin that answer. The `POLICY` cases pin the two name sources that
 * are markless semantics rather than scope mechanics and so stay hand-held. The
 * `DIVERGES` cases record where the two computations disagree; each states what
 * the regex scan returned, because that difference is a behavior change and not
 * a refactor.
 */
const filename = 'src/Probe.tsrx';

function undeclaredRead(
	source: string,
	repeatLocals: ReadonlyArray<string> = [],
): { readonly name: string; readonly start: number; readonly end: number } | null {
	const ast = parseModule(source, filename) as unknown as AnyNode;
	const selected = selectPublicRenderRoot(ast);
	if (!selected) throw new Error('probe source has no public render root');
	const [diagnostic] = collectUndeclaredTemplateReadDiagnostics({
		ast,
		component: selected.component,
		filename,
		moduleImports: [],
		repeatLocals,
		root: selected.root,
		source,
	});
	if (!diagnostic) return null;
	return {
		// The diagnostic names the offending identifier first in its message.
		name: diagnostic.message.split(' ')[0]!,
		start: diagnostic.primarySpan.start,
		end: diagnostic.primarySpan.end,
	};
}

test('an undeclared template read is reported against the whole read, by name', () => {
	const source = `export function App() @{ <main>{missingLabel}</main> }`;

	expect(undeclaredRead(source)).toEqual({
		name: 'missingLabel',
		start: source.indexOf('missingLabel'),
		end: source.indexOf('missingLabel') + 'missingLabel'.length,
	});
});

test('the reported span covers the read expression, not just the identifier', () => {
	const source = `export function App() @{ <main>{missing.deep.value}</main> }`;

	expect(undeclaredRead(source)).toEqual({
		name: 'missing',
		start: source.indexOf('missing.deep.value'),
		end: source.indexOf('missing.deep.value') + 'missing.deep.value'.length,
	});
});

test('the first unresolved read in template order wins', () => {
	const source = `export function App() @{ <main><p>{firstMissing}</p><p>{secondMissing}</p></main> }`;

	expect(undeclaredRead(source)?.name).toBe('firstMissing');
});

test('a name declared in the component body is not reported', () => {
	expect(
		undeclaredRead(`export function App() @{ const label = 'Hi'; <main>{label}</main> }`),
	).toBeNull();
});

test('a destructured prop is not reported', () => {
	expect(undeclaredRead(`export function App({ title }) @{ <main>{title}</main> }`)).toBeNull();
});

test('a renamed and a defaulted destructured prop are not reported', () => {
	expect(
		undeclaredRead(`export function App({ a: shown, b = 1 }) @{ <main>{shown}{b}</main> }`),
	).toBeNull();
});

test('a module-level declaration is not reported', () => {
	expect(
		undeclaredRead(`const helper = 1;\nexport function App() @{ <main>{helper}</main> }`),
	).toBeNull();
});

test('an imported name is not reported', () => {
	expect(
		undeclaredRead(
			`import { state } from '@markless/core';\nexport function App() @{ const n = state(0); <main>{n}</main> }`,
		),
	).toBeNull();
});

test('a property name is not read as a free identifier', () => {
	expect(
		undeclaredRead(`export function App() @{ const box = { deep: 1 }; <main>{box.deep}</main> }`),
	).toBeNull();
});

test('an object literal key is not read as a free identifier', () => {
	expect(
		undeclaredRead(`export function App() @{ <main>{JSON.stringify({ akey: 1 })}</main> }`),
	).toBeNull();
});

test('text inside a string literal is not read as a free identifier', () => {
	expect(undeclaredRead(`export function App() @{ <main>{'notAName'}</main> }`)).toBeNull();
});

test('a @catch binding is in scope for the reads inside its arm', () => {
	expect(
		undeclaredRead(
			`export function App() @{ <main>@try { <p>Hi</p> } @catch (failure) { <p>{failure.message}</p> }</main> }`,
		),
	).toBeNull();
});

test('POLICY: a name on the known render globals list is not reported', () => {
	expect(undeclaredRead(`export function App() @{ <main>{Math.max(1, 2)}</main> }`)).toBeNull();
});

test('POLICY: a global outside the known render globals list is still reported', () => {
	// The analyzer resolves neither `Math` nor `console`; the policy list, not
	// the semantic view, is what separates them.
	expect(undeclaredRead(`export function App() @{ <main>{console.log(1)}</main> }`)?.name).toBe(
		'console',
	);
});

test('POLICY: a repeat local is not reported', () => {
	const source = `export function App() @{ const rows = [1]; <main>@for (row of rows) { <p>{row}</p> }</main> }`;

	expect(undeclaredRead(source, ['row'])).toBeNull();
	// Without the repeat-local policy the item binder is an unresolved name, so
	// the policy is doing real work rather than shadowing an analyzer answer.
	expect(undeclaredRead(source, [])?.name).toBe('row');
});

test('DIVERGES: a parameter bound inside the read resolves and is not reported', () => {
	// The regex scan had no notion of a binding introduced inside the read, so
	// it reported `x` here — a false positive on supported code.
	expect(
		undeclaredRead(`export function App() @{ const items = [1]; <main>{items.map((x) => x + 1)}</main> }`),
	).toBeNull();
});

test('DIVERGES: a var hoisted from a nested block resolves and is not reported', () => {
	// The old scope set only collected declarations directly under the
	// component body, so a hoisted `var` from a nested block was reported.
	expect(
		undeclaredRead(`export function App() @{ if (true) { var hoisted = 1; } <main>{hoisted}</main> }`),
	).toBeNull();
});

test('DIVERGES: an undeclared name in a ternary consequent is now reported', () => {
	// The regex skipped any name followed by `:`, which silently excused every
	// ternary consequent. The old computation returned no diagnostic here.
	expect(
		undeclaredRead(`export function App() @{ const flag = true; <main>{flag ? missingA : 2}</main> }`)
			?.name,
	).toBe('missingA');
});

test('DIVERGES: an undeclared name in a template literal hole is now reported', () => {
	// The regex stripped backtick-delimited spans before scanning, so it never
	// saw substitutions. The old computation returned no diagnostic here.
	expect(undeclaredRead('export function App() @{ <main>{`x${missingB}`}</main> }')?.name).toBe(
		'missingB',
	);
});

test('DIVERGES: an unresolved type name is no longer reported', () => {
	// The regex had no grammar, so it reported the `as` keyword itself as the
	// undeclared name. Type positions are erased before the render module runs
	// and cannot raise the ReferenceError this diagnostic describes.
	expect(
		undeclaredRead(`export function App() @{ const v = 1; <main>{v as MissingType}</main> }`),
	).toBeNull();
});
