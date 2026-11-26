import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

/**
 * An `element()` handle read as a VALUE.
 *
 * State lowering resolves such a read to the element binding's graph node, and a
 * graph node is not where a DOM element lives: emitted as `graph.read` the
 * handler sees `undefined` and nothing says so. The `element-handle-read` record
 * the `symbol-resolver` pass now plans (consumed by `symbol-modules`, and by the
 * bundler's trigger-group slicer so the record ships with a staged page) makes
 * `symbol-modules` emit `context.getElementHandle(...)` instead, which the resume
 * registry answers with the live node.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Handles.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

test('a handle passed as a call argument reaches the callee as the element', async () => {
	const result = await compile(`
import { element } from '@markless/core';
import { openOverlay } from './overlay.ts';

export function Page() @{
	const contentEl = element<HTMLDivElement | undefined>();

	<div>
		<div el={contentEl}>content</div>
		<button onClick={() => openOverlay(contentEl, { modal: true })}>open</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('openOverlay(context.getElementHandle("element:contentEl")'),
	]);
});

test('a handle reached through a shared() instance resolves to that handle', async () => {
	const result = await compile(`
import { element, shared, state } from '@markless/core';

export const tabs = shared(
	() => {
		const t = state({ hits: 0 });
		const panelEl = element<HTMLDivElement | undefined>();
		return { ...t, panelEl };
	},
	{ scope: 'subtree' },
);

export function Panel() @{
	const t = tabs();
	<div el={t.panelEl}>panel</div>
}

export function Trigger() @{
	const t = tabs();
	<button onClick={() => { t.hits = t.hits + 1; t.panelEl.focus(); }}>poke</button>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	// The instance member is the handle, not a graph value: the write beside it
	// still lowers to a graph write, so only the handle read changed shape.
	const [source] = eventSymbolSources(result);
	expect(source).toContain(
		'context.getElementHandle("shared:src/Handles.tsrx#tabs/element:panelEl").focus()',
	);
	expect(source).toContain('context.graph.update(');
});

test('the planned symbol records the handle read beside the state reads', async () => {
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => measure(box)}>measure</button>
	</div>
}
`);

	const handler = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'event-handler',
	);
	expect(handler?.kind === 'event-handler' ? handler.elementHandleReads : undefined).toEqual([
		{ source: 'box', handleId: 'element:box', handleName: 'box', required: true },
	]);
});

test('a handle read inside a keyed row loses to the row local of the same name', async () => {
	// The row names its item `box` and the component names a handle `box`. The
	// row's identifier is the row's own item, so the handle lowering must not
	// claim it.
	//
	// What the row read lowers to INSTEAD was once a second defect here: name
	// resolution resolved the row local to the element binding's graph node, so
	// the row handler emitted `graph.read("element:box")` with or without the
	// handle lowering. That gap is closed upstream in `collect-expressions`, and
	// `repeat-row-shadowing.test.ts` pins it; this test stays on the one question
	// it owns, which is that the handle lowering declines the name.
	const result = await compile(`
import { element, state } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = state([{ id: 'a', label: 'Alpha' }]);
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		@for (const box of rows; key box.id) {
			<button onClick={() => measure(box)}>row</button>
		}
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	const sources = eventSymbolSources(result);
	expect(sources).toHaveLength(1);
	// The row's own `box` is the item the row was built from, never the handle.
	expect(sources[0]).not.toContain('getElementHandle');
});

test('a handle read under a computed key lowers the handle and the key apart', async () => {
	// The handle is one value however it is keyed, so the read lands on `box` and
	// the key is lowered on its own, here to the inlined constant.
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const box = element<HTMLDivElement | undefined>();
	const key = 'tagName';

	<div>
		<div el={box}>box</div>
		<button onClick={() => measure(box[key])}>measure</button>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(`measure(context.getElementHandle("element:box")['tagName'])`),
	]);
});

test('a handle under a method call on a built value is named, not refused', async () => {
	// `[box].map(...)` calls a method on a value the expression just built, so the
	// read belongs to `box` inside it. Recording the read at the whole
	// `[box].map` chain instead left the authored identifier standing and the
	// compile failed closed; the receiver descent names the handle here.
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const box = element<HTMLDivElement | undefined>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => measure([box].map((node) => node.tagName))}>measure</button>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('[context.getElementHandle("element:box")].map('),
	]);
});
