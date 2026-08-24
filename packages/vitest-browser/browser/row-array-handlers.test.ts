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
	return container.querySelector('p')?.textContent;
}

function clickFirstRow(container: ParentNode) {
	const row = container.querySelector<HTMLElement>('li');
	if (!row) throw new Error('Expected a row.');
	row.click();
}

test('SSR resume: one click on a row runs every handler entry once, in order', async () => {
	const screen = await renderSSR(Page);
	const container = screen.container;
	expect([...container.querySelectorAll('li')].map((row) => row.textContent)).toEqual([
		'alpha',
		'bravo',
	]);

	clickFirstRow(container);
	await expect.poll(() => trace(container)).toBe('AB');
});

// OPEN DEFECT, direct CSR only - the row runs entry A and stops, so the trace
// reads 'A' where the SSR row above reads 'AB'.
//
// The cause is downstream of this package and not the duplicate records that
// defect 89's sibling fix removed: `attachDirectRepeatEvents` in
// packages/web/src/fns/direct.ts walks `repeat.eventControls`, runs the first
// control whose row expando matches, and returns from the listener - so exactly
// one entry ever fires per click. Measured before and after the render-data
// dedupe (four controls, then two): 'A' both times, so deduping neither caused
// nor cured it. Repairing it means letting that listener run every control for
// the matched row+event instead of returning on the first, which is a change to
// packages/web. Deterministic, so test.fails.
test.fails('CSR: one click on a row runs every handler entry once, in order', async () => {
	const screen = await render(Page);
	const container = screen.container as HTMLElement;

	clickFirstRow(container);
	await expect.poll(() => trace(container)).toBe('AB');
});
