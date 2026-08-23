import { expect, test } from 'vitest';
import { renderSsrData, type SsrDataResidue } from '../src/ssr-data/renderer.ts';

// `anchorName={handle}` / `positionAnchor={handle}` lower to one inline style
// residue per element. This is the renderer the CSR/prerender path and the
// server path share, so what it produces here is what both put on the page.
//
// The residue carries the CSS property and the handle; the compiled reader
// spells the `--mx-<slug>` name. That reader is the compiler's, so this file
// stands in for it and measures the RENDERER's half: one style attribute per
// element, value taken verbatim from the reader, consumer declarations
// included.

const HANDLE = 'shared:src/select.tsrx#select/element:triggerEl';

/**
 * The compiler's mint, restated by hand: `'--mx-' + (widgetInstanceToken +
 * handleGraphNodeId).replace(/\W+/g, '-')`. anchor-attribute-lowering.test.ts
 * in @markless/compiler pins the emitted spelling; this side only needs a value
 * to render.
 */
function anchorName(widgetInstance: string, handleGraphNodeId: string): string {
	return `--mx-${(widgetInstance + handleGraphNodeId).replace(/\W+/g, '-')}`;
}

function read(residue: SsrDataResidue): unknown {
	if (residue.kind !== 'element-handle-anchor-style')
		throw new Error(`unexpected residue: ${residue.kind}`);
	const declarations = residue.declarations.map(
		(entry) => `${entry.property}:${anchorName('c0:', entry.handleGraphNodeId)}`,
	);
	return [...(residue.staticStyle ? [residue.staticStyle] : []), ...declarations].join(';');
}

async function renderTrigger(residue: SsrDataResidue) {
	return await renderSsrData({
		renderData: {
			root: { componentName: 'Trigger', templateId: 'template:Trigger' },
			chunks: [
				{
					id: 'template:Trigger',
					kind: 'template',
					componentName: 'Trigger',
					statics: ['<button type="button" style="', '">open</button>'],
					hosts: [],
					slots: [
						{
							kind: 'attribute',
							name: 'style',
							alwaysPresent: true,
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0] },
							residue,
						},
					],
				},
			],
			boundaries: [],
			repeats: [],
		},
		read,
	});
}

test('one anchor declaration renders as one inline style property', async () => {
	const output = await renderTrigger({
		kind: 'element-handle-anchor-style',
		declarations: [{ property: 'anchor-name', handleGraphNodeId: HANDLE }],
	});

	expect(output.html).toBe(
		'<button type="button" style="anchor-name:--mx-c0-shared-src-select-tsrx-select-element-triggerEl">open</button>',
	);
	// One style attribute, not two: a second one would be dropped by the parser
	// without saying so.
	expect(output.html.match(/ style="/g)).toHaveLength(1);
});

test('a consumer style composes in front of the anchor declarations', async () => {
	const output = await renderTrigger({
		kind: 'element-handle-anchor-style',
		staticStyle: 'color:red',
		declarations: [
			{ property: 'anchor-name', handleGraphNodeId: HANDLE },
			{ property: 'position-anchor', handleGraphNodeId: 'shared:src/select.tsrx#select/element:contentEl' },
		],
	});

	// The consumer's declarations survive, and the anchor names come last so
	// they win the cascade - they are plumbing, not design.
	expect(output.html).toBe(
		'<button type="button" style="color:red;anchor-name:--mx-c0-shared-src-select-tsrx-select-element-triggerEl;position-anchor:--mx-c0-shared-src-select-tsrx-select-element-contentEl">open</button>',
	);
	expect(output.html.match(/ style="/g)).toHaveLength(1);
});

test('the rendered value stays a valid CSS dashed-ident after HTML escaping', async () => {
	const output = await renderTrigger({
		kind: 'element-handle-anchor-style',
		declarations: [{ property: 'position-anchor', handleGraphNodeId: HANDLE }],
	});

	const value = /style="([^"]*)"/.exec(output.html)?.[1] ?? '';
	// Nothing in the composed value needs escaping, so what the browser parses
	// is exactly what the reader minted - which is what makes the CSS match the
	// anchor-name declared on the other element.
	expect(value).toBe(`position-anchor:${anchorName('c0:', HANDLE)}`);
	expect(value.split(':')[1]).toMatch(/^--[A-Za-z0-9-]+$/);
});

test('a widget-scoped anchor name differs per rendered instance', async () => {
	const residue: SsrDataResidue = {
		kind: 'element-handle-anchor-style',
		declarations: [{ property: 'anchor-name', handleGraphNodeId: HANDLE }],
	};
	const second = await renderSsrData({
		renderData: {
			root: { componentName: 'Trigger', templateId: 'template:Trigger' },
			chunks: [
				{
					id: 'template:Trigger',
					kind: 'template',
					componentName: 'Trigger',
					statics: ['<button style="', '"></button>'],
					hosts: [],
					slots: [
						{
							kind: 'attribute',
							name: 'style',
							alwaysPresent: true,
							staticIndex: 0,
							coordinate: { kind: 'child-index', path: [0] },
							residue,
						},
					],
				},
			],
			boundaries: [],
			repeats: [],
		},
		// The second rendered widget's instance token, which is the whole reason
		// the name is minted rather than authored.
		read: (value) =>
			value.kind === 'element-handle-anchor-style'
				? value.declarations
						.map((entry) => `${entry.property}:${anchorName('c1:', entry.handleGraphNodeId)}`)
						.join(';')
				: '',
	});
	const first = await renderTrigger(residue);
	expect(first.html).not.toBe(second.html);
});
