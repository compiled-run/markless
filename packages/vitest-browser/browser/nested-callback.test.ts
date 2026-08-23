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
afterEach(() => cleanup());

const CASES = ['flat', 'one', 'two', 'family'] as const;
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

async function expectEveryDepthReachesTheConsumer(container: ParentNode) {
	expect(consumerCalls(container)).toEqual({ flat: '0', one: '0', two: '0', family: '0' });

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
		.toEqual({ flat: '1', one: '1', two: '1', family: '1' });
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
