import { afterEach, beforeAll, expect, test } from 'vitest';
import { installMarklessComposedArmRecords } from '../../../web/src/fns/instance-scope.ts';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import BesideChildPage from './beside-child-page.tsrx';
import ChildInlineRowsPage from './child-inline-page.tsrx';
import ChildMarkPage from './child-mark-page.tsrx';
import { forgetRequests } from './gate.ts';
import { appendStreamed, counts, own, refreshStreamed, settleInline } from './rows.ts';

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

// Text a row's @try arm reads from page state follows a write in every row.
const seen = () => [...document.querySelectorAll('[data-seen]')].map((cell) => cell.textContent);
async function bump() {
	document.querySelector<HTMLElement>('[data-bump]')!.click();
	await expect.poll(seen).toEqual(['1', '1']);
}

test("CSR: text a keyed row's @try arm reads follows a write", async () => {
	await render(BesideChildPage);
	await settleInline(0);
	await bump();
});

test("SSR: text a keyed row's @try arm reads follows a write", async () => {
	await renderSSR(BesideChildPage);
	expect(seen()).toEqual(['0', '0']);
	await bump();
});

test("streamed: text a keyed row's @try arm reads follows a write", async () => {
	const { shell, appends } = await renderStream(BesideChildPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(seen).toEqual(['0', '0']);
	await bump();
});

// A child's own rows: text reading the row and the child's own state follows a write to that state.
const marks = () => [...document.querySelectorAll('[data-mark]')].map((cell) => cell.textContent);
async function tickThenRefresh() {
	document.querySelector<HTMLElement>('[data-tick]')!.click();
	await expect.poll(marks).toEqual(['Pen +3', 'Ink +3']);
	document.querySelector<HTMLElement>('[data-again]')!.click();
	await settleInline(1);
	document.querySelector<HTMLElement>('[data-tick]')!.click();
	await expect.poll(marks).toEqual(['Nib +6', 'Cap +6']);
}

test("CSR: text a child's row @try arm reads from the child's state follows a write", async () => {
	await render(ChildMarkPage);
	await settleInline(0);
	await tickThenRefresh();
});

test("SSR: text a child's row @try arm reads from the child's state follows a write", async () => {
	await renderSSR(ChildMarkPage);
	expect(marks()).toEqual(['Pen +0', 'Ink +0']);
	await tickThenRefresh();
});

test("streamed: text a child's row @try arm reads from the child's state follows a write", async () => {
	const { shell, appends } = await renderStream(ChildMarkPage);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	await expect.poll(marks).toEqual(['Pen +0', 'Ink +0']);
	await tickThenRefresh();
});
