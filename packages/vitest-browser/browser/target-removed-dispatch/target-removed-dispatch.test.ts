import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './trd-page.tsrx';

afterEach(cleanup);

// A navigation or a facade swap takes an element out while the browser is still dispatching
// an event at it. A router listens on the document in the capture phase, so it can do that
// before Markless's own listener on the container sees the event at all.

function reportedErrors(): { readonly messages: string[]; readonly stop: () => void } {
	const messages: string[] = [];
	const listener = (event: ErrorEvent) => {
		messages.push(String(event.error?.message ?? event.message));
		event.preventDefault();
	};
	const rejection = (event: PromiseRejectionEvent) => {
		messages.push(String((event.reason as Error | undefined)?.message ?? event.reason));
		event.preventDefault();
	};
	const consoleError = console.error;
	console.error = (...args: unknown[]) => {
		messages.push(args.map(String).join(' '));
	};
	window.addEventListener('error', listener);
	window.addEventListener('unhandledrejection', rejection);
	return {
		messages,
		stop: () => {
			window.removeEventListener('error', listener);
			window.removeEventListener('unhandledrejection', rejection);
			console.error = consoleError;
		},
	};
}

const one = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const text = (selector: string) => document.querySelector(selector)?.textContent;

// Removes `removed` (once) from a document capture listener when `eventName` reaches `target`.
function removeBeforeMarkless(target: string, eventName: string, removed: string): () => void {
	const element = one(target);
	const remove = (event: Event) => {
		if (event.target !== element) return;
		document.removeEventListener(eventName, remove, true);
		one(removed).replaceWith(one(removed).cloneNode(true));
	};
	document.addEventListener(eventName, remove, true);
	return () => document.removeEventListener(eventName, remove, true);
}

async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 150));
}

async function wake() {
	await userEvent.click(one('[data-like]'));
	await expect.poll(() => text('[data-like]')).toBe('1');
}

async function withoutErrors(run: () => Promise<void>) {
	const errors = reportedErrors();
	try {
		await run();
		await settle();
		expect(errors.messages).toEqual([]);
	} finally {
		errors.stop();
	}
}

for (const mode of ['SSR', 'CSR'] as const) {
	const mount = () => (mode === 'SSR' ? renderSSR(Page) : render(Page));
	for (const warm of [false, true]) {
		const label = `${mode}${warm ? ' after a first click' : ''}`;

		test(`${label}: focus on a link a navigation takes out still reaches the handler above it`, async () => {
			await mount();
			if (warm) await wake();
			const stop = removeBeforeMarkless('[data-link]', 'focusin', '[data-link]');
			await withoutErrors(async () => {
				one('[data-link]').focus();
				await expect.poll(() => text('[data-focused]')).toBe('1');
			});
			stop();
		});

		test(`${label}: focus on a link whose whole sidebar a navigation replaces raises no error`, async () => {
			await mount();
			if (warm) await wake();
			const stop = removeBeforeMarkless('[data-link]', 'focusin', '[data-sidebar]');
			await withoutErrors(async () => one('[data-link]').focus());
			stop();
		});

		test(`${label}: focus on a link in a drawer the page opened, which a navigation replaces, raises no error`, async () => {
			await mount();
			if (warm) await wake();
			await userEvent.click(one('[data-menu]'));
			await expect.poll(() => document.querySelector('[data-drawer-link]')).not.toBeNull();
			const stop = removeBeforeMarkless('[data-drawer-link]', 'focusin', '[data-drawer]');
			await withoutErrors(async () => one('[data-drawer-link]').focus());
			stop();
		});

		test(`${label}: focus on a link in a drawer the page opened still reaches the handler above it`, async () => {
			await mount();
			if (warm) await wake();
			await userEvent.click(one('[data-menu]'));
			await expect.poll(() => document.querySelector('[data-drawer-link]')).not.toBeNull();
			const stop = removeBeforeMarkless('[data-drawer-link]', 'focusin', '[data-drawer-link]');
			await withoutErrors(async () => {
				one('[data-drawer-link]').focus();
				await expect.poll(() => text('[data-focused]')).toBe('10');
			});
			stop();
		});

		test(`${label}: a hover on a facade that swaps itself out raises no error`, async () => {
			await mount();
			if (warm) await wake();
			const stop = removeBeforeMarkless('[data-play]', 'pointerover', '[data-player]');
			await withoutErrors(async () => userEvent.hover(one('[data-play]')));
			stop();
		});

		test(`${label}: leaving a field a navigation takes out raises no error`, async () => {
			await mount();
			if (warm) await wake();
			one('[data-search]').focus();
			const stop = removeBeforeMarkless('[data-search]', 'focusout', '[data-search-form]');
			await withoutErrors(async () => one('[data-search]').blur());
			stop();
		});
	}
}
