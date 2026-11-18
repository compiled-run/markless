import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Catalog from './catalog.tsrx';
import Ticker from './own-region.tsrx';
import MugShelf from './reload-shelf.tsrx';

// A refresh over shown content is announced in one shared polite status region the framework owns.
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 10 };
const REGION = '[data-markless-announcer]';

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };

async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

// Every text the region holds, in order, from the moment the test starts listening.
function listen() {
	const said: string[] = [];
	let last = document.querySelector(REGION)?.textContent ?? '';
	const observer = new MutationObserver(() => {
		const text = document.querySelector(REGION)?.textContent ?? '';
		if (text !== last && text !== '') said.push(text);
		last = text;
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	return () => {
		observer.disconnect();
		return said;
	};
}

function click(container: HTMLElement, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

const settleWindow = () => new Promise((resolve) => setTimeout(resolve, 700));

async function refreshThenFail(screen: Screen) {
	const container = await mounted(screen);
	const firstLoad = listen();
	await expect.poll(() => container.querySelector('[data-list]')?.textContent, poll).toBe('a1a2');
	await settleWindow();
	expect(firstLoad(), 'first load announces nothing').toEqual([]);

	const refresh = listen();
	click(container, '[data-next]');
	await expect.poll(() => container.querySelector('[data-list]')?.textContent, poll).toBe('b1b2');
	await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
	expect(refresh()).toEqual(['Updating…', 'Updated']);

	const region = document.querySelector(REGION)!;
	expect(region.getAttribute('role')).toBe('status');
	expect(region.getAttribute('aria-live')).toBe('polite');
	expect(region.closest('[aria-busy]'), 'the region sits outside every busy element').toBeNull();
	expect(container.contains(region), 'the region lives outside the app markup').toBe(false);

	const failure = listen();
	click(container, '[data-break]');
	await expect
		.poll(() => container.querySelector('[data-failed]')?.textContent, poll)
		.toBe('Search is down');
	await expect
		.poll(() => document.querySelector(REGION)?.textContent, poll)
		.toBe('Update failed');
	expect(failure()).toEqual(['Updating…', 'Update failed']);
}

test('a refresh announces Updating then Updated, a failed one Update failed, a first load nothing', async () => {
	await refreshThenFail(await render(Catalog));
});

test('server-rendered and resumed: a refresh announces Updating then Updated, a failed one Update failed', async () => {
	await refreshThenFail(await renderSSR(Catalog));
});

test('a first load in the browser announces nothing', async () => {
	const firstLoad = listen();
	const container = await mounted(await render(Catalog));
	await expect.poll(() => container.querySelector('[data-list]')?.textContent, poll).toBe('a1a2');
	await settleWindow();
	expect(firstLoad()).toEqual([]);
});

test('a typing burst of refreshes is announced once', async () => {
	const container = await mounted(await render(Catalog));
	await expect.poll(() => container.querySelector('[data-list]')?.textContent, poll).toBe('a1a2');
	const stop = listen();
	for (const key of ['c', 'd', 'e']) {
		click(container, `[data-type-${key}]`);
		await new Promise((resolve) => setTimeout(resolve, 60));
	}
	await expect.poll(() => container.querySelector('[data-list]')?.textContent, poll).toBe('e1e2');
	await settleWindow();
	expect(stop()).toEqual(['Updating…', 'Updated']);
});

test('a change that runs no async value announces nothing', async () => {
	const container = await mounted(await render(Catalog));
	await expect.poll(() => container.querySelector('[data-list]')?.textContent, poll).toBe('a1a2');
	const stop = listen();
	click(container, '[data-count]');
	click(container, '[data-count]');
	await expect.poll(() => container.querySelector('[data-count]')?.textContent, poll).toBe('2');
	await settleWindow();
	expect(stop()).toEqual([]);
});

test('a block inside an element with its own aria-live is left to the author', async () => {
	const container = await mounted(await render(Ticker));
	await expect.poll(() => container.querySelector('[data-price]')?.textContent, poll).toBe('40');
	const stop = listen();
	click(container, '[data-switch]');
	await expect.poll(() => container.querySelector('[data-price]')?.textContent, poll).toBe('60');
	await settleWindow();
	expect(stop()).toEqual([]);
});

test('a counter the recipe reads, bumped after a save, refreshes the list in place and announces it', async () => {
	const container = await mounted(await render(MugShelf));
	await expect
		.poll(() => container.querySelector('[data-mugs]')?.textContent, poll)
		.toBe('Short');
	const stop = listen();
	click(container, '[data-add]');
	await expect
		.poll(() => container.querySelector('[data-mugs]')?.getAttribute('aria-busy'), poll)
		.toBe('true');
	expect(
		container.querySelector('[data-mugs]')?.textContent,
		'the old list stays while it reloads',
	).toBe('Short');
	await expect
		.poll(() => container.querySelector('[data-mugs]')?.textContent, poll)
		.toBe('ShortTall');
	await settleWindow();
	expect(stop()).toEqual(['Updating…', 'Updated']);
	expect(container.querySelector('[data-mugs]')?.hasAttribute('aria-busy')).toBe(false);
});
