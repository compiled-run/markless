import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { executedModules, resetExecutedModules } from '../support/progressive-helpers.ts';
import { watchForThrows } from '../demand-load-replay/counting.ts';
import ClientPage from './client-page.tsrx';
import DescendantPage from './descendant-page.tsrx';
import KeylessPage from './keyless-page.tsrx';
import RacePage from './race-page.tsrx';
import ServedPage from './served-page.tsrx';

// A key event can only reach an element that already holds focus, and focus
// arrives first. These pin that the focus, not the first keystroke, spends the
// demand-load window on both the served and the client-rendered container - and
// that spending it never costs the keystroke itself.
//
// Each witness that reads `executedModules` owns its own fixture module:
// the helper records a module's FIRST execution, so a shared fixture reads warm.

afterEach(async () => {
	resetExecutedModules();
	await cleanup();
});

const Option0 = page.getByTestId('option-0');
const Option0Label = page.getByTestId('option-0-label');
const Keyless = page.getByTestId('keyless-host');
const Selected = page.getByTestId('selected');
const Keys = page.getByTestId('keys');

const countOf = (locator: typeof Keys) => () => Number(locator.element().textContent);

/** Focus, then the earliest a key could realistically follow it. */
async function focusThenWait(element: Element): Promise<void> {
	(element as HTMLElement).focus();
	await new Promise((resolve) => setTimeout(resolve, 50));
}

test('SSR: an arrow 50ms after focus moves the selection, on a handler already loaded', async () => {
	const thrown = watchForThrows();
	try {
		await renderSSR(ServedPage);
		resetExecutedModules();

		await focusThenWait(Option0.element());
		// The handler is in the browser before the key that needs it exists.
		expect(executedModules().length).toBeGreaterThan(0);

		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(countOf(Selected)).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

// A client-rendered container in this harness holds its handlers in the module
// the test already imported, so there is no fetch left to observe: what the
// witness can still hold is that priming the focus never becomes a dispatch.
// packages/web/test/csr-focus-primed-preload.test.ts pins the fetch itself.
test('CSR: an arrow 50ms after focus moves the selection, and the focus dispatched nothing', async () => {
	const thrown = watchForThrows();
	try {
		await render(ClientPage);

		await focusThenWait(Option0.element());
		expect(countOf(Keys)()).toBe(0);

		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(countOf(Selected)).toBe(1);
		expect(countOf(Keys)()).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: focus onto a press-only host fetches the handler Enter would reach', async () => {
	await renderSSR(KeylessPage);
	resetExecutedModules();

	await focusThenWait(Keyless.element());

	expect(executedModules().length).toBeGreaterThan(0);
	// Fetched, never dispatched.
	expect(Number(page.getByTestId('clicks').element().textContent)).toBe(0);
});

test('CSR: focus onto a press-only host runs no handler', async () => {
	await render(KeylessPage);

	await focusThenWait(Keyless.element());

	expect(Number(page.getByTestId('clicks').element().textContent)).toBe(0);
});

test('SSR: a key pressed inside the preload window is delivered exactly once', async () => {
	const thrown = watchForThrows();
	try {
		await renderSSR(RacePage);
		// No wait at all: the key rides the same window the focus opened.
		(Option0.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowDown}');

		await expect.poll(countOf(Selected)).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(countOf(Keys)()).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});

test('SSR: focus on a descendant primes the record that answers the key', async () => {
	const thrown = watchForThrows();
	try {
		await renderSSR(DescendantPage);
		resetExecutedModules();

		Option0Label.element().setAttribute('tabindex', '-1');
		await focusThenWait(Option0Label.element());
		expect(executedModules().length).toBeGreaterThan(0);

		(Option0.element() as HTMLElement).focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(countOf(Selected)).toBe(1);
		expect(thrown.seen).toEqual([]);
	} finally {
		thrown.stop();
	}
});
