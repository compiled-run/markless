import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HiddenSurfacePage from './hidden-surface-page.tsrx';

import HideAndReturnPage from './hide-and-return-page.tsrx';

import InertInvokerPage from './inert-invoker-page.tsrx';

import KeyedRemintPage from './keyed-remint-page.tsrx';


// A handler writes `open = true` and focuses the surface on the next line.
// Seven families answer this today by retrying `focus()` for 12-30 animation
// frames, because the write reached the DOM only after the handler returned.
// These witnesses hold the runtime to the guarantee that removes the retry: a
// handler's writes are in the DOM before its next statement, and the focus it
// asked for in the same handler is already landed by the time that write is
// visible - no extra frame, no polling on focus.
//
// Every row therefore waits on the WRITE and then reads `document.activeElement`
// synchronously. Polling on focus itself would pass on a retry loop and prove
// nothing.

afterEach(async () => {
	await cleanup();
});

function el(testid: string): HTMLElement {
	return page.getByTestId(testid).element() as HTMLElement;
}

const textOf = (testid: string) => () => el(testid).textContent;
const hiddenOf = (testid: string) => () => el(testid).hasAttribute('hidden');
const inertOf = (testid: string) => () => el(testid).hasAttribute('inert');
const dayAt = (iso: string) =>
	el('days').querySelector<HTMLButtonElement>(`[data-day][value="${iso}"]`);
const daysListed = () => [...el('days').querySelectorAll('[data-day]')].map((day) => day.getAttribute('value')).join(',');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('CSR: opening a hidden surface and focusing it in the same handler lands the focus', async () => {
	await render(HiddenSurfacePage);

	await userEvent.click(el('open'));
	await expect.poll(hiddenOf('surface')).toBe(false);

	expect(document.activeElement).toBe(el('surface'));
	// The commit is a microtask behind the handler: a binding's DOM-update symbol
	// is demand-loaded, so the write cannot be in the DOM at the next statement.
	// That is the whole reason the focus is landed by the runtime instead.
	expect(textOf('committed')()).toBe('deferred');
});

test('SSR: opening a hidden surface and focusing it in the same handler lands the focus', async () => {
	await renderSSR(HiddenSurfacePage);

	await userEvent.click(el('open'));
	await expect.poll(hiddenOf('surface')).toBe(false);

	expect(document.activeElement).toBe(el('surface'));
	// The commit is a microtask behind the handler: a binding's DOM-update symbol
	// is demand-loaded, so the write cannot be in the DOM at the next statement.
	// That is the whole reason the focus is landed by the runtime instead.
	expect(textOf('committed')()).toBe('deferred');
});

test('CSR: clearing inert and focusing the invoker in the same handler lands the focus', async () => {
	await render(InertInvokerPage);

	await userEvent.click(el('unlock'));
	await expect.poll(inertOf('invoker')).toBe(false);

	expect(document.activeElement).toBe(el('invoker'));
});

test('SSR: clearing inert and focusing the invoker in the same handler lands the focus', async () => {
	await renderSSR(InertInvokerPage);

	await userEvent.click(el('unlock'));
	await expect.poll(inertOf('invoker')).toBe(false);

	expect(document.activeElement).toBe(el('invoker'));
});

test('CSR: a month change focuses the row whose key the same handler wrote', async () => {
	await render(KeyedRemintPage);

	await userEvent.click(el('next-month'));
	await expect.poll(daysListed).toBe('2026-09-01,2026-09-02,2026-09-03');

	expect(document.activeElement).toBe(dayAt('2026-09-02'));
	expect(textOf('rows-seen')()).toBe('2026-09-01,2026-09-02,2026-09-03');
});

test('SSR: a month change focuses the row whose key the same handler wrote', async () => {
	await renderSSR(KeyedRemintPage);

	await userEvent.click(el('next-month'));
	await expect.poll(daysListed).toBe('2026-09-01,2026-09-02,2026-09-03');

	expect(document.activeElement).toBe(dayAt('2026-09-02'));
	expect(textOf('rows-seen')()).toBe('2026-09-01,2026-09-02,2026-09-03');
});

test('CSR: hiding the surface focus is in and returning focus to the trigger holds', async () => {
	await render(HideAndReturnPage);

	el('close').focus();
	expect(document.activeElement).toBe(el('close'));

	await userEvent.click(el('close'));
	await expect.poll(hiddenOf('surface')).toBe(true);

	expect(document.activeElement).toBe(el('trigger'));
	// The hidden subtree blurs its holder; nothing may steal the focus back a
	// frame later.
	await sleep(100);
	expect(document.activeElement).toBe(el('trigger'));
});

test('SSR: hiding the surface focus is in and returning focus to the trigger holds', async () => {
	await renderSSR(HideAndReturnPage);

	el('close').focus();
	expect(document.activeElement).toBe(el('close'));

	await userEvent.click(el('close'));
	await expect.poll(hiddenOf('surface')).toBe(true);

	expect(document.activeElement).toBe(el('trigger'));
	await sleep(100);
	expect(document.activeElement).toBe(el('trigger'));
});
