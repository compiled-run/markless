import { expect, test } from 'vitest';
import { compileTsrxModule, parseJavaScriptModule } from '../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../src/passes/symbol-modules.ts';

/**
 * Routing a CALLBACK from a handler into a runtime function's options object,
 * when that callback touches a shared() widget instance.
 *
 * `openOverlay(surface, { onDismiss: () => modal.setOpen(false) })` is the shape
 * every overlaid family needs — it is how the family learns the primitive closed
 * the surface — and defect 66 is that no spelling of it worked. A shared
 * instance exists only inside its factory, so a handler that CALLS one of its
 * methods is compiled by copying that method's body into the handler module.
 * Three things stopped that copy from reaching a nested callback:
 *
 * 1. the same method called twice in one handler — once in the body, once in the
 *    callback — is copied twice, but the lowering records the write inside it
 *    once. The first copy consumed that record and the second was left naming the
 *    factory-local instance: `ReferenceError` on the first dismiss.
 * 2. the check that exists to catch exactly that reparsed the emitted module as
 *    plain JavaScript. A copied method keeps the author's TypeScript parameter
 *    annotations, so the reparse threw and the check claimed nothing — which is
 *    why 1 shipped silently.
 * 3. a method that dispatches to a consumer callback is copied as an awaited
 *    async body, and `await` cannot stand in the synchronous callback the author
 *    wrote. That refusal abandoned every call site of the method, not just the
 *    nested one, so even the handler's own top-level call stopped lowering.
 *
 * The spellings that remain unsupported — a method read as a VALUE rather than
 * called — refuse at compile time naming the instance and the limit.
 */

async function compile(source: string) {
	return compileTsrxModule({ filename: 'src/Modal.tsrx', source, symbols: [] });
}

function eventSymbolSources(result: Awaited<ReturnType<typeof compile>>) {
	return result.symbolModules.modules
		.filter((module) => module.kind === 'event-handler')
		.map((module) => module.source);
}

/** A widget instance whose methods only write its own cells. */
const PLAIN_INSTANCE = `
import { element, shared, state } from '@markless/core';
import { openOverlay } from './overlay.ts';

export const modalState = shared(() => {
	const modal = state({ open: false });
	const contentEl = element<HTMLDivElement>();
	return {
		...modal,
		contentEl,
		setOpen(next: boolean) { modal.open = next; },
		closeAll() { modal.open = false; },
		dismissed() { modal.open = false; },
		dismissRoute() { return () => { modal.open = false; }; },
	};
}, { scope: 'widget' });
`;

/**
 * The same instance, with the consumer `onChange` the real families carry.
 *
 * Dispatching to it is what makes the copied body async, which is the leg that
 * used to refuse outright inside a callback.
 */
const DISPATCHING_INSTANCE = `
import { element, shared, state } from '@markless/core';
import { openOverlay } from './overlay.ts';

export const modalState = shared(() => {
	const modal = state({ open: false });
	const contentEl = element<HTMLDivElement>();
	return {
		...modal,
		contentEl,
		onChange: undefined as ((open: boolean) => void) | undefined,
		setOpen(next: boolean) {
			if (modal.open === next) return;
			modal.open = next;
			modal.onChange?.(next);
		},
		closeAll() {
			modal.open = false;
			modal.onChange?.(false);
		},
	};
}, { scope: 'widget' });
`;

const GRAPH_NODE = 'shared:src/Modal.tsrx#modalState/state:modal';
const CONTENT_HANDLE = 'shared:src/Modal.tsrx#modalState/element:contentEl';

test('spelling 1: an inline closure calling a method the handler also calls lowers on both sides', async () => {
	const result = await compile(`${PLAIN_INSTANCE}
export function ModalTrigger() @{
	const modal = modalState();

	<button el={modal.contentEl} onClick={() => {
		modal.setOpen(true);
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: () => { modal.setOpen(false); } });
	}}>open</button>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	// Both copies of the method body write the graph. Before the fix the second
	// copy read `modal.open = next`, which throws on the first dismiss.
	expect(source?.match(/context\.graph\.write\(/g)).toHaveLength(2);
	expect(source).not.toMatch(/\bmodal\./);
	expect(source).toContain(`openOverlay(context.getElementHandle("${CONTENT_HANDLE}")`);
	expect(() => parseJavaScriptModule(source ?? '', 'generated.ts')).not.toThrow();
});

test('spelling 1: the same shape with a dispatching method lowers on both sides', async () => {
	const result = await compile(`${DISPATCHING_INSTANCE}
export function ModalTrigger({ onChange }) @{
	const modal = modalState();
	modal.onChange = onChange;

	<button el={modal.contentEl} onClick={() => {
		modal.setOpen(true);
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: () => { modal.setOpen(false); } });
	}}>open</button>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).not.toMatch(/\bmodal\./);
	expect(source?.match(/context\.graph\.write\(/g)).toHaveLength(2);
	// The handler's own call keeps its `await`, so what the author wrote after it
	// still runs after it; the callback's call is the last thing that callback
	// does, so it is inlined unawaited rather than making the callback async.
	expect(source).toContain('await (async (next) =>');
	expect(source).toContain('onDismiss: () => {\n    (async (next) =>');
});

test('a shared-instance method called only inside the callback lowers', async () => {
	const result = await compile(`${DISPATCHING_INSTANCE}
export function ModalTrigger({ onChange }) @{
	const modal = modalState();
	modal.onChange = onChange;

	<button el={modal.contentEl} onClick={() => {
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: () => { modal.closeAll(); } });
	}}>open</button>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).not.toMatch(/\bmodal\./);
	expect(source).toContain(
		`context.graph.write({ graphNodeId: "${GRAPH_NODE}", path: ["open"], value: false })`,
	);
});

test('a shared-instance cell written directly inside the callback lowers', async () => {
	const result = await compile(`${PLAIN_INSTANCE}
export function ModalTrigger() @{
	const modal = modalState();

	<button el={modal.contentEl} onClick={() => {
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: () => { modal.open = false; } });
	}}>open</button>
}
`);

	expect(result.semanticGraph.diagnostics).toEqual([]);
	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).not.toMatch(/\bmodal\./);
	expect(source).toContain(
		`context.graph.write({ graphNodeId: "${GRAPH_NODE}", path: ["open"], value: false })`,
	);
});

test('spelling 2: a method hoisted into a local first is refused, and the advice says not to', async () => {
	const result = await compile(`${PLAIN_INSTANCE}
export function ModalTrigger() @{
	const modal = modalState();

	<button el={modal.contentEl} onClick={() => {
		const dismissed = modal.dismissed;
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: dismissed });
	}}>open</button>
}
`);

	const [diagnostic] = result.symbolModules.diagnostics.filter(
		(item) => item.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(diagnostic?.severity).toBe('error');
	// The limit is named as what it is: a shared() instance, not a state cell.
	expect(diagnostic?.message).toContain('"modal" is a shared() instance built by the component');
	const suggestions = (diagnostic?.suggestions ?? []).map((item) => item.message);
	expect(suggestions.some((item) => item.includes('Call it inside a closure'))).toBe(true);
	// The state-cell advice — read it into a local first — is the spelling being
	// refused here, so this diagnostic must not give it.
	expect(suggestions.some((item) => item.includes('Do not hoist the method into a local'))).toBe(
		true,
	);
});

test('spelling 3: a method read as an object property is refused the same way', async () => {
	const result = await compile(`${PLAIN_INSTANCE}
export function ModalTrigger() @{
	const modal = modalState();

	<button el={modal.contentEl} onClick={() => {
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: modal.dismissed });
	}}>open</button>
}
`);

	const codes = result.symbolModules.diagnostics.map((item) => item.code);
	expect(codes).toContain(SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE);
	expect(result.symbolModules.diagnostics.every((item) => item.severity === 'error')).toBe(true);
	expect(eventSymbolSources(result)[0]).toContain('onDismiss: modal.dismissed');
});

test('spelling 4: a factory method returning the closure lowers the write inside the closure', async () => {
	// Recorded as a silent gesture-kill: it compiled clean and no handler ran.
	// What it must never do is compile clean while the callback it produces is
	// unlowered, so the write inside the returned closure is asserted here.
	const result = await compile(`${PLAIN_INSTANCE}
export function ModalTrigger() @{
	const modal = modalState();

	<button el={modal.contentEl} onClick={() => {
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: modal.dismissRoute() });
	}}>open</button>
}
`);

	expect(result.symbolModules.diagnostics).toEqual([]);

	const [source] = eventSymbolSources(result);
	expect(source).not.toMatch(/\bmodal\./);
	expect(source).toContain(
		`return () => {\n      context.graph.write({ graphNodeId: "${GRAPH_NODE}", path: ["open"], value: false });`,
	);
});

test('a dispatching call the callback does not end with is refused, not dropped', async () => {
	// `await` cannot stand in the author's synchronous callback, and the call is
	// not the last thing that callback does, so inlining it unawaited would let
	// the statement after it race the dispatch. The site is left alone instead —
	// and left alone means the authored name survives and fails the compile.
	const result = await compile(`${DISPATCHING_INSTANCE}
import { report } from './report.ts';

export function ModalTrigger({ onChange }) @{
	const modal = modalState();
	modal.onChange = onChange;

	<button el={modal.contentEl} onClick={() => {
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: () => { modal.closeAll(); report('closed'); } });
	}}>open</button>
}
`);

	const [diagnostic] = result.symbolModules.diagnostics.filter(
		(item) => item.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
	expect(diagnostic?.severity).toBe('error');
	expect(diagnostic?.message).toContain('"modal"');
	expect(eventSymbolSources(result)[0]).toContain('modal.closeAll()');
});

test('the unresolved-reference check reads a module carrying an inlined setter body', async () => {
	// The copied method keeps `(next: boolean)`. Parsed as plain JavaScript the
	// module threw and the check claimed nothing, which is what made an unlowered
	// instance reference ship in silence. Both are in this one module: a call that
	// lowers and brings the annotation with it, and a method read that does not.
	const result = await compile(`${PLAIN_INSTANCE}
export function ModalTrigger() @{
	const modal = modalState();

	<button el={modal.contentEl} onClick={() => {
		modal.setOpen(true);
		openOverlay(modal.contentEl, { kind: 'modal', onDismiss: modal.dismissed });
	}}>open</button>
}
`);

	const [source] = eventSymbolSources(result);
	// The annotation the setter was authored with is stripped at emission; the
	// inlined body is what the check reads.
	expect(source).toContain('((next) => {');
	expect(result.symbolModules.diagnostics.map((item) => item.code)).toContain(
		SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE,
	);
});
