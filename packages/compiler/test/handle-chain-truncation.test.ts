import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

/**
 * A member chain THROUGH an `element()` handle keeps its tail.
 *
 * State lowering hands the whole chain to the emitter as ONE read: the record
 * for `measure(box.tagName.length)` covers all of `box.tagName.length`, with
 * `["tagName", "length"]` as its path. The handle lowering used to substitute
 * that whole recorded source, so the emitted module read
 * `measure(context.getElementHandle("element:box"))` — the element itself,
 * where the author asked for a number, and nothing anywhere said so. The tail is
 * rebuilt onto the handle call now, and any tail this band cannot spell as plain
 * dots fails the compile rather than shipping a wrong value.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Handles.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

test('a property chain off a singular handle survives the lowering', async () => {
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => measure(box.tagName.length)}>measure</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);
	// Only the first hop is optional: the registry can answer `undefined` for a
	// handle whose element never mounted, and `tagName` is an ordinary property
	// of whatever it does answer.
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			'measure(context.getElementHandle("element:box")?.tagName.length)',
		),
	]);
});

test('the planned record carries the property path beside the handle', async () => {
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => measure(box.tagName.length)}>measure</button>
	</div>
}
`);

	const handler = result.symbolResolver.symbols.find(
		(symbol) => symbol.kind === 'event-handler',
	);
	expect(handler?.kind === 'event-handler' ? handler.elementHandleReads : undefined).toEqual([
		{
			source: 'box.tagName.length',
			handleId: 'element:box',
			handleName: 'box',
			path: ['tagName', 'length'],
		},
	]);
});

test('a plural handle reads its length through the handle, not instead of it', async () => {
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = element<HTMLLIElement[]>();

	<ul>
		<li el={rows}>row</li>
		<button onClick={() => measure(rows.length)}>measure</button>
	</ul>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('measure(context.getElementHandle("element:rows")?.length)'),
	]);
});

test('an indexed read off a plural handle fails the compile instead of reading undefined', async () => {
	// `rows[0].id` reaches the emitter with `["0", "id"]` as its path, and `?.0.id`
	// is not JavaScript. Falling through to the graph read would emit
	// `graph.read("element:rows", ["0", "id"])`, which answers `undefined` at the
	// first click with nothing to say so, so the authored name is left standing
	// and the unresolved-reference guard fails the build naming it.
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = element<HTMLLIElement[]>();

	<ul>
		<li el={rows}>row</li>
		<button onClick={() => measure(rows[0].id)}>measure</button>
	</ul>
}
`);

	const codes = result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code);
	expect(codes).toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
	expect(
		result.symbolModules.diagnostics.every((diagnostic) => diagnostic.severity === 'error'),
	).toBe(true);
	expect(eventSymbolSources(result)).toEqual([expect.not.stringContaining('getElementHandle')]);
});

test('an optional indexed read off a plural handle fails the compile too', async () => {
	const result = await compile(`
import { element } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	const rows = element<HTMLLIElement[]>();

	<ul>
		<li el={rows}>row</li>
		<button onClick={() => measure(rows[0]?.id)}>measure</button>
	</ul>
}
`);

	const codes = result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code);
	expect(codes).toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
});

test('a chain on the right-hand side of a state write keeps its tail', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';

export function Page() @{
	const box = element<HTMLDivElement>();
	const s = state({ width: 0 });

	<div>
		<div el={box}>box</div>
		<button onClick={() => { s.width = box.clientWidth; }}>measure</button>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			'value: context.getElementHandle("element:box")?.clientWidth',
		),
	]);
});

test('a chain inside a template literal keeps its tail', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';

export function Page() @{
	const box = element<HTMLDivElement>();
	const s = state({ label: '' });

	<div>
		<div el={box}>box</div>
		<button onClick={() => { s.label = \`tag \${box.tagName.length}\`; }}>measure</button>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			'`tag ${context.getElementHandle("element:box")?.tagName.length}`',
		),
	]);
});

test('a chain through a shared() instance member names the handle, not the instance', async () => {
	// The recorded source is `t.panelEl.tagName.length`: the root that carries the
	// handle is two segments long, so splitting the tail off by path length has to
	// land on `t.panelEl` and not on `t`. Landing on `t` would emit
	// `getElementHandle(...)?.panelEl.tagName.length`, a property hung on the DOM
	// element instead of on the instance.
	const result = await compile(`
import { element, shared, state } from '@markless/core';
import { measure } from './measure.ts';

export const tabs = shared(
	() => {
		const t = state({ hits: 0 });
		const panelEl = element<HTMLDivElement>();
		return { ...t, panelEl };
	},
	{ scope: 'widget' },
);

export function Panel() @{
	const t = tabs();
	<div el={t.panelEl}>panel</div>
}

export function Trigger() @{
	const t = tabs();
	<button onClick={() => measure(t.panelEl.tagName.length)}>poke</button>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining(
			'context.getElementHandle("shared:src/Handles.tsrx#tabs/element:panelEl")?.tagName.length',
		),
	]);
});

test('a bare handle read still lowers to the handle alone', async () => {
	// The tail rebuild must not put an empty optional chain on the read that has
	// no tail: `openOverlay(contentEl)` hands over the element itself.
	const result = await compile(`
import { element } from '@markless/core';
import { openOverlay } from './overlay.ts';

export function Page() @{
	const contentEl = element<HTMLDivElement>();

	<div>
		<div el={contentEl}>content</div>
		<button onClick={() => openOverlay(contentEl)}>open</button>
	</div>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('openOverlay(context.getElementHandle("element:contentEl"))'),
	]);
});
