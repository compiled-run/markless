import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A compiled `.tsrx` module is consumed by plain ESM as well as by member tags:
// a `.ts` barrel writes `export { CheckboxRoot as root } from './checkbox.tsrx'`
// and an app writes `import { Gallery } from './Gallery.tsrx'`. Both are named
// reads the bundler resolves at link time.
//
// The compiler does not emit those exports - it cannot, because the client
// production module drops `publicSsrModuleSource` entirely and the names still
// have to link there. What the compiler owns is the LIST: one entry per
// component the module serves, with the SSR function each is rendered by. The
// bundler turns that list into the real named exports; the emission itself is
// pinned in packages/bundler/test/tsrx-named-exports.test.ts.

const PARTS = `export function Card({ label }) @{
	<div class="card">{label}</div>
}
export function Badge({ text }) @{
	<span class="badge">{text}</span>
}`;

async function compileParts(source = PARTS) {
	const [parts] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/parts.tsrx', source },
	]);
	return parts!;
}

test('a module serving several components lists every one of them under its export name', async () => {
	const parts = await compileParts();

	expect(parts.publicRenderModule.ssrComponentExports).toEqual([
		{ exportName: 'Card', ssrFunctionName: 'marklessRenderSsr' },
		{ exportName: 'Badge', ssrFunctionName: 'marklessRenderSsrBadge' },
	]);
	expect(parts.publicRenderModule.ssrExportName).toBe('marklessRenderSsr');
});

test('the ssr function each entry names is declared in the ssr module source', async () => {
	// The bundler binds each published name to the surface built from these
	// functions, so an entry naming a function the module never declared would
	// emit a module that throws on load.
	const parts = await compileParts();
	const ssr = parts.publicRenderModule.ssrModuleSource;

	for (const component of parts.publicRenderModule.ssrComponentExports ?? []) {
		expect(ssr, `${component.ssrFunctionName} is declared`).toContain(
			`function ${component.ssrFunctionName}(`,
		);
	}
});

test('a module whose only component is its root still lists that name', async () => {
	// A single-component module is exactly what an app entry imports by name
	// (`import { Gallery } from './Gallery.tsrx'`), so withholding its entry
	// would leave that import unanswerable.
	const only = await compileParts(`export function Gallery() @{
	<main><h1>Gallery</h1></main>
}`);

	expect(only.publicRenderModule.ssrComponentExports).toEqual([
		{ exportName: 'Gallery', ssrFunctionName: 'marklessRenderSsr' },
	]);
});

test('the compiler publishes no named export of its own', async () => {
	// Emission lives at ONE place. A second producer here would collide with the
	// bundler's, and would still miss the client production module the compiler
	// never reaches.
	const ssr = (await compileParts()).publicRenderModule.ssrModuleSource;

	expect(ssr).not.toMatch(/^export const (Card|Badge) =/m);
});
