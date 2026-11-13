import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { AppendNewLoad } from './append-new-load.tsrx';
import { AppendWithCatch } from './append-with-catch.tsrx';
import { AppendWithoutCatch } from './append-without-catch.tsrx';
import { FailingAppend } from './failing-append.tsrx';

// A handler marks and announces only content whose async value its write re-runs; appending to local state re-runs none.
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 5 };
const REGION = '[data-markless-announcer]';

type Screen = { readonly container: unknown; readonly runtime?: { readonly runtime?: unknown } };

async function mounted(screen: Screen): Promise<HTMLElement> {
	await (
		screen.runtime?.runtime as { whenAsyncBoundariesSettled?: () => Promise<void> } | undefined
	)?.whenAsyncBoundariesSettled?.();
	return screen.container as HTMLElement;
}

const text = (container: ParentNode, selector: string) =>
	container.querySelector(selector)?.textContent?.trim() ?? null;

function click(container: ParentNode, selector: string): void {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

// Every element that carried aria-busy="true" at any moment, from attribute mutations rather than frame samples.
function watchBusy(container: HTMLElement) {
	const marked = new Set<Element>();
	const record = (mutations: MutationRecord[]) => {
		for (const mutation of mutations)
			if ((mutation.target as Element).getAttribute?.('aria-busy') === 'true')
				marked.add(mutation.target as Element);
	};
	const observer = new MutationObserver(record);
	observer.observe(container, { attributes: true, attributeFilter: ['aria-busy'], subtree: true });
	return () => {
		record(observer.takeRecords());
		observer.disconnect();
		return marked;
	};
}

// Every text the shared region holds, in order.
function listen() {
	const said: string[] = [];
	let last = document.querySelector(REGION)?.textContent ?? '';
	const observer = new MutationObserver(() => {
		const now = document.querySelector(REGION)?.textContent ?? '';
		if (now !== last && now !== '') said.push(now);
		last = now;
	});
	observer.observe(document.body, { childList: true, subtree: true, characterData: true });
	return () => {
		observer.disconnect();
		return said;
	};
}

// Past the busy-line deadline and the settled-line cadence, so a late announcement would have been said.
const announceWindow = () => new Promise((resolve) => setTimeout(resolve, 900));

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: with a @catch, appending a fetched page to local state marks nothing and announces nothing`, async () => {
		const container = await mounted(mode === 'CSR' ? await render(AppendWithCatch) : await renderSSR(AppendWithCatch));
		await expect.poll(() => text(container, '[data-items]'), poll).toBe('item 0.0item 1.0');
		await announceWindow();
		const stopBusy = watchBusy(container);
		const said = listen();
		click(container, '[data-more]');
		await expect.poll(() => text(container, '[data-more]'), poll).toBe('Loading more');
		await expect
			.poll(() => text(container, '[data-items]'), poll)
			.toBe('item 0.0item 1.0item 2.0item 3.0');
		await announceWindow();
		expect([...stopBusy()].map((element) => element.outerHTML)).toEqual([]);
		expect(said()).toEqual([]);
	});

	test(`${mode}: without a @catch, appending a fetched page marks nothing and announces nothing`, async () => {
		const container = await mounted(mode === 'CSR' ? await render(AppendWithoutCatch) : await renderSSR(AppendWithoutCatch));
		await expect.poll(() => text(container, '[data-items]'), poll).toBe('item 0.0item 1.0');
		await announceWindow();
		const stopBusy = watchBusy(container);
		const said = listen();
		click(container, '[data-more]');
		await expect
			.poll(() => text(container, '[data-items]'), poll)
			.toBe('item 0.0item 1.0item 2.0item 3.0');
		await announceWindow();
		expect([...stopBusy()].map((element) => element.outerHTML)).toEqual([]);
		expect(said()).toEqual([]);
	});

	test(`${mode}: with a @catch, a handler whose write re-runs the shown value still marks it and announces`, async () => {
		const container = await mounted(mode === 'CSR' ? await render(AppendWithCatch) : await renderSSR(AppendWithCatch));
		await expect.poll(() => text(container, '[data-items]'), poll).toBe('item 0.0item 1.0');
		const said = listen();
		click(container, '[data-reload]');
		await expect
			.poll(() => container.querySelector('[data-items]')?.getAttribute('aria-busy'), poll)
			.toBe('true');
		expect(text(container, '[data-items]'), 'the shown page stays while it reloads').toBe(
			'item 0.0item 1.0',
		);
		await expect.poll(() => text(container, '[data-items]'), poll).toBe('item 0.1item 1.1');
		await expect
			.poll(() => container.querySelector('[data-items]')?.getAttribute('aria-busy') ?? null, poll)
			.not.toBe('true');
		await expect.poll(() => document.querySelector(REGION)?.textContent, poll).toBe('Updated');
		expect(said()).toEqual(['Updating…', 'Updated']);
	});

	test(`${mode}: appending a cursor marks only the value it re-runs, and the new row loads on its own`, async () => {
		const container = await mounted(mode === 'CSR' ? await render(AppendNewLoad) : await renderSSR(AppendNewLoad));
		await expect.poll(() => text(container, '[data-latest]'), poll).toBe('item 0.0, item 1.0');
		const stopBusy = watchBusy(container);
		click(container, '[data-more]');
		await expect.poll(() => container.querySelector('[data-row-pending]'), poll).not.toBeNull();
		await expect
			.poll(() => container.querySelector('[data-latest]')?.getAttribute('aria-busy'), poll)
			.toBe('true');
		await expect.poll(() => text(container, '[data-row]'), poll).toBe('item 2.0, item 3.0');
		await expect.poll(() => text(container, '[data-latest]'), poll).toBe('item 2.1, item 3.1');
		expect(text(container, '[data-first]')).toBe('item 0.0, item 1.0');
		const latest = container.querySelector('[data-latest]');
		expect(
			[...stopBusy()].map((element) => (element === latest ? 'latest' : element.outerHTML)),
			'only the value the write re-runs is marked',
		).toEqual(['latest']);
	});

	test(`${mode}: a failed append still reaches the @catch, and reset brings the block back`, async () => {
		const reasons: unknown[] = [];
		const onRejection = (event: PromiseRejectionEvent) => {
			reasons.push(event.reason);
			event.preventDefault();
		};
		window.addEventListener('unhandledrejection', onRejection);
		try {
			const container = await mounted(mode === 'CSR' ? await render(FailingAppend) : await renderSSR(FailingAppend));
			await expect.poll(() => text(container, '[data-items]'), poll).toBe('item 0.0, item 1.0');
			click(container, '[data-more]');
			await expect.poll(() => text(container, '[data-failed]'), poll).toBe('page is down');
			click(container, '[data-retry]');
			await expect.poll(() => text(container, '[data-items]'), poll).toBe('item 0.0, item 1.0');
			await expect.poll(() => container.querySelector('[data-failed]'), poll).toBeNull();
		} finally {
			window.removeEventListener('unhandledrejection', onRejection);
		}
	});
}
