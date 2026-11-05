import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ParentState from './direct-callback/parent-state.tsrx';
import ParentStatePage from './direct-callback/parent-state-page.tsrx';
import TwoCallbacks from './direct-callback/two-callbacks.tsrx';
import TwoCallbacksPage from './direct-callback/two-callbacks-page.tsrx';
import WidgetShared from './direct-callback/widget-shared.tsrx';
import WidgetSharedPage from './direct-callback/widget-shared-page.tsrx';

// A received callback prop handed straight to a native element (`<button onClick={onPress}>`).

afterEach(() => cleanup());

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

async function withoutPageErrors(run: () => Promise<void>) {
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
	const onRejection = (event: PromiseRejectionEvent) => errors.push(event.reason);
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	try {
		await run();
		await settle();
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
	}
}

const press = (container: HTMLElement, selector: string) =>
	container.querySelector<HTMLButtonElement>(selector)!.click();

async function eachInstanceRunsItsOwnCallback(container: HTMLElement) {
	const last = () => container.querySelector('[data-last]')!.textContent;
	await withoutPageErrors(async () => {
		for (const [selector, to] of [
			['[data-key="light"]', 'light'],
			['[data-press="up"]', 'up'],
			['[data-key="dark"]', 'dark'],
			['[data-press="down"]', 'down click'],
			['[data-key="light"]', 'light'],
		] as const) {
			press(container, selector);
			await expect.poll(last).toBe(to);
		}
	});
}

async function anInstanceGivenNoCallbackRunsNothing(container: HTMLElement) {
	const last = () => container.querySelector('[data-last]')!.textContent;
	await withoutPageErrors(async () => {
		press(container, '[data-key="none"]');
		press(container, '[data-press="none"]');
		await settle();
		expect(last()).toBe('');
		press(container, '[data-press="up"]');
		await expect.poll(last).toBe('up');
		press(container, '[data-key="none"]');
		press(container, '[data-press="none"]');
		await settle();
		expect(last()).toBe('up');
	});
}

async function eachCallbackWritesItsOwnParentState(container: HTMLElement) {
	const count = (name: string) => container.querySelector(`[data-count="${name}"]`)?.textContent;
	await withoutPageErrors(async () => {
		press(container, '[data-press="apples-add"]');
		await expect.poll(() => count('apples')).toBe('2');
		press(container, '[data-press="apples-double"]');
		await expect.poll(() => count('apples')).toBe('4');
		expect(count('pears')).toBe('1');
		press(container, '[data-press="pears-double"]');
		await expect.poll(() => count('pears')).toBe('2');
		expect(count('apples')).toBe('4');
	});
}

async function eachCallbackWritesItsOwnWidget(container: HTMLElement) {
	const sold = (name: string) => container.querySelector(`[data-sold="${name}"]`)?.textContent;
	const total = () => container.querySelector('[data-total]')?.textContent;
	await withoutPageErrors(async () => {
		press(container, '[data-press="cookies"]');
		await expect.poll(() => sold('cookies')).toBe('1');
		expect(sold('lemonade')).toBe('0');
		press(container, '[data-press="lemonade"]');
		press(container, '[data-press="lemonade"]');
		await expect.poll(() => sold('lemonade')).toBe('2');
		expect(sold('cookies')).toBe('1');
		expect(total()).toBe('3');
	});
}

test('CSR: two instances handed different callbacks each run their own', async () => {
	await eachInstanceRunsItsOwnCallback((await render(TwoCallbacks)).container as HTMLElement);
});
test('SSR resume: two instances handed different callbacks each run their own', async () => {
	await eachInstanceRunsItsOwnCallback((await renderSSR(TwoCallbacks)).container as HTMLElement);
});

test('CSR: two instances handed different callbacks, one module below the page', async () => {
	await eachInstanceRunsItsOwnCallback((await render(TwoCallbacksPage)).container as HTMLElement);
});
test('SSR resume: two instances handed different callbacks, one module below the page', async () => {
	await eachInstanceRunsItsOwnCallback(
		(await renderSSR(TwoCallbacksPage)).container as HTMLElement,
	);
});

test('CSR: an instance handed no callback runs nothing', async () => {
	await anInstanceGivenNoCallbackRunsNothing(
		(await render(TwoCallbacks)).container as HTMLElement,
	);
});
test('SSR resume: an instance handed no callback runs nothing', async () => {
	await anInstanceGivenNoCallbackRunsNothing(
		(await renderSSR(TwoCallbacks)).container as HTMLElement,
	);
});

test('CSR: an instance handed no callback runs nothing, one module below the page', async () => {
	await anInstanceGivenNoCallbackRunsNothing(
		(await render(TwoCallbacksPage)).container as HTMLElement,
	);
});
test('SSR resume: an instance handed no callback runs nothing, one module below the page', async () => {
	await anInstanceGivenNoCallbackRunsNothing(
		(await renderSSR(TwoCallbacksPage)).container as HTMLElement,
	);
});

test('CSR: a callback writes the state of the parent that passed it', async () => {
	await eachCallbackWritesItsOwnParentState((await render(ParentState)).container as HTMLElement);
});
test('SSR resume: a callback writes the state of the parent that passed it', async () => {
	await eachCallbackWritesItsOwnParentState(
		(await renderSSR(ParentState)).container as HTMLElement,
	);
});

test('CSR: a callback writes the state of the parent that passed it, one module below the page', async () => {
	await eachCallbackWritesItsOwnParentState(
		(await render(ParentStatePage)).container as HTMLElement,
	);
});
test('SSR resume: a callback writes the state of the parent that passed it, one module below the page', async () => {
	await eachCallbackWritesItsOwnParentState(
		(await renderSSR(ParentStatePage)).container as HTMLElement,
	);
});

test('CSR: a callback writes widget-scoped shared() state of its own widget', async () => {
	await eachCallbackWritesItsOwnWidget((await render(WidgetShared)).container as HTMLElement);
});
test('SSR resume: a callback writes widget-scoped shared() state of its own widget', async () => {
	await eachCallbackWritesItsOwnWidget((await renderSSR(WidgetShared)).container as HTMLElement);
});

test('CSR: a callback writes widget-scoped shared() state, one module below the page', async () => {
	await eachCallbackWritesItsOwnWidget((await render(WidgetSharedPage)).container as HTMLElement);
});
test('SSR resume: a callback writes widget-scoped shared() state, one module below the page', async () => {
	await eachCallbackWritesItsOwnWidget(
		(await renderSSR(WidgetSharedPage)).container as HTMLElement,
	);
});
