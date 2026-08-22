import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A compiled `.tsrx` module is consumed by plain ESM as well as by member tags:
// a `.ts` barrel writes `export { CheckboxRoot as root } from './checkbox.tsrx'`
// and an app writes `import { Gallery } from './Gallery.tsrx'`. Both are named
// reads the bundler resolves at link time. Publishing components only on the
// default export's `renderSsrComponents` map answered neither, so the barrel
// failed with MISSING_EXPORT and the browser reported "does not provide an
// export named". These pin the emitted shape of the named exports and that the
// default export's map is untouched beside them.

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

const namedExportsOf = (ssrModuleSource: string) =>
	[...ssrModuleSource.matchAll(/^export const (\w+) = \{ renderSsr: (\w+) \};$/gm)].map(
		(match) => [match[1], match[2]] as const,
	);

test('every exported component of a compiled module is a real ES named export', async () => {
	const parts = await compileParts();

	expect(namedExportsOf(parts.publicRenderModule.ssrModuleSource)).toEqual([
		['Card', 'marklessRenderSsr'],
		['Badge', 'marklessRenderSsrBadge'],
	]);
});

test('a named export is bound to the same per-component surface the map publishes', async () => {
	// `marklessSsrComponentPart` hands a composed child `{ renderSsr }` for the
	// part it names. A named import that resolved to a bare function instead
	// would lose the part identity every compose seam reads through.
	const parts = await compileParts();
	const ssr = parts.publicRenderModule.ssrModuleSource;

	for (const component of parts.publicRenderModule.ssrComponentExports ?? []) {
		expect(namedExportsOf(ssr)).toContainEqual([
			component.exportName,
			component.ssrFunctionName,
		]);
	}
	// Not a bare function: `export { marklessRenderSsrBadge as Badge }` would
	// link and then compose without a surface.
	expect(ssr).not.toMatch(/export \{ marklessRenderSsr\w* as \w+ \}/);
});

test('the default export map the bundler reads is unchanged beside the named exports', async () => {
	const parts = await compileParts();

	expect(parts.publicRenderModule.ssrComponentExports).toEqual([
		{ exportName: 'Card', ssrFunctionName: 'marklessRenderSsr' },
		{ exportName: 'Badge', ssrFunctionName: 'marklessRenderSsrBadge' },
	]);
	expect(parts.publicRenderModule.ssrExportName).toBe('marklessRenderSsr');
});

test('the ssr functions a named export binds are declared in the same module', async () => {
	// The export statements are appended to the SSR module source, so every name
	// they bind has to be declared above them or the module throws on load.
	const ssr = (await compileParts()).publicRenderModule.ssrModuleSource;

	for (const [, functionName] of namedExportsOf(ssr)) {
		const declaration = ssr.indexOf(`function ${functionName}(`);
		expect(declaration, `${functionName} is declared`).toBeGreaterThanOrEqual(0);
		expect(declaration).toBeLessThan(ssr.indexOf(`export const `));
	}
});

test('a module whose only component is its root still publishes that name', async () => {
	// A single-component module is exactly what an app entry imports by name
	// (`import { Gallery } from './Gallery.tsrx'`).
	const only = await compileParts(`export function Gallery() @{
	<main><h1>Gallery</h1></main>
}`);

	expect(only.publicRenderModule.ssrComponentExports).toEqual([
		{ exportName: 'Gallery', ssrFunctionName: 'marklessRenderSsr' },
	]);
});
