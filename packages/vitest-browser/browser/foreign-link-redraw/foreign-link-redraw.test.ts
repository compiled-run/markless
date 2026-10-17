import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './flr-page.tsrx';

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

// A script outside Markless draws a link list into an element whose own click handler is
// Markless's, and redraws the list from a document listener as a soft navigation does: by
// the time the delegated dispatch runs, the clicked element has left the page.
function drawFavourites(list: HTMLElement) {
	list.innerHTML = '<p><a href="#article" data-fav><img alt="" data-fav-img></a></p>';
}

async function pinRedrawnLinkReachesItsContainer() {
	const like = document.querySelector<HTMLElement>('[data-like]')!;
	like.click();
	await expect.poll(() => like.textContent).toBe('1');

	const list = document.querySelector<HTMLElement>('[data-favourites]')!;
	const redraw = (event: Event) => {
		if (!(event.target as Element).closest?.('[data-fav]')) return;
		event.preventDefault();
		drawFavourites(list);
	};
	document.addEventListener('click', redraw);
	const errors = reportedErrors();
	try {
		drawFavourites(list);
		document.querySelector<HTMLElement>('[data-fav-img]')!.click();
		document.querySelector<HTMLElement>('[data-fav-img]')!.click();
		await expect.poll(() => document.querySelector('[data-opened]')?.textContent).toBe('2');
		like.click();
		await expect.poll(() => like.textContent).toBe('2');
		expect(errors.messages).toEqual([]);
	} finally {
		errors.stop();
		document.removeEventListener('click', redraw);
	}
}

test('CSR: a click on a link a foreign script redraws still reaches its container handler', async () => {
	await render(Page);
	await pinRedrawnLinkReachesItsContainer();
});

test('SSR: a click on a link a foreign script redraws still reaches its container handler', async () => {
	await renderSSR(Page);
	await pinRedrawnLinkReachesItsContainer();
});
