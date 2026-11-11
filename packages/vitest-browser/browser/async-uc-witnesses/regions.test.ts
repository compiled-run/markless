import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { asked, hold, release, reset } from '../matched-values/gates.ts';
import { BrowserSource } from './browser-source.tsrx';
import { Orders } from './order-table.tsrx';
import { SharedPill } from './shared-pill.tsrx';
import { TwoBlocks } from './two-blocks.tsrx';
import { busy, click, each, poll, text, underBusy, watch } from './support.ts';

// Witnesses for which region shows a wait, and when requests start.
afterEach(() => {
	reset();
	cleanup();
});

const rows = (container: HTMLElement) =>
	[...container.querySelectorAll('[data-row]')].map((row) => row.getAttribute('data-row')).join(',');

each('a delete a child calls through a prop marks the list from the click until its revalidation lands', { csr: () => render(Orders), ssr: () => renderSSR(Orders) }, async (container) => {
	await expect.poll(() => rows(container), poll).toBe('a,b,c');
	hold('remove:b', 'orders:1');
	const stop = watch(container, { marked: () => underBusy(container, '[data-row="b"]') || !container.querySelector('[data-row="b"]') });
	click(container, '[data-delete="b"]');
	await expect.poll(() => underBusy(container, '[data-row="b"]'), poll).toBe(true);
	release('remove:b');
	await expect.poll(() => asked.includes('orders:1'), poll).toBe(true);
	expect(rows(container), 'the deleted row stays on screen while the list reloads').toBe('a,b,c');
	expect(underBusy(container, '[data-row="b"]'), 'the reloading list is marked').toBe(true);
	release('orders:1');
	await expect.poll(() => rows(container), poll).toBe('a,c');
	await expect.poll(() => container.querySelectorAll('[aria-busy="true"]').length, poll).toBe(0);
	expect(stop().marked, 'the mark dropped between the click and the reload landing').toEqual([false, true]);
});

const pillShown = (container: HTMLElement) =>
	getComputedStyle(container.querySelector('[data-pill]')!).display !== 'none';

each('one pill shows while either wrapped widget refreshes, and not for the widget outside the wrapper', { csr: () => render(SharedPill), ssr: () => renderSSR(SharedPill) }, async (container) => {
	await expect.poll(() => text(container, '[data-churn-rate]'), poll).toBe('churn 7d');
	await expect.poll(() => text(container, '[data-revenue-total]'), poll).toBe('revenue 7d');
	expect(pillShown(container)).toBe(false);
	hold('revenue:30d', 'signups:30d', 'churn:30d');
	click(container, '[data-month]');
	await expect.poll(() => pillShown(container), poll).toBe(true);
	expect(busy(container, '[data-revenue-total]'), 'revenue marks itself').toBe(true);
	release('signups:30d');
	await expect.poll(() => text(container, '[data-signups-count]'), poll).toBe('signups 30d');
	expect(pillShown(container), 'churn is still in flight').toBe(true);
	release('churn:30d');
	await expect.poll(() => text(container, '[data-churn-rate]'), poll).toBe('churn 30d');
	await expect.poll(() => pillShown(container), poll).toBe(false);
	expect(busy(container, '[data-revenue-total]'), 'revenue still refreshing, outside the pill').toBe(true);
	release('revenue:30d');
	await expect.poll(() => text(container, '[data-revenue-total]'), poll).toBe('revenue 30d');
	expect(pillShown(container)).toBe(false);
});

const waiting = (container: HTMLElement) =>
	!!container.querySelector('[data-pending]') || underBusy(container, '[data-place]');

// The hold goes on before mounting: attach asks for the position once the first answer is on screen.
async function browserSourceWaits(mount: () => Promise<{ readonly container: unknown }>) {
	hold('position');
	const container = (await mount()).container as HTMLElement;
	await expect.poll(() => asked.includes('position'), poll).toBe(true);
	const stop = watch(container, { waiting: () => waiting(container) });
	// Under the 5 s refresh stall, so a late @pending cannot pass for a reported wait.
	await expect.poll(() => waiting(container), { ...poll, timeout: 1_000 }).toBe(true);
	release('position');
	await expect.poll(() => text(container, '[data-place]'), poll).toBe('Oslo');
	expect(waiting(container)).toBe(false);
	expect(stop().waiting).toEqual([true, false]);
}

// Gap: the browser-only request runs with the first answer on screen and no busy mark, because attach's write counts as a background change.
test.fails('a source that exists only in the browser shows its wait (client-rendered)', () => browserSourceWaits(() => render(BrowserSource)));
test.fails('a source that exists only in the browser shows its wait (server-rendered)', () => browserSourceWaits(() => renderSSR(BrowserSource)));

const bothAsked = (city: string) => asked.includes(`sky:${city}`) && asked.includes(`air:${city}`);

test('two independent async values in separate blocks start their first requests together (client-rendered)', async () => {
	hold('sky:oslo', 'air:oslo');
	const screen = await render(TwoBlocks);
	const container = screen.container as HTMLElement;
	await expect.poll(() => bothAsked('oslo'), poll).toBe(true);
	expect(text(container, '[data-sky]')).toBeNull();
	release('air:oslo');
	await expect.poll(() => text(container, '[data-air]'), poll).toBe('air oslo');
	release('sky:oslo');
	await expect.poll(() => text(container, '[data-sky]'), poll).toBe('sky oslo');
});

each('two independent async values in separate blocks start their refreshes together', { csr: () => render(TwoBlocks), ssr: () => renderSSR(TwoBlocks) }, async (container) => {
	await expect.poll(() => text(container, '[data-air]'), poll).toBe('air oslo');
	await expect.poll(() => text(container, '[data-sky]'), poll).toBe('sky oslo');
	hold('sky:rome', 'air:rome');
	click(container, '[data-rome]');
	await expect.poll(() => bothAsked('rome'), poll).toBe(true);
	release('air:rome');
	await expect.poll(() => text(container, '[data-air]'), poll).toBe('air rome');
	expect(text(container, '[data-sky]')).toBe('sky oslo');
	release('sky:rome');
	await expect.poll(() => text(container, '[data-sky]'), poll).toBe('sky rome');
});
