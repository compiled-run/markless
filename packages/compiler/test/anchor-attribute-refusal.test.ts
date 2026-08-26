import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';

// `anchorName=` / `positionAnchor=` are CSS properties spelled as attributes,
// and CSS properties are not attributes. The compiler refuses both loudly
// instead of lowering them: anchoring is declared in a <style> block or a
// stylesheet like any other style.
//
// The refusal matters more than silence would: HTML lowercases an unknown
// attribute, so a pass-through would put `anchorname="..."` on the element,
// where no browser reads it and the popup lands against its containing block
// looking merely misplaced.

const FAMILY = `
import { element, shared, state } from '@markless/core';

export const select = shared(() => {
	const s = state({ open: false });
	const triggerEl = element<HTMLButtonElement>();
	return { ...s, triggerEl };
}, { scope: 'widget' });

export function Root({ open = false, children }) @{
	const sel = select();
	sel.open = open;

	<div data-root>{children}</div>
}
`;

async function graphOf(source: string) {
	return await buildSemanticGraph({ filename: 'src/spike.tsrx', source });
}

async function compile(source: string) {
	return await compileTsrxModule({
		filename: 'src/spike.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

type Graph = Awaited<ReturnType<typeof buildSemanticGraph>>;

const codes = (graph: Graph) => graph.diagnostics.map((diagnostic) => diagnostic.code);
const statics = (graph: Graph) =>
	graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('');

test.each(['anchorName', 'positionAnchor'])('%s on an element is refused', async (attribute) => {
	const graph = await graphOf(`${FAMILY}
export function Trigger() @{
	const sel = select();

	<button type="button" el={sel.triggerEl} ${attribute}={sel.triggerEl}>open</button>
}
`);

	expect(codes(graph)).toEqual(['MARKLESS_CSS_ANCHOR_ATTRIBUTE']);
	const [diagnostic] = graph.diagnostics;
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toBe(
		`Cannot write ${attribute} as an attribute. CSS anchoring is regular CSS - declare anchor-name/position-anchor in a <style> block or your stylesheet.`,
	);
	// Refused, and also never written: a refusal the emitter ignored would still
	// reach the page as an attribute nothing reads.
	expect(statics(graph).toLowerCase()).not.toContain(attribute.toLowerCase());
});

test('a literal anchor value is refused rather than written as an attribute', async () => {
	const graph = await graphOf(`export function App() @{
	<div anchorName="--mine">body</div>
}`);

	expect(codes(graph)).toEqual(['MARKLESS_CSS_ANCHOR_ATTRIBUTE']);
	expect(statics(graph)).not.toContain('--mine');
});

test('an anchor attribute on a component tag is refused the same way', async () => {
	const graph = await graphOf(`import { element } from '@markless/core';
export function Inner() @{ <div>x</div> }
export function App() @{
	const triggerEl = element<HTMLButtonElement>();
	<section>
		<button el={triggerEl}>open</button>
		<Inner positionAnchor={triggerEl} />
	</section>
}`);

	expect(codes(graph)).toEqual(['MARKLESS_CSS_ANCHOR_ATTRIBUTE']);
});

test('anchoring declared as CSS compiles clean', async () => {
	const graph = await graphOf(`export function App() @{
	<section>
		<button style="anchor-name: --trigger">open</button>
		<div style="position-anchor: --trigger">body</div>
	</section>
}`);

	expect(codes(graph)).toEqual([]);
	expect(statics(graph)).toContain('anchor-name: --trigger');
});

test('no module carries an anchor branch in its compiled residue reader', async () => {
	const compiled = await compile(`import { element } from '@markless/core';
export function App() @{
	const headingEl = element<HTMLHeadingElement>();
	<section>
		<h2 el={headingEl}>Terms</h2>
		<div aria-labelledby={headingEl}>body</div>
	</section>
}`);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	// The minted-id spelling stays; the anchor spelling has no producer left.
	expect(source).toContain("if(residue.kind==='element-handle-id')");
	expect(source).not.toContain('element-handle-anchor-style');
	expect(source).not.toContain('anchor-name');
});
