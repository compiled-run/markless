import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './page.tsrx';
import { parkPointerBeforeMount, settledCount, watchForThrows } from './counting.ts';

// A resumed SSR page loads its runtime on the first gesture, so that gesture is
// captured before the runtime exists and replayed once it lands. Each count
// here is per element and exact: a replay the live listener also ran reads 2.
// Only the FIRST gesture on a page is inside that window, so each gesture kind
// gets its own mount.
afterEach(() => cleanup());

const Background = page.getByTestId('background');
const HoverLabel = page.getByTestId('hover-label');
const ClickLabel = page.getByTestId('click-label');
const KeyHost = page.getByTestId('key-host');
const Enters = page.getByTestId('enters');
const Clicks = page.getByTestId('clicks');
const Keys = page.getByTestId('keys');

const countOf = (locator: typeof Enters) => () => Number(locator.element().textContent);

async function walkPointerOntoHoverLabel(): Promise<void> {
	await userEvent.hover(Background);
	await userEvent.hover(HoverLabel);
}

async function pressKeyOnKeyHost(): Promise<void> {
	// Focused directly rather than clicked: a click would spend the one gesture
	// that opens the demand-load window before the keydown gets there.
	(KeyHost.element() as HTMLInputElement).focus();
	await userEvent.keyboard('a');
}

test('CSR: each gesture reaches its handler exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await render(Page);
		await walkPointerOntoHoverLabel();
		expect(await settledCount(countOf(Enters))).toBe(1);
		await userEvent.click(ClickLabel);
		expect(await settledCount(countOf(Clicks))).toBe(1);
		await pressKeyOnKeyHost();
		expect(await settledCount(countOf(Keys))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a pointerenter across the demand-load window is dispatched exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);
		await walkPointerOntoHoverLabel();
		expect(await settledCount(countOf(Enters))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a click across the demand-load window is dispatched exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);
		await userEvent.click(ClickLabel);
		expect(await settledCount(countOf(Clicks))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a keydown across the demand-load window is dispatched exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);
		await pressKeyOnKeyHost();
		expect(await settledCount(countOf(Keys))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
