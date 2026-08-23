import { expect, test } from 'vitest';
import { buildSemanticGraph, compileTsrxModule } from '../src/index.ts';
import {
	elementHandleIdReadCase,
	MARKLESS_WIDGET_INSTANCE_KEY,
} from '../src/passes/public-render/residue-reader.ts';

// `anchorName={handle}` and `positionAnchor={handle}` are authored attribute
// positions that take an element() handle exactly like `aria-controls={handle}`
// does, and lower to INLINE STYLE declarations whose value is a second
// rendering of the same per-instance token the minted id renders:
//
//   aria-controls -> id="mx-<slug>"
//   anchorName    -> style="anchor-name:--mx-<slug>"
//
// One identity, two spellings, one compiled reader - so the trigger that
// declares the anchor and the popup that names it cannot disagree, on the
// server or in the browser.
//
// Neither of the other two carriers can do this job. A custom property
// inherits, so a select nested in a modal would silently pick up the outer
// widget's anchor; and CSS cannot cast an attribute string to a dashed-ident,
// so a `ui-*` attribute cannot carry the name at all.

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

export function Content({ children }) @{
	const sel = select();

	<div role="listbox" positionAnchor={sel.triggerEl}>{children}</div>
}
`;

function page(trigger: string) {
	return `${FAMILY}
export function Trigger() @{
	const sel = select();

	${trigger}
}

export function Page() @{
	<section>
		<Root open={true}>
			<Trigger />
			<Content>body</Content>
		</Root>
	</section>
}
`;
}

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

/** Every style slot in the file, as [statics-around-it, residue]. */
function styleSlots(graph: Graph) {
	return graph.markup.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'attribute' && slot.residue.kind === 'element-handle-anchor-style'
				? [
						{
							name: slot.name,
							alwaysPresent: slot.alwaysPresent,
							before: chunk.statics[slot.staticIndex] ?? '',
							after: chunk.statics[slot.staticIndex + 1] ?? '',
							residue: slot.residue,
						},
					]
				: [],
		),
	);
}

const PLAIN_TRIGGER = '<button type="button" el={sel.triggerEl} anchorName={sel.triggerEl}>open</button>';

test('both attributes record one anchor each, against the handle they name', async () => {
	const graph = await graphOf(page(PLAIN_TRIGGER));
	expect(codes(graph)).toEqual([]);
	expect(
		graph.elementHandleAnchors.map((anchor) => [
			anchor.attributeName,
			anchor.handleName,
			anchor.handleGraphNodeId,
		]),
	).toEqual([
		['positionAnchor', 'triggerEl', 'shared:src/spike.tsrx#select/element:triggerEl'],
		['anchorName', 'triggerEl', 'shared:src/spike.tsrx#select/element:triggerEl'],
	]);
	// The anchor did NOT force a minted id onto the trigger: CSS reads the name
	// off the element's own inline style, so an id here would be bytes nothing
	// reads. This is the one place the anchor record deliberately differs from
	// the IDREF record.
	expect(graph.elementHandleIdrefs).toEqual([]);
});

test('an anchor position lowers to an inline style declaration, not an attribute', async () => {
	const graph = await graphOf(page(PLAIN_TRIGGER));
	const slots = styleSlots(graph);

	expect(slots.map((slot) => [slot.name, slot.before.slice(-8), slot.after[0]])).toEqual([
		['style', ' style="', '"'],
		['style', ' style="', '"'],
	]);
	// One residue per element, carrying the CSS property and the handle. Nothing
	// in the markup spells the name itself.
	expect(slots.map((slot) => slot.residue.declarations)).toEqual([
		[
			{
				property: 'position-anchor',
				handleGraphNodeId: 'shared:src/spike.tsrx#select/element:triggerEl',
			},
		],
		[
			{
				property: 'anchor-name',
				handleGraphNodeId: 'shared:src/spike.tsrx#select/element:triggerEl',
			},
		],
	]);
	// The authored attribute name never reaches the HTML.
	const statics = graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('');
	expect(statics).not.toContain('anchorName');
	expect(statics.toLowerCase()).not.toContain('anchorname');
	expect(statics.toLowerCase()).not.toContain('positionanchor');
});

test('a consumer style on the same element composes into one style attribute', async () => {
	for (const trigger of [
		'<button el={sel.triggerEl} anchorName={sel.triggerEl} style="color:red">open</button>',
		'<button el={sel.triggerEl} anchorName={sel.triggerEl} style={{ color: \'red\' }}>open</button>',
	]) {
		const graph = await graphOf(page(trigger));
		expect(codes(graph)).toEqual([]);
		const anchorSlot = styleSlots(graph).find((slot) =>
			slot.residue.declarations.some((entry) => entry.property === 'anchor-name'),
		);
		// The consumer's declarations ride INSIDE the one residue rather than in a
		// second style attribute, which the parser would silently drop.
		expect(anchorSlot?.residue.staticStyle).toBe('color:red');
		const triggerChunk = graph.markup.chunks.find((chunk) => chunk.componentName === 'Trigger');
		expect(triggerChunk?.statics.join('').match(/ style="/g)).toHaveLength(1);
	}
});

test('a style the compiler cannot read at compile time refuses rather than clobbers', async () => {
	const graph = await graphOf(
		page(
			'<button el={sel.triggerEl} anchorName={sel.triggerEl} style={sel.open ? undefined : 1}>open</button>',
		),
	);
	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_ANCHOR_STYLE_DYNAMIC');
});

test('the SSR string renders both halves of the pair from one compiled slug', async () => {
	const compiled = await compile(page(PLAIN_TRIGGER));
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	// The anchor rendering prefixes the SAME sanitized slug the id rendering
	// uses, so the dashed-ident and the id can never name different instances.
	expect(source).toContain(
		"if(residue.kind==='element-handle-anchor-style')return (residue.staticStyle?residue.staticStyle+';':'')+residue.declarations.map(a=>a.property+':--mx-'+(",
	);
	expect(source).toContain(".replace(/\\W+/g,'-')).join(';');");
});

/**
 * The emitted mint, run. Both the server module and the client render-data
 * surface compile their reader from this one description, so evaluating it here
 * measures the string BOTH sides put in the HTML.
 */
function runMint(input: { readonly idPrefix: string; readonly widgetInstance?: string | null }) {
	const body = elementHandleIdReadCase({
		idPrefixSource: JSON.stringify(input.idPrefix),
		widgetInstanceSource:
			input.widgetInstance === undefined ? null : JSON.stringify(input.widgetInstance),
		kinds: { id: true, anchorStyle: true },
	});
	return new Function('residue', body) as (residue: unknown) => string | undefined;
}

test('the id and the anchor name are two spellings of one sanitized slug', () => {
	const mint = runMint({ idPrefix: 'c0:', widgetInstance: 'c0:' });
	const handleGraphNodeId = 'shared:src/spike.tsrx#select/element:triggerEl';

	const id = mint({ kind: 'element-handle-id', handleGraphNodeId });
	const style = mint({
		kind: 'element-handle-anchor-style',
		declarations: [{ property: 'anchor-name', handleGraphNodeId }],
	});

	expect(id).toBe('mx-c0-shared-src-spike-tsrx-select-element-triggerEl');
	// Same slug, `--` in front. The existing sanitizer already reduces it to
	// [A-Za-z0-9-], so this is always a valid CSS <dashed-ident>.
	expect(style).toBe('anchor-name:--mx-c0-shared-src-spike-tsrx-select-element-triggerEl');
	expect(style).toBe(`anchor-name:--${id}`);
	expect(style?.slice('anchor-name:'.length)).toMatch(/^--[A-Za-z0-9-]+$/);
});

test('the composed style puts the consumer first and both declarations after', () => {
	const mint = runMint({ idPrefix: 'c0:', widgetInstance: 'c0:' });
	expect(
		mint({
			kind: 'element-handle-anchor-style',
			staticStyle: 'color:red',
			declarations: [
				{ property: 'anchor-name', handleGraphNodeId: 'shared:f#s/element:a' },
				{ property: 'position-anchor', handleGraphNodeId: 'shared:f#s/element:b' },
			],
		}),
	).toBe(
		'color:red;anchor-name:--mx-c0-shared-f-s-element-a;position-anchor:--mx-c0-shared-f-s-element-b',
	);
});

test('two rendered widgets mint two different anchor names', () => {
	const handleGraphNodeId = 'shared:src/spike.tsrx#select/element:triggerEl';
	const residue = {
		kind: 'element-handle-anchor-style',
		declarations: [{ property: 'anchor-name', handleGraphNodeId }],
	};
	// The per-instance token is the whole point: a page with two selects would
	// otherwise declare one anchor-name twice, and CSS resolves a duplicate to
	// whichever element comes LAST in source order - silently.
	const first = runMint({ idPrefix: 'c0:', widgetInstance: 'c0:' })(residue);
	const second = runMint({ idPrefix: 'c0:', widgetInstance: 'c1:' })(residue);
	expect(first).not.toBe(second);
});

test('an anchor on a shared handle with no widget token throws rather than minting', () => {
	const mint = runMint({ idPrefix: 'c0:', widgetInstance: null });
	expect(() =>
		mint({
			kind: 'element-handle-anchor-style',
			declarations: [
				{ property: 'anchor-name', handleGraphNodeId: 'shared:f#s/element:a' },
			],
		}),
	).toThrow('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING: shared:f#s/element:a');
});

test('a part with no rooted widget instance refuses instead of minting a stray name', async () => {
	const compiled = await compile(page(PLAIN_TRIGGER));
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';

	// Same fail-closed guard the minted id has: a part rendered outside every
	// widget root has no instance token, and two widgets on one page sharing an
	// anchor name would silently anchor every popup to the last trigger.
	expect(source).toContain(
		`marklessSsrRenderStateValues.get(${JSON.stringify(MARKLESS_WIDGET_INSTANCE_KEY)})??(()=>{throw new Error('MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING: '+a.handleGraphNodeId)})()`,
	);
});

test('nesting depth does not change which handle either side spells', async () => {
	// The trigger nested one projection deeper than the content that names it:
	// defect 65's shape. Both sides still resolve to the one handle node, and the
	// token they prepend is the rendered widget's, not their own edge's.
	const nested = `${FAMILY}
export function Trigger() @{
	const sel = select();

	<button type="button" el={sel.triggerEl} anchorName={sel.triggerEl}>open</button>
}

export function Page() @{
	<section>
		<Root open={true}>
			<Content>
				<Trigger />
			</Content>
		</Root>
	</section>
}
`;
	const graph = await graphOf(nested);
	expect(codes(graph)).toEqual([]);
	expect(new Set(graph.elementHandleAnchors.map((anchor) => anchor.handleGraphNodeId))).toEqual(
		new Set(['shared:src/spike.tsrx#select/element:triggerEl']),
	);
});

test('an unbound handle in an anchor position stops the build', async () => {
	const graph = await graphOf(
		`import { element } from '@markless/core';
export function App() @{
	const triggerEl = element<HTMLButtonElement>();
	<div positionAnchor={triggerEl}>body</div>
}`,
	);
	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_ANCHOR_UNBOUND');
});

test('a value that is not one element() handle is refused, not written as an attribute', async () => {
	const graph = await graphOf(
		`export function App() @{
	<div anchorName="--mine">body</div>
}`,
	);
	expect(codes(graph)).toEqual(['MARKLESS_ELEMENT_HANDLE_ANCHOR_VALUE']);
	expect(graph.markup.chunks.map((chunk) => chunk.statics.join('')).join('')).not.toContain(
		'--mine',
	);
});

test('an anchor position on a component tag is refused', async () => {
	const graph = await graphOf(
		`import { element } from '@markless/core';
export function Inner() @{ <div>x</div> }
export function App() @{
	const triggerEl = element<HTMLButtonElement>();
	<section>
		<button el={triggerEl}>open</button>
		<Inner positionAnchor={triggerEl} />
	</section>
}`,
	);
	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_ANCHOR_HOST_REQUIRED');
});

test('a handle bound inside a keyed repeat cannot be an anchor', async () => {
	const graph = await graphOf(
		`import { element, state } from '@markless/core';
export function App() @{
	const s = state({ rows: [{ id: 1 }] });
	const rowEl = element<HTMLLIElement>();
	<section>
		<ul>
			@for (row of s.rows; key row.id) {
				<li el={rowEl}>{row.id}</li>
			}
		</ul>
		<div positionAnchor={rowEl}>body</div>
	</section>
}`,
	);
	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_ANCHOR_ROW_OWNED');
});

test('a module with no anchor position carries no anchor branch', async () => {
	const compiled = await compile(
		`import { element } from '@markless/core';
export function App() @{
	const headingEl = element<HTMLHeadingElement>();
	<section>
		<h2 el={headingEl}>Terms</h2>
		<div aria-labelledby={headingEl}>body</div>
	</section>
}`,
	);
	const source = compiled.publicRenderModule.ssrModuleSource ?? '';
	expect(source).toContain("if(residue.kind==='element-handle-id')");
	expect(source).not.toContain('element-handle-anchor-style');
});
