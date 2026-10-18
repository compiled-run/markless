import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './flcr-page.tsrx';

afterEach(cleanup);

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

const favouritesMarkup =
	'<p><a href="#article" data-fav><img alt="fav" width="20" height="20" data-fav-img></a></p>';
const opened = () => document.querySelector('[data-opened]')?.textContent;
const container = () => document.querySelector<HTMLElement>('[data-favourites]')!;
const panel = () => document.querySelector<HTMLElement>('[data-panel]')!;

// A plain script draws links into a Markless container, and a capture-phase document listener
// (a soft navigation running before the router) redraws an element while the browser is still
// dispatching the press: every later listener sees a target that has left the page.
async function withCaptureRedraw(
	redrawn: () => HTMLElement,
	press: () => Promise<void>,
): Promise<string[]> {
	container().innerHTML = favouritesMarkup;
	const redraw = (event: Event) => {
		if (!(event.target as Element).closest?.('[data-fav]')) return;
		event.preventDefault();
		const element = redrawn();
		element.innerHTML = element === container() ? favouritesMarkup : element.innerHTML;
	};
	document.addEventListener('click', redraw, true);
	const errors = reportedErrors();
	try {
		await press();
		await new Promise((resolve) => setTimeout(resolve, 100));
		return errors.messages;
	} finally {
		errors.stop();
		document.removeEventListener('click', redraw, true);
	}
}

const clickImage = () => userEvent.click(document.querySelector<HTMLElement>('[data-fav-img]')!);
async function enterOnLink() {
	document.querySelector<HTMLElement>('[data-fav]')!.focus();
	await userEvent.keyboard('{Enter}');
}

async function wake() {
	const like = document.querySelector<HTMLElement>('[data-like]')!;
	await userEvent.click(like);
	await expect.poll(() => like.textContent).toBe('1');
}

for (const mode of ['SSR', 'CSR'] as const) {
	const mount = () => (mode === 'SSR' ? renderSSR(Page) : render(Page));
	for (const [gesture, press] of [
		['click on the image', clickImage],
		['Enter on the link', enterOnLink],
	] as const) {
		test(`${mode}: ${gesture}, container redrawn by a capture listener before any wake, runs the container handler`, async () => {
			await mount();
			expect(await withCaptureRedraw(container, press)).toEqual([]);
			await expect.poll(opened).toBe('1');
		});

		test(`${mode}: ${gesture}, container redrawn by a capture listener after a wake, runs the container handler`, async () => {
			await mount();
			await wake();
			expect(await withCaptureRedraw(container, press)).toEqual([]);
			await expect.poll(opened).toBe('1');
		});

		test(`${mode}: ${gesture}, an ancestor of the container redrawn by a capture listener, does not throw`, async () => {
			await mount();
			await wake();
			expect(await withCaptureRedraw(panel, press)).toEqual([]);
			const like = document.querySelector<HTMLElement>('[data-like]')!;
			await userEvent.click(like);
			await expect.poll(() => like.textContent).toBe('2');
		});
	}
}
