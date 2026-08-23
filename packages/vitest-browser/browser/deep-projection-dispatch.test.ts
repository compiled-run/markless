import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import FlatPage from './fixtures/dpd-flat-page.tsrx';
import NestedPage from './fixtures/dpd-nested-page.tsrx';

// Defect 72, reduced to its smallest shape: a click record on a part three
// projections under its widget root (`Root > Layer > Surface > Close`).
//
// The two rows below pass. The third is the defect, and it is order-dependent:
// a page carrying the SAME family rooted inside its own surface renders first,
// is torn down, and the flat page's deep close then never moves anything.
afterEach(() => cleanup());

function reads(container: ParentNode) {
	const roots = [...container.querySelectorAll('[data-dpd-root]')];
	return {
		roots,
		opens: [...container.querySelectorAll<HTMLButtonElement>('[data-dpd-open]')],
		closes: [...container.querySelectorAll<HTMLButtonElement>('[data-dpd-close]')],
	};
}

async function expectDeepCloseRuns(container: ParentNode) {
	const { roots, opens, closes } = reads(container);
	expect(roots.length).toBe(2);
	expect(opens.length).toBe(2);
	expect(closes.length).toBe(2);

	opens[0]?.click();
	await expect.poll(() => roots[0]?.getAttribute('data-open')).toBe('yes');
	// The sibling instance is untouched: this is a per-widget gesture.
	expect(roots[1]?.getAttribute('data-open')).toBe('no');

	closes[0]?.click();
	// The probe is the handler's first statement, so it separates "the record
	// never ran" from "the record ran and wrote the wrong instance".
	await expect.poll(() => roots[0]?.getAttribute('data-probe')).toBe('ran');
	await expect.poll(() => roots[0]?.getAttribute('data-open')).toBe('no');
	expect(roots[1]?.getAttribute('data-probe')).toBe('');
}

test('CSR: a click record three projections under the widget root runs', async () => {
	const screen = await render(FlatPage);
	await expectDeepCloseRuns(screen.container as HTMLElement);
});

test('SSR resume: the same deep click record runs', async () => {
	const screen = await renderSSR(FlatPage);
	await expectDeepCloseRuns(screen.container);
});

/**
 * Defect 72, fixed. This row is the regression fence.
 *
 * `pageRegistry` in packages/web/src/fns/instance-scope.ts used to be a
 * module-level singleton — one Map for the whole JS realm — that every render
 * wrote widget root paths into and that nothing ever cleared. Tearing a
 * container down left its entries behind.
 *
 * Measured at the moment this row failed, the map held:
 *
 *   c0:p2:p3:p4:<defId>  =>  c0:p2:p3:p4:   <- stale, from the torn-down nested render
 *   c0:<defId>           =>  c0:            <- this page's widget A, the correct answer
 *   c5:<defId>           =>  c5:            <- this page's widget B
 *
 * Widget A is rooted at `c0:`, and its close part dispatches at reading instance
 * path `c0:p2:p3:p4:`. `widgetRootPathFor` walks prefixes LONGEST-FIRST, so its
 * very first probe is `c0:p2:p3:p4:` + the definition id — exactly the key the
 * nested render left behind. It answers `c0:p2:p3:p4:` instead of `c0:`, so the
 * write lands on a graph node no rendered widget owns: the record matches, the
 * symbol runs, and nothing moves.
 *
 * That accounts for every measured property of the defect:
 *
 * - Depth-dependent. Only a part deep enough for its own reading path to EQUAL
 *   some previously registered root path can collide. Three projections down is
 *   the first depth that reaches a nested render's inner-root path, which is why
 *   modal's close died the moment the ruled `backdrop` wrapper pushed it there
 *   and why the draft's shallower close never did.
 * - Order-dependent, green in isolation. The stale key only exists once a
 *   widget-inside-a-widget page has rendered earlier in the same realm.
 * - Escape still works. The backdrop's dismissal reads at a shorter path that
 *   never probes the poisoned key.
 * - A consumer's own button in the same surface still works. It is not a
 *   widget-scoped part, so it never asks this registry at all.
 *
 * The fix: one registry per RuntimeGraph, held in a WeakMap and filled from the
 * graph's own widget-scoped definitions. A torn-down container's graph is the
 * only thing its roots were ever filed against, so it strands no keys.
 */
test('CSR: an earlier nested render leaves the flat page deep close working', async () => {
	await render(NestedPage);
	cleanup();

	const screen = await render(FlatPage);
	await expectDeepCloseRuns(screen.container as HTMLElement);
});
