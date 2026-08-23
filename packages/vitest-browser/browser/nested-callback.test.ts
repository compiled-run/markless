import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/nested-callback.tsrx';

// U152 / defect 18: a consumer callback parked on the widget root's shared
// instance reaches NOBODY when another part of the SAME family stands between
// the root and the dispatching part. The widget's own write still lands, so the
// DOM looks right and only the consumer's own counter catches it.
//
// The four cases are the same family and the same root prop, differing only in
// what stands between the root and the trigger: nothing, one plain projecting
// component, two of them, and one real part of the same family. Measured on
// this tree, `flat`, `one` and `two` all count 1 and only `family` counts 0, so
// the trigger is NOT depth - it is the intermediate being imported from the
// same module as the root.
//
// Cause: `enclosingWidgetRootEdge` (packages/compiler/src/passes/
// capture-analysis.ts) answers "which root encloses this part" with the
// innermost textually-enclosing edge that shares the part's `importSource`,
// never checking that the edge is the widget ROOT the claim named. A plain
// local wrapper is filtered out by the importSource test, which is the only
// reason `one` and `two` work; a same-module family part is not, so `WcbLabel`
// is chosen, has no `onChange`, and the claim folds to a compiler-known
// undefined that the emitted resolver then treats as "this edge passed no
// callback" and voids in silence.
//
// `nested` is the counter-case the fix has to keep working: two roots of the
// same family, one inside the other, which is what a tree family writes. The
// trigger belongs to the INNER widget instance, so the inner root's handler is
// the one that must hear it and the outer root must stay at zero. "Innermost
// enclosing edge that IS the claimed root" answers both this and `family`;
// "innermost enclosing edge of the same module" answers only this one.
//
// `keydown` is defect 20: a part that takes an optional event prop out of a rest
// spread and calls it guarded as `onKeyDown?.(event)`.
afterEach(() => cleanup());

const CASES = ['flat', 'one', 'two', 'family', 'nested'] as const;
type Case = (typeof CASES)[number];

function watchPageErrors(): { readonly errors: string[]; readonly stop: () => void } {
	const errors: string[] = [];
	const onError = (event: ErrorEvent) => errors.push(String(event.message));
	const onRejection = (event: PromiseRejectionEvent) =>
		errors.push(String((event.reason as Error)?.message ?? event.reason));
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	return {
		errors,
		stop: () => {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
		},
	};
}

function required<T extends Element>(container: ParentNode, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

function trigger(container: ParentNode, which: Case): HTMLButtonElement {
	return required<HTMLButtonElement>(
		container,
		`[data-case="${which}"] [data-wcb-trigger]`,
	);
}

// What the consumer's own handler counted, per case.
function consumerCalls(container: ParentNode): Record<Case, string | null> {
	return Object.fromEntries(
		CASES.map((which) => [which, required(container, `[data-log="${which}"]`).textContent]),
	) as Record<Case, string | null>;
}

// What the widget itself did, per case: the trigger renders its own `on` cell.
function widgetState(container: ParentNode): Record<Case, string | null> {
	return Object.fromEntries(
		CASES.map((which) => [which, trigger(container, which).textContent]),
	) as Record<Case, string | null>;
}

// What the OUTER root of the nested-widget case counted. It must never move: the
// trigger sits in the inner widget instance.
function outerRootCalls(container: ParentNode): string | null {
	return required(container, '[data-log="outer"]').textContent;
}

async function expectEveryDepthReachesTheConsumer(container: ParentNode) {
	expect(consumerCalls(container)).toEqual({
		flat: '0',
		one: '0',
		two: '0',
		family: '0',
		nested: '0',
	});
	expect(outerRootCalls(container)).toBe('0');

	for (const which of CASES) {
		trigger(container, which).click();
		// The widget's own write is what makes this defect silent: it lands at
		// every depth, so the DOM looks right whether or not anyone was told.
		await expect.poll(() => widgetState(container)[which]).toBe('true');
	}

	// Asserted as one record so the diff names the depths that heard nothing,
	// and so a dispatch that reached the WRONG instance shows up as a double
	// count on one case rather than passing quietly.
	await expect
		.poll(() => consumerCalls(container))
		.toEqual({ flat: '1', one: '1', two: '1', family: '1', nested: '1' });
	// The enclosing root of a nested pair owns its own subtree, not its child
	// root's. A fix that walked outward until it found any root would count here.
	expect(outerRootCalls(container)).toBe('0');
}

// Defect 20. `NkfItem` names `onKeyDown` and spreads the rest, then calls it
// guarded. The part's own module composes no edge that answers `onKeyDown`, so
// the capture route falls back to the `prop:props` placeholder node and the
// resume dispatcher asks the graph to read it.
async function expectGuardedRestSpreadCallbackFires(container: ParentNode) {
	const item = required<HTMLButtonElement>(container, '[data-case="keydown"] [data-nkf-item]');
	expect(required(container, '[data-log="keydown"]').textContent).toBe('0');

	item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

	// The part's own write lands first, the same way it does for `family` above,
	// so poll it before blaming the consumer's counter.
	await expect.poll(() => item.textContent).toBe('1');
	await expect.poll(() => required(container, '[data-log="keydown"]').textContent).toBe('1');
}

test('CSR: a root-held callback fires from a part one and two levels below the root', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await render(Page)).container as HTMLElement;
	await expectEveryDepthReachesTheConsumer(container);
	stop();
	expect(errors).toEqual([]);
});

test('SSR resume: the same nested dispatches reach the same consumer callback', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await renderSSR(Page)).container;
	await expectEveryDepthReachesTheConsumer(container);
	stop();
	expect(errors).toEqual([]);
});

test('CSR: a part that guards an optional event prop out of a rest spread reaches its consumer', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await render(Page)).container as HTMLElement;
	await expectGuardedRestSpreadCallbackFires(container);
	stop();
	expect(errors).toEqual([]);
});

// Defect 20, HALF fixed (U159), still pinned red for the other half.
//
// Fixed here: the claim used to bind to the wrong edge. A module publishes ONE
// claim manifest for every component it exports and the linker handed the whole
// manifest to every edge into that module, so `<NkfRoot>` was offered
// `<NkfItem>`'s `onKeyDown` claim. Rewriting the guarded call as an
// unconditional `onKeyDown(event)` used to name it: MARKLESS_CAPTURE_OPAQUE_PROP
// on the `<NkfRoot>` edge for `<NkfItem>`'s prop. Claims now carry their owning
// component from the linker (`ownerComponentName`, module-link.ts) and capture
// analysis gives an edge only the claims that edge's component owns, so the
// unconditional variant compiles and the served resolver now carries exactly one
// bound row for this part - on the `<NkfItem>` edge, with a `callback-route` to
// the consumer's own handler symbol. The CSR row above is green on that binding.
//
// Still red, measured on this tree: SSR resume runs the part's emitted symbol
// WITHOUT the bound row's capture adapter. The child module's symbol is emitted
// as `context.graph.read("prop:props", ["onKeyDown"])?.(event)`, and the adapter
// that turns that legacy read into the parent-proven callback route
// (`createBoundGraph`, packages/bundler/src/bound-resolver.ts) only runs when the
// dispatcher loads the BOUND id. The part's own write still lands, so the symbol
// did run - under an id that is not the bound one. The seam is which symbol id
// the served payload names for a composed child's own event record
// (`boundEventSymbolIds`, packages/compiler/src/passes/protocol-view.ts), or the
// emission choice in symbol-modules.ts; neither file is in this unit's contract.
test.fails('SSR resume: the same guarded rest-spread callback reaches its consumer', async () => {
	const { errors, stop } = watchPageErrors();
	const container = (await renderSSR(Page)).container;
	await expectGuardedRestSpreadCallbackFires(container);
	stop();
	expect(errors).toEqual([]);
});
