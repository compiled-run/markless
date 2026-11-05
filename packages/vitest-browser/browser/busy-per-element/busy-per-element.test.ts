import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import ForecastDesk from './forecast-desk.tsrx';
import InventoryPanel from './inventory-panel.tsrx';
import ProfileBoard from './profile-board.tsrx';
import RotaCard from './rota-card.tsrx';

// A refresh marks busy only the elements whose bindings read the refreshing async value, and each mark clears when its value settles.
afterEach(() => cleanup());

function busyMarks(container: HTMLElement): string {
	return [...container.querySelectorAll('[aria-busy="true"]')]
		.map(
			(element) =>
				element.getAttributeNames().find((name) => name.startsWith('data-')) ??
				element.tagName.toLowerCase(),
		)
		.sort()
		.join(' ');
}

function sampleBusy(container: HTMLElement) {
	const seen: string[] = [];
	let running = true;
	const tick = () => {
		if (!running) return;
		seen.push(busyMarks(container));
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => {
		running = false;
		return seen;
	};
}

function click(container: HTMLElement, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

const poll = { timeout: 5_000, interval: 10 };

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };

// Painted is not yet settled: a click between the first commit and its settle bookkeeping is a first load, which marks nothing.
async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

async function twoValuesSettleApart(screen: Screen) {
	const container = await mounted(screen);
	await expect
		.poll(() => container.querySelector('[data-name]')?.textContent, poll)
		.toBe('User 1');
	await expect.poll(() => container.querySelector('[data-posts]')?.textContent, poll).toBe('AB');
	const stop = sampleBusy(container);
	click(container, '[data-both]');
	await expect
		.poll(() => busyMarks(container), poll)
		.toBe('data-badge data-heading data-name data-posts');
	expect(container.querySelector('[data-name]')?.textContent).toBe('User 1');
	await expect
		.poll(() => container.querySelector('[data-name]')?.textContent, poll)
		.toBe('User 2');
	expect(busyMarks(container)).toBe('data-heading data-posts');
	await expect.poll(() => container.querySelector('[data-posts]')?.textContent, poll).toBe('BA');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	const frames = stop();
	expect(
		frames.some((marks) => /data-(sort|check|block)/.test(marks)),
		'a sync control or the block host was marked',
	).toBe(false);
	expect(container.querySelector('[data-pending]')).toBeNull();
}

test('two async values in one block mark their own elements and clear as each settles', async () => {
	const screen = await render(ProfileBoard);
	await twoValuesSettleApart(screen);
});

async function refreshesStartedApart(screen: Screen) {
	const container = await mounted(screen);
	await expect
		.poll(() => container.querySelector('[data-sky]')?.textContent, poll)
		.toBe('Sky Oslo');
	await expect.poll(() => container.querySelector('[data-rows]')?.textContent, poll).toBe('xy');
	const stop = sampleBusy(container);
	click(container, '[data-market]');
	await expect.poll(() => busyMarks(container), poll).toBe('data-rows data-ticker');
	click(container, '[data-city]');
	await expect
		.poll(() => busyMarks(container), poll)
		.toBe('data-rows data-sky data-summary data-ticker');
	await expect
		.poll(() => container.querySelector('[data-sky]')?.textContent, poll)
		.toBe('Sky Rome');
	expect(busyMarks(container)).toBe('data-rows data-ticker');
	expect(container.querySelector('[data-summary]')?.getAttribute('title')).toBe(
		'Forecast: Sky Rome',
	);
	await expect.poll(() => container.querySelector('[data-rows]')?.textContent, poll).toBe('z');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	const frames = stop();
	expect(
		frames.some((marks) => /data-(volume|desk)/.test(marks)),
		'a sync control or the block root was marked',
	).toBe(false);
}

test('refreshes started at different times in one block mark and clear independently', async () => {
	const screen = await render(ForecastDesk);
	await refreshesStartedApart(screen);
});

async function inventoryRefresh(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => container.querySelector('[data-items]')?.textContent, poll).toBe('pq');
	const stop = sampleBusy(container);
	click(container, '[data-shelf]');
	await expect.poll(() => busyMarks(container), poll).toBe('data-caption data-items data-total');
	expect(container.querySelector('[data-caption]')?.textContent).toBe('Shelf north stock');
	await expect.poll(() => container.querySelector('[data-items]')?.textContent, poll).toBe('r');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	expect(container.querySelector('[data-total]')?.textContent).toBe('1');
	const frames = stop();
	expect(
		frames.some((marks) => /data-(compact|static|panel)|input/.test(marks)),
		'sync or static content was marked',
	).toBe(false);
	expect(
		frames.some((marks) => marks !== '' && marks !== 'data-caption data-items data-total'),
	).toBe(false);
}

async function rotaRefresh(screen: Screen) {
	const container = await mounted(screen);
	await expect
		.poll(() => container.querySelector('[data-names]')?.textContent, poll)
		.toBe('anabo');
	const stop = sampleBusy(container);
	click(container, '[data-next-week]');
	await expect.poll(() => busyMarks(container), poll).toBe('data-names data-tag data-when');
	click(container, '[data-toggle]');
	await expect
		.poll(() => container.querySelector('[data-toggle]')?.textContent, poll)
		.toBe('Show');
	expect(busyMarks(container)).toBe('data-names data-tag data-when');
	await expect.poll(() => container.querySelector('[data-names]')?.textContent, poll).toBe('cy');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	expect(container.querySelector('[data-when]')?.getAttribute('datetime')).toBe('2026-02');
	const frames = stop();
	expect(
		frames.some((marks) => /data-(toggle|card)/.test(marks)),
		'a sync control or the block root was marked',
	).toBe(false);
}

test('a sync computed, a child prop and a keyed list are marked, sync and static content never', async () => {
	const screen = await render(InventoryPanel);
	await inventoryRefresh(screen);
});

test('server-rendered and resumed: a sync computed, a child prop and a keyed list are marked, sync and static content never', async () => {
	const screen = await renderSSR(InventoryPanel);
	await inventoryRefresh(screen);
});

test('an attribute, a computed child prop and keyed rows are marked, a sync control stays unmarked while used', async () => {
	const screen = await render(RotaCard);
	await rotaRefresh(screen);
});

test('server-rendered and resumed: an attribute, a computed child prop and keyed rows are marked, a sync control stays unmarked while used', async () => {
	const screen = await renderSSR(RotaCard);
	await rotaRefresh(screen);
});
