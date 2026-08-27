import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './nested-page.tsrx';
import { parkPointerBeforeMount, settledCount, watchForThrows } from './counting.ts';

// Same window as the flat page, deeper: the gesture lands two levels under the
// element that answers it, so the container's capture listener sees the same
// gesture once per element on the way down and the runtime must still run the
// record once.
afterEach(() => cleanup());

const Background = page.getByTestId('nested-background');
const List = page.getByTestId('nested-list');
const Label = page.getByTestId('nested-label');
const Enters = page.getByTestId('nested-enters');
const Clicks = page.getByTestId('nested-clicks');
const Keys = page.getByTestId('nested-keys');

async function walkPointerOntoLabel(): Promise<void> {
	await userEvent.hover(Background);
	await userEvent.hover(Label);
}

async function pressKeyOnList(): Promise<void> {
	// Focused rather than clicked: a click would spend the one gesture that opens
	// the demand-load window before the keydown gets there.
	(List.element() as HTMLElement).focus();
	await userEvent.keyboard('a');
}

test('CSR: a gesture under the element that answers it runs the record once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await render(Page);
		await walkPointerOntoLabel();
		expect(await settledCount(() => Number(Enters.element().textContent))).toBe(1);
		await userEvent.click(Label);
		expect(await settledCount(() => Number(Clicks.element().textContent))).toBe(1);
		await pressKeyOnList();
		expect(await settledCount(() => Number(Keys.element().textContent))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a pointerenter two levels under its record is dispatched exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);
		await walkPointerOntoLabel();
		expect(await settledCount(() => Number(Enters.element().textContent))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: a click on a descendant of its record is dispatched exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await parkPointerBeforeMount();
		await renderSSR(Page);
		await userEvent.click(Label);
		expect(await settledCount(() => Number(Clicks.element().textContent))).toBe(1);
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
		await pressKeyOnList();
		expect(await settledCount(() => Number(Keys.element().textContent))).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
