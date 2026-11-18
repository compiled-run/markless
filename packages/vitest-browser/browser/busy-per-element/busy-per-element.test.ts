import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AwaitedInventory from './awaited-inventory.tsrx';
import ComposedInventory from './composed-inventory.tsrx';
import ComposedProfile from './composed-profile.tsrx';
import ComposedRota from './composed-rota.tsrx';
import ComposedTally from './composed-tally.tsrx';
import ForecastDesk from './forecast-desk.tsrx';
import InventoryPanel from './inventory-panel.tsrx';
import InventoryRows from './inventory-rows.tsrx';
import NestedInventory from './nested-inventory.tsrx';
import NestedTryLedger from './nested-try-inventory.tsrx';
import OpenedInventory from './opened-inventory.tsrx';
import ProfileBoard from './profile-board.tsrx';
import RotaCard from './rota-card.tsrx';
import TallyCard from './tally-card.tsrx';

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
		frames.some((marks) => /data-(sort|check|block|host)/.test(marks)),
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

// Marks are read over the whole screen; `scope` picks the instance clicked, so a sibling row's marks fail the check.
async function inventoryRefresh(
	screen: Screen,
	scope: (container: HTMLElement) => HTMLElement = (container) => container,
) {
	const container = await mounted(screen);
	const panel = scope(container);
	await expect.poll(() => panel.querySelector('[data-items]')?.textContent, poll).toBe('pq');
	const stop = sampleBusy(container);
	click(panel, '[data-shelf]');
	await expect.poll(() => busyMarks(container), poll).toBe('data-caption data-items data-total');
	expect(panel.querySelector('[data-caption]')?.textContent).toBe('Shelf north stock');
	await expect.poll(() => panel.querySelector('[data-items]')?.textContent, poll).toBe('r');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	expect(panel.querySelector('[data-total]')?.textContent).toBe('1');
	const frames = stop();
	expect(
		frames.some((marks) =>
			/data-(compact|static|panel|host|middle|outer|title|open)|input|main/.test(marks),
		),
		'sync, static or wrapping content was marked',
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
		frames.some((marks) => /data-(toggle|card|host)/.test(marks)),
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

test('server-rendered and resumed: two async values in one block mark their own elements and clear as each settles', async () => {
	const screen = await renderSSR(ProfileBoard);
	await twoValuesSettleApart(screen);
});

// A route page renders its app as a child component, so the app's graph ids carry the instance path.
const firstPanel = (container: HTMLElement) => container.querySelector('main')!;

test('client-rendered inside another component: two async values mark their own elements', async () => {
	const screen = await render(ComposedProfile);
	await twoValuesSettleApart(screen);
});

test('client-rendered inside another component: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await render(ComposedInventory);
	await inventoryRefresh(screen);
});

test('client-rendered two components deep: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await render(NestedInventory);
	await inventoryRefresh(screen);
});

test("client-rendered as a row component: only the clicked row's readers are marked", async () => {
	const screen = await render(InventoryRows);
	await inventoryRefresh(screen, firstPanel);
});

test('client-rendered inside another component: an attribute, a computed child prop and keyed rows are marked', async () => {
	const screen = await render(ComposedRota);
	await rotaRefresh(screen);
});

test('server-rendered and resumed inside another component: two async values mark their own elements', async () => {
	const screen = await renderSSR(ComposedProfile);
	await twoValuesSettleApart(screen);
});

test('server-rendered and resumed inside another component: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await renderSSR(ComposedInventory);
	await inventoryRefresh(screen);
});

test('server-rendered and resumed two components deep: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await renderSSR(NestedInventory);
	await inventoryRefresh(screen);
});

test("server-rendered and resumed as a row component: only the clicked row's readers are marked", async () => {
	const screen = await renderSSR(InventoryRows);
	await inventoryRefresh(screen, firstPanel);
});

test('server-rendered and resumed inside another component: an attribute, a computed child prop and keyed rows are marked', async () => {
	const screen = await renderSSR(ComposedRota);
	await rotaRefresh(screen);
});

const opened = async (screen: Screen): Promise<Screen> => {
	const container = await mounted(screen);
	click(container, '[data-open]');
	await expect.poll(() => container.querySelector('[data-shelf]'), poll).not.toBeNull();
	return screen;
};

test('client-rendered inside an @if opened on the client: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await render(OpenedInventory);
	await inventoryRefresh(await opened(screen));
});

test('server-rendered and resumed inside an @if opened on the client: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await renderSSR(OpenedInventory);
	await inventoryRefresh(await opened(screen));
});

test('client-rendered inside an outer @try arm: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await render(AwaitedInventory);
	await inventoryRefresh(screen);
});

test('server-rendered and resumed inside an outer @try arm: a sync computed, a child prop and a keyed list are marked, nothing else', async () => {
	const screen = await renderSSR(AwaitedInventory);
	await inventoryRefresh(screen);
});

async function ledgerRefresh(screen: Screen) {
	const container = await mounted(screen);
	await expect.poll(() => container.querySelector('[data-entries]')?.textContent, poll).toBe('mn');
	const stop = sampleBusy(container);
	click(container, '[data-month]');
	await expect.poll(() => busyMarks(container), poll).toBe('data-count data-entries');
	await expect.poll(() => container.querySelector('[data-entries]')?.textContent, poll).toBe('o');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	expect(container.querySelector('[data-count]')?.textContent).toBe('1 entries');
	const frames = stop();
	expect(
		frames.some((marks) => marks !== '' && marks !== 'data-count data-entries'),
		'the owner, the static note or a block host was marked',
	).toBe(false);
}

test('client-rendered inside another component, an inner @try in an outer arm: its computed reader and keyed list are marked', async () => {
	const screen = await render(NestedTryLedger);
	await ledgerRefresh(screen);
});

test('server-rendered and resumed inside another component, an inner @try in an outer arm: its computed reader and keyed list are marked', async () => {
	const screen = await renderSSR(NestedTryLedger);
	await ledgerRefresh(screen);
});

// Read only through a computed: an unmatched read falls back to marking the whole block.
async function tallyRefresh(screen: Screen) {
	const container = await mounted(screen);
	await expect
		.poll(() => container.querySelector('[data-label]')?.textContent, poll)
		.toBe('Total 10');
	const stop = sampleBusy(container);
	click(container, '[data-round]');
	await expect.poll(() => busyMarks(container), poll).toBe('data-label');
	await expect
		.poll(() => container.querySelector('[data-label]')?.textContent, poll)
		.toBe('Total 20');
	await expect.poll(() => busyMarks(container), poll).toBe('');
	const frames = stop();
	expect(
		frames.some((marks) => marks !== '' && marks !== 'data-label'),
		'static content or a block host was marked',
	).toBe(false);
}

test('client-rendered mounted directly: a value read only through a computed marks that reader alone', async () => {
	const screen = await render(TallyCard);
	await tallyRefresh(screen);
});

test('client-rendered inside another component: a value read only through a computed marks that reader alone', async () => {
	const screen = await render(ComposedTally);
	await tallyRefresh(screen);
});

test('server-rendered and resumed mounted directly: a value read only through a computed marks that reader alone', async () => {
	const screen = await renderSSR(TallyCard);
	await tallyRefresh(screen);
});

test('server-rendered and resumed inside another component: a value read only through a computed marks that reader alone', async () => {
	const screen = await renderSSR(ComposedTally);
	await tallyRefresh(screen);
});
