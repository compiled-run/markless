import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './fixtures/row-array-handlers.tsrx';

/**
 * A handler ARRAY on the row host of a keyed `@for` - defect 89's sibling.
 *
 * The page is deliberately shaped so the compiler emits the DIRECT CSR module
 * (no bound attributes, no authored-expression text), because that is the only
 * consumer of a repeat record's `eventControls`. Resume takes the other path,
 * `rowEvents` in the protocol view, which carries one record per host+event with
 * an ordered `symbolIds` list.
 *
 * Each entry appends its own letter to a shared trace, so the trace text states
 * how many times each entry ran and in what order.
 */
afterEach(() => cleanup());

function trace(container: ParentNode) {
	return container.querySelector('[data-trace]')?.textContent;
}

function stopTrace(container: ParentNode) {
	return container.querySelector('[data-stop-trace]')?.textContent;
}

function clickFirstRow(container: ParentNode) {
	const row = container.querySelector<HTMLElement>('li');
	if (!row) throw new Error('Expected a row.');
	row.click();
}

function clickStopRow(container: ParentNode) {
	const row = container.querySelector<HTMLElement>('[data-stop-list] li');
	if (!row) throw new Error('Expected a stop row.');
	row.click();
}

test('SSR resume: one click on a row runs every handler entry once, in order', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container;
	expect([...container.querySelectorAll('ul:not([data-stop-list]) li')].map((row) =>
		row.textContent,
	)).toEqual(['alpha', 'bravo']);

	clickFirstRow(container);
	await expect.poll(() => trace(container)).toBe('ABC');
});

test('CSR: one click on a row runs every handler entry once, in order', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	clickFirstRow(container);
	await expect.poll(() => trace(container)).toBe('ABC');
});

// A row host's handler entries are one DOM listener list, so the entry that
// calls stopImmediatePropagation is the last one to run: the third entry never
// fires. Both render paths have to agree on that, which is what the non-row
// mb-events witnesses already pin for a plain element.
// OPEN DEFECT, SSR resume only - the row runs XYZ where CSR now reads XY.
// Resume honours stopImmediatePropagation for a plain element but not for a
// row: in packages/web/src/resume-events.ts the dispatch walk hands
// `propagation.stoppedImmediate` to `dispatchViewEvent` and NOT to
// `dispatchRowEvent`, whose `for (const symbolId of rowEvent.symbolIds)` loop
// therefore has nothing to read and runs the list to the end. Deterministic, so
// test.fails. Repairing it is a change to resume-events.ts, which the direct-CSR
// unit that pinned this does not own.
test.fails('SSR resume: stopImmediatePropagation in a row entry ends the list', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container;

	clickStopRow(container);
	await expect.poll(() => stopTrace(container)).toBe('XY');
});

test('CSR: stopImmediatePropagation in a row entry ends the list', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	clickStopRow(container);
	await expect.poll(() => stopTrace(container)).toBe('XY');
});
