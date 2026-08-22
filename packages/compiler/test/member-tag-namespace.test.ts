import { expect, test } from 'vitest';
import { compileTsrxModulesWithInterfaces } from './multi-module-compile-support.ts';

// A namespace member tag (<parts.Card />) over a sibling .tsrx module asks WHICH
// component of that module composes here. Answering "the module" instead of "the
// component it named" cost the composed child its identity: the module's root
// rendered in every part's place, and the enclosing module withheld its own
// component surface, so the name a parent used to reach it went unanswered.

const PARTS = `export function Card({ label }) @{
	<div class="card">{label}</div>
}
export function Badge({ text }) @{
	<span class="badge">{text}</span>
}`;

async function compileGallery(gallery: string) {
	const [parts, result] = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/parts.tsrx', source: PARTS, importSource: './parts.tsrx' },
		{ filename: 'src/Gallery.tsrx', source: gallery },
	]);
	return { parts: parts!, gallery: result! };
}

const namedPartsOf = (ssrModuleSource: string) =>
	[...ssrModuleSource.matchAll(/marklessSsrComponentPart\([^,]+,"([^"]+)"\)/g)].map(
		(match) => match[1],
	);

test('a namespace member tag composes the part it names, not the module root', async () => {
	// Badge is not the module's root component, so taking the module surface
	// whole renders Card in its place.
	const { gallery } = await compileGallery(`import * as parts from './parts.tsrx';
export function Gallery() @{
	<section><parts.Badge text="New" /></section>
}`);

	expect(gallery.semanticGraph.diagnostics).toEqual([]);
	expect(gallery.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({
			childComponentName: 'Badge',
			importSource: './parts.tsrx',
			importKind: 'namespace',
		}),
	]);
	expect(namedPartsOf(gallery.publicRenderModule.ssrModuleSource)).toContain('Badge');
});

test('a namespace member tag names the same part a named import of it names', async () => {
	const member = await compileGallery(`import * as parts from './parts.tsrx';
export function Gallery() @{
	<section><parts.Badge text="New" /></section>
}`);
	const named = await compileGallery(`import { Badge } from './parts.tsrx';
export function Gallery() @{
	<section><Badge text="New" /></section>
}`);

	expect(namedPartsOf(member.gallery.publicRenderModule.ssrModuleSource)).toEqual(
		namedPartsOf(named.gallery.publicRenderModule.ssrModuleSource),
	);
	expect(namedPartsOf(named.gallery.publicRenderModule.ssrModuleSource)).toEqual(['Badge']);
});

test('a module that composes a member tag still publishes its own component surface', async () => {
	// The enclosing component's export is what a composing page names to reach
	// it. A single-component module used to withhold it entirely.
	const { gallery } = await compileGallery(`import * as parts from './parts.tsrx';
export function Gallery() @{
	<section><parts.Card label="Alpha" /></section>
}`);

	expect(gallery.semanticGraph.diagnostics).toEqual([]);
	expect(gallery.publicRenderModule.ssrComponentExports).toEqual([
		{ exportName: 'Gallery', ssrFunctionName: 'marklessRenderSsr' },
	]);
});

test('a multi-component module publishes every component under its export name', async () => {
	const { parts } = await compileGallery(`import * as parts from './parts.tsrx';
export function Gallery() @{
	<section><parts.Card label="Alpha" /></section>
}`);

	expect(parts.publicRenderModule.ssrComponentExports).toEqual([
		{ exportName: 'Card', ssrFunctionName: 'marklessRenderSsr' },
		{ exportName: 'Badge', ssrFunctionName: 'marklessRenderSsrBadge' },
	]);
});

test('a member tag naming a part the linked module does not serve is a loud error', async () => {
	// Fail closed: the module answered and has no such component, so this is a
	// fact at compile time, not a link that has yet to happen. Emitting it would
	// compile to a named read the bundler rejects with MISSING_EXPORT.
	const { gallery } = await compileGallery(`import * as parts from './parts.tsrx';
export function Gallery() @{
	<section><parts.Nope /></section>
}`);

	const diagnostic = gallery.semanticGraph.diagnostics.find(
		(item) => item.code === 'MARKLESS_COMPONENT_TAG_UNRESOLVED',
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('parts.Nope');
	expect(diagnostic?.message).toContain('./parts.tsrx');
	expect(diagnostic?.why).toContain('Card');
	expect(diagnostic?.primarySpan?.filename).toBe('src/Gallery.tsrx');
});

test('an unlinked member tag stays deferred, because the module has not answered yet', async () => {
	// No interface for './unknown.tsrx' means the compiler cannot know what it
	// serves. Erroring here would fail a module purely for compile order.
	const [result] = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/Gallery.tsrx',
			source: `import * as parts from './unknown.tsrx';
export function Gallery() @{
	<section><parts.Card label="Alpha" /></section>
}`,
		},
	]);

	expect(result!.semanticGraph.diagnostics).toEqual([]);
	expect(result!.semanticGraph.componentEdges).toEqual([
		expect.objectContaining({ childComponentName: 'parts.Card', importKind: 'namespace' }),
	]);
});
