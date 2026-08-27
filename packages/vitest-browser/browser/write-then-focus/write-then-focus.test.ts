import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import HiddenSurfacePage from './hidden-surface-page.tsrx';

import HideAndReturnPage from './hide-and-return-page.tsrx';

import InertInvokerPage from './inert-invoker-page.tsrx';

import InertLiftHandlePage from './inert-lift-handle-page.tsrx';

import InertLiftPage from './inert-lift-page.tsrx';

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
	// The overlay rows below leave document-wide state - a scroll-lock count and
	// the background marks - that outlives the container. Hiding every marked
	// element through the same `hidden` transition the behaviour watches is what
	// hands that state back, instead of leaking it into the next row.
	try {
		for (const surface of [...document.querySelectorAll<HTMLElement>('[overlay]')].reverse())
			surface.hidden = true;
		await sleep(0);
	} finally {
		await cleanup();
		document.body.style.overflow = '';
		document.body.style.paddingRight = '';
	}
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

// Closing an overlay is the same write-then-focus shape with a blocker the
// handler does not own: the surface's own behaviour marked the background
// `inert` when it enlisted, and lifts that mark from a mutation callback that
// runs after the hide reaches the DOM. So the focus the closing handler asks for
// is refused, and the thing that would let it land happens after the flush the
// dispatch awaits. Both spellings of "where focus was" are covered - the raw
// element the behaviour captured at enlist, and an ordinary handle read.
async function openAndClose(): Promise<void> {
	el('origin').focus();
	expect(document.activeElement).toBe(el('origin'));

	await userEvent.click(el('origin'));
	await expect.poll(hiddenOf('surface')).toBe(false);
	// The background really is out of reach: without this the row would pass on a
	// page that never marked anything.
	await expect.poll(inertOf('origin')).toBe(true);

	await userEvent.click(el('close'));
	await expect.poll(hiddenOf('surface')).toBe(true);
	await expect.poll(inertOf('origin')).toBe(false);
}

test('CSR: closing an overlay returns focus to the element captured at enlist', async () => {
	await render(InertLiftPage);
	await openAndClose();

	expect(document.activeElement).toBe(el('origin'));
	await sleep(100);
	expect(document.activeElement).toBe(el('origin'));
});

test('SSR: closing an overlay returns focus to the element captured at enlist', async () => {
	await renderSSR(InertLiftPage);
	await openAndClose();

	expect(document.activeElement).toBe(el('origin'));
	await sleep(100);
	expect(document.activeElement).toBe(el('origin'));
});

test('CSR: closing an overlay returns focus to a handle the handler read', async () => {
	await render(InertLiftHandlePage);
	await openAndClose();

	expect(document.activeElement).toBe(el('origin'));
	await sleep(100);
	expect(document.activeElement).toBe(el('origin'));
});

test('SSR: closing an overlay returns focus to a handle the handler read', async () => {
	await renderSSR(InertLiftHandlePage);
	await openAndClose();

	expect(document.activeElement).toBe(el('origin'));
	await sleep(100);
	expect(document.activeElement).toBe(el('origin'));
});
