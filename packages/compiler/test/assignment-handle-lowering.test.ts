import { expect, test } from 'vitest';
import { compileTsrxModule, parseJavaScriptModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

/**
 * Handle reads and write targets on the two paths a handler body splits into.
 *
 * A handler's statements are walked by `rewriteEventHandlerNode`; the RIGHT-HAND
 * SIDE of a state write is not — it goes through the value band
 * (`valueExpressionNode` / `rewriteGraphReadsAndLocals`), which is a separate
 * lowering. Defect 61 is what that split cost:
 *
 * 1. `modal.opened = openOverlay(contentEl, ...)` lowered the handle to
 *    `graph.read("element:contentEl")`, because only the handler walk knew about
 *    handles. State lowering resolves a handle read to the element binding's
 *    graph node, and a graph node holds no DOM element, so the callee was handed
 *    `undefined` and nothing said so.
 *
 * 2. An assignment the upstream lowering records no write for — a nested arrow
 *    over a `const` scalar is one such shape — was walked generically, and the
 *    walk rewrote the assignment's own TARGET as a value read:
 *    `context.graph.read("state:modalDismissals") = ...`. That is not a legal
 *    assignment target, so the emitted module did not even parse — which is also
 *    why the read-back check that exists to catch unlowered state names went
 *    quiet, since it cannot reparse a broken module.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Handles.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

test('a handle on the right of a state assignment reaches the callee as the element', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';
import { openOverlay } from './overlay.ts';

export function Page() @{
	const modal = state({ opened: null });
	const contentEl = element<HTMLDivElement>();

	<div>
		<div el={contentEl}>content</div>
		<button onClick={() => { modal.opened = openOverlay(contentEl, { modal: true }); }}>open</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).toContain('openOverlay(context.getElementHandle("element:contentEl")');
	// The write around it is still a graph write; only the handle changed shape.
	expect(source).toContain('context.graph.write(');
	expect(source).not.toContain('context.graph.read("element:contentEl")');
});

test('a handle on the right of a compound assignment lowers the same way', async () => {
	// A compound write takes a different branch of `loweredEventWriteNode` — it
	// builds a graph UPDATE around the value rather than a write — so the value
	// band has to know about handles on that branch too.
	const result = await compile(`
import { element, state } from '@markless/core';
import { widthOf } from './measure.ts';

export function Page() @{
	let total = state(0);
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => { total += widthOf(box); }}>add</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).toContain('widthOf(context.getElementHandle("element:box"))');
	expect(source).not.toContain('context.graph.read("element:box")');
});

test('a handle passed to a call inside a nested arrow is still the element', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';
import { measure } from './measure.ts';

export function Page() @{
	let hits = state(0);
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => { queueMicrotask(() => { measure(box); }); }}>go</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);
	expect(eventSymbolSources(result)).toEqual([
		expect.stringContaining('measure(context.getElementHandle("element:box"))'),
	]);
});

test('a state write inside a nested arrow lowers to a graph write beside the handle', async () => {
	// Both halves of the defect in one body: the outer call takes the handle and
	// the nested arrow writes state. The upstream lowering records this write, so
	// the target IS lowered and the module needs no refusal.
	const result = await compile(`
import { element, state } from '@markless/core';
import { openOverlay } from './overlay.ts';

export function Page() @{
	let dismissals = state(0);
	const contentEl = element<HTMLDivElement>();

	<div>
		<div el={contentEl}>content</div>
		<button onClick={() => { openOverlay(contentEl, { onDismiss: () => { dismissals = dismissals + 1; } }); }}>open</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).toContain('openOverlay(context.getElementHandle("element:contentEl")');
	expect(source).toContain('context.graph.write({ graphNodeId: "state:dismissals"');
	expect(source).not.toContain('context.graph.read("state:dismissals") =');
	expect(() => parseJavaScriptModule(source ?? '')).not.toThrow();
});

test('a write the lowering records nothing for fails the compile instead of emitting invalid JS', async () => {
	// A `const` scalar reassigned inside a nested arrow: the upstream lowering
	// records the READ and no write at all. The walk must not lower the target as
	// a read — that emitted `context.graph.read(...) = ...`, which is not even
	// parseable, so it shipped and the read-back check could not see it.
	const result = await compile(`
import { element, state } from '@markless/core';
import { openOverlay } from './overlay.ts';

export function Page() @{
	const modalDismissals = state(0);
	const contentEl = element<HTMLDivElement>();

	<div>
		<div el={contentEl}>content</div>
		<button onClick={() => { openOverlay(contentEl, { onDismiss: () => { modalDismissals = modalDismissals + 1; } }); }}>open</button>
	</div>
}
`);

	const codes = result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code);
	expect(codes).toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
	expect(
		result.symbolModules.diagnostics.every((diagnostic) => diagnostic.severity === 'error'),
	).toBe(true);

	// The refusal is what makes that error reachable: the target keeps the name the
	// author wrote, so the module parses and the read-back check can see it. The
	// handle beside it still lowers.
	const [source] = eventSymbolSources(result);
	expect(source).not.toContain('context.graph.read("state:modalDismissals") =');
	expect(source).toContain('openOverlay(context.getElementHandle("element:contentEl")');
	expect(() => parseJavaScriptModule(source ?? '')).not.toThrow();
});

test('a computed key inside a refused write target is still lowered', async () => {
	// Only the reference SPINE of an unclaimed target is left alone. A computed
	// key is an ordinary value read and must still lower — refusing the whole
	// target subtree would leave a second unlowered name in the module.
	const result = await compile(`
import { state } from '@markless/core';
import { schedule } from './schedule.ts';

export function Page() @{
	const rows = state(['a', 'b']);
	const index = state(0);

	<button onClick={() => { schedule(() => { rows[index] = index; }); }}>set</button>
}
`);

	const [source] = eventSymbolSources(result);
	// The key lowered; the spine `rows` did not, which is what fails the compile.
	expect(source).toContain('rows[context.graph.read("state:index")]');
	expect(result.symbolModules.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(() => parseJavaScriptModule(source ?? '')).not.toThrow();
});

test('a statement-position handle call is untouched by the target refusal', async () => {
	const result = await compile(`
import { element, state } from '@markless/core';

export function Page() @{
	let hits = state(0);
	const box = element<HTMLDivElement>();

	<div>
		<div el={box}>box</div>
		<button onClick={() => { box.focus(); hits = hits + 1; }}>go</button>
	</div>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).toContain('context.getElementHandle("box")?.focus()');
	// The handler's own write is claimed by the write lowering, not refused.
	expect(source).toContain('context.graph.write(');
	expect(source).not.toMatch(/\bhits\s*=/);
});
