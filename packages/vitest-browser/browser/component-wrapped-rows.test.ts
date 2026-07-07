import { expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import App from './fixtures/component-wrapped-rows.tsrx';

// Ledger need 6, link 4 (dashboard-migration): pages that compose ANY component
// must still SSR keyed-repeat rows and dispatch row events after resume.
// KNOWN RED (link-4 tail): SSR rows + locators now work on composed pages
// (the blanket componentEdges bail is gone) and composed pages take the full
// resume path — but row EVENT records still don't match on composed pages
// (MARKLESS_EVENT_DISPATCH_UNMATCHED at the row element). Next: trace
// resume-keyed-repeats row materialization under a composed locator table.
test.fails('SSR: component-wrapped page renders repeat rows and dispatches row events', async () => {
	const screen = await renderSSR(App);
	const rows = screen.container.querySelectorAll('[data-row-id]');
	expect(rows.length).toBe(2);
	expect(rows[0]?.getAttribute('data-row-id')).toBe('row-alpha');

	(rows[1] as HTMLElement).click();
	await expect.poll(() => screen.container.querySelector('[data-picks]')?.textContent).toBe('Picks 1');
	await cleanup();
});
