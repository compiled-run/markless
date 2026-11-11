import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, requested, resetCalls } from './gate.ts';
import Orders from './orders.tsrx';
import {
	fakeClock,
	intervalStarted,
	listOf,
	restoreTab,
	setTabHidden,
	until,
	watchLoudness,
} from './support.ts';

afterEach(async () => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	restoreTab();
	await cleanup();
});

const orders = () => listOf('li');
const twoOrders = [
	{ id: 1, item: 'Tall mug' },
	{ id: 2, item: 'Teapot' },
];

async function pollsOnlyWhileTheTabShows(firstLoadInBrowser: boolean) {
	if (firstLoadInBrowser) answer('orders');
	await until(orders, ['Tall mug']);
	const before = requested('orders');
	const loudness = watchLoudness();
	await vi.advanceTimersByTimeAsync(4_900);
	expect(requested('orders')).toBe(before);
	await vi.advanceTimersByTimeAsync(100);
	await until(() => requested('orders'), before + 1);
	answer('orders', { value: twoOrders });
	await until(orders, ['Tall mug', 'Teapot']);
	expect(loudness()).toEqual({ busy: 0, said: [] });

	setTabHidden(true);
	await vi.advanceTimersByTimeAsync(20_000);
	expect(requested('orders')).toBe(before + 1);

	setTabHidden(false);
	await vi.advanceTimersByTimeAsync(5_000);
	await until(() => requested('orders'), before + 2);
	await vi.advanceTimersByTimeAsync(1_000);
	expect(requested('orders')).toBe(before + 2);
}

test('CSR: polling asks every 5 s, quietly, and skips while the tab is hidden', async () => {
	resetCalls();
	fakeClock();
	await render(Orders);
	await pollsOnlyWhileTheTabShows(true);
});

test('SSR: polling starts once the resumed page is idle and skips while the tab is hidden', async () => {
	resetCalls();
	fakeClock();
	await renderSSR(Orders);
	await intervalStarted(5_000);
	expect(requested('orders')).toBe(0);
	await pollsOnlyWhileTheTabShows(false);
});

test('CSR: a poll that lands while the last one is still out replaces it, and the late answer is dropped', async () => {
	resetCalls({ ignoreAbort: true });
	fakeClock();
	await render(Orders);
	answer('orders');
	await until(orders, ['Tall mug']);
	await vi.advanceTimersByTimeAsync(5_000);
	await vi.advanceTimersByTimeAsync(5_000);
	expect(requested('orders')).toBe(3);
	answer('orders', { value: twoOrders });
	answer('orders', { value: [{ id: 3, item: 'Saucer' }] });
	await until(orders, ['Saucer']);
	await vi.advanceTimersByTimeAsync(1_000);
	expect(orders()).toEqual(['Saucer']);
});
