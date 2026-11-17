import { afterEach, beforeAll, expect, test } from 'vitest';
import { installMarklessComposedArmRecords } from '../../../web/src/fns/instance-scope.ts';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import BesideChildPage from './beside-child-page.tsrx';
import ChildInlineRowsPage from './child-inline-page.tsrx';
import { forgetRequests } from './gate.ts';
import { counts, own, refreshStreamed, settleInline } from './rows.ts';

// A built page that composes children re-spells a composed @try's arm records by the instance its id names, as here.
beforeAll(() => installMarklessComposedArmRecords());

afterEach(() => {
	cleanup();
	forgetRequests();
});

// A child's own rows: its literal prop still reaches each row's @try, which the child's instance path and the row both name.
const pcs = ' pcs';

test("CSR: a child's inline row @try blocks each settle to their own value with the child's prop", async () => {
	await render(ChildInlineRowsPage);
	await settleInline(0, pcs);
});

test("SSR: after a refresh, a child's inline row @try blocks each settle to their own value with the child's prop", async () => {
	await renderSSR(ChildInlineRowsPage);
	expect(counts()).toEqual(own.map((count) => count + pcs));
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleInline(1, pcs);
});

test("streamed: a child's inline row @try blocks each show their own value with the child's prop, and after a refresh too", async () => {
	const { shell, appends } = await renderStream(ChildInlineRowsPage);
	await refreshStreamed(appends, renderServerHTML(shell).container, pcs);
});

// The page's own row @try keeps the page's ids beside a child the page composes.
test("CSR: inline row @try blocks beside a composed child each settle to their own value", async () => {
	await render(BesideChildPage);
	await settleInline(0);
});

test('SSR: after a refresh, inline row @try blocks beside a composed child each settle to their own value', async () => {
	await renderSSR(BesideChildPage);
	expect(counts()).toEqual(own);
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleInline(1);
	document.querySelector<HTMLElement>('[data-tally]')!.click();
	await expect.poll(() => document.querySelector('[data-tally]')!.textContent).toBe('taps 1');
});

test("streamed: inline row @try blocks beside a composed child each show their own value, and after a refresh too", async () => {
	const { shell, appends } = await renderStream(BesideChildPage);
	await refreshStreamed(appends, renderServerHTML(shell).container);
});

// Known gap: the compiler files text inside a row's @try arm as a page record with no locator, and gives that arm no records, so no row finds its element.
test.fails("text a keyed row's @try arm reads follows a write", async () => {
	await render(BesideChildPage);
	await settleInline(0);
	document.querySelector<HTMLElement>('[data-bump]')!.click();
	await expect.poll(() => [...document.querySelectorAll('[data-seen]')].map((cell) => cell.textContent)).toEqual(['1', '1']);
});
