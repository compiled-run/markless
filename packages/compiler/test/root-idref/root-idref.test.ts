import { expect, test } from 'vitest';
import { buildSemanticGraph } from '../../src/index.ts';

// The element that CARRIES a family's role is routinely the component that roots
// that family's widget-scoped factory - a recursive `menu.item`. Both ends of an
// IDREF between that root element and a part it seeds have to resolve, because
// the rooting component is the first thing that can know the instance token.

async function graphOf(name: string, source: string) {
	return await buildSemanticGraph({ filename: `src/${name}.tsrx`, source });
}

const codes = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.diagnostics.map((diagnostic) => diagnostic.code);

const idSlots = (graph: Awaited<ReturnType<typeof buildSemanticGraph>>) =>
	graph.markup.chunks.flatMap((chunk) =>
		chunk.slots.flatMap((slot) =>
			slot.kind === 'attribute' && slot.residue.kind === 'element-handle-id'
				? [[slot.name, slot.residue.handleGraphNodeId]]
				: [],
		),
	);

const ROOT_AND_PART = `import { element, shared, state } from '@markless/core';
export const wid = shared(() => {
	const w = state({ open: false });
	const rootEl = element<HTMLDivElement>();
	const panelEl = element<HTMLDivElement>();
	return { ...w, rootEl, panelEl };
}, { scope: 'widget' });
export function Root({ children }: { children?: unknown }) @{
	const s = wid();
	<div role="button" el={s.rootEl} aria-controls={s.panelEl}>{children}</div>
}
export function Panel({ children }: { children?: unknown }) @{
	const s = wid();
	<div role="region" el={s.panelEl} aria-labelledby={s.rootEl}>{children}</div>
}`;

test('a widget root names a part it seeds, and that part names the root back', async () => {
	const graph = await graphOf('RootIdref', ROOT_AND_PART);

	expect(codes(graph)).toEqual([]);
	expect(idSlots(graph)).toEqual([
		['id', 'shared:src/RootIdref.tsrx#wid/element:rootEl'],
		['aria-controls', 'shared:src/RootIdref.tsrx#wid/element:panelEl'],
		['id', 'shared:src/RootIdref.tsrx#wid/element:panelEl'],
		['aria-labelledby', 'shared:src/RootIdref.tsrx#wid/element:rootEl'],
	]);
	// Both directions are recorded relationships, not value bindings.
	expect(
		graph.elementHandleIdrefs.map((idref) => [idref.attributeName, idref.handleName]),
	).toEqual([
		['aria-controls', 'panelEl'],
		['aria-labelledby', 'rootEl'],
	]);
});

test('a page-wide shared() handle is still refused: one element per page is not one per widget', async () => {
	const graph = await graphOf(
		'PageSharedRootIdref',
		`import { element, shared, state } from '@markless/core';
export const wid = shared(() => {
	const w = state({ open: false });
	const panelEl = element<HTMLDivElement>();
	return { ...w, panelEl };
});
export function Root({ children }: { children?: unknown }) @{
	const s = wid();
	<div role="button" aria-controls={s.panelEl}>{children}</div>
}
export function Panel() @{
	const s = wid();
	<div role="region" el={s.panelEl} />
}`,
	);

	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT');
	expect(graph.elementHandleIdrefs).toEqual([]);
});

test('an IDREF naming a handle nothing binds is still refused', async () => {
	const graph = await graphOf(
		'UnboundRootIdref',
		`import { element, shared, state } from '@markless/core';
export const wid = shared(() => {
	const w = state({ open: false });
	const panelEl = element<HTMLDivElement>();
	return { ...w, panelEl };
}, { scope: 'widget' });
export function Root({ children }: { children?: unknown }) @{
	const s = wid();
	<div role="button" aria-controls={s.panelEl}>{children}</div>
}`,
	);

	expect(codes(graph)).toContain('MARKLESS_ELEMENT_HANDLE_IDREF_UNBOUND');
	expect(graph.elementHandleIdrefs).toEqual([]);
});
