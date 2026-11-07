import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderServerHTML, renderStreamShell } from '../src/index.ts';
import { Quote } from './resume-cache/quote.tsrx';
import { quotes, type Quote as QuoteValue } from './resume-cache/quote-source.ts';
import { deferred, listen, poll, resetQuotes, shows, text, watchPending } from './resume-cache/support.ts';

// A page the back-forward cache restores shows what it had, then its async values re-ask quietly in place.
beforeEach(() => resetQuotes());
afterEach(async () => {
	await cleanup();
	for (const node of document.body.querySelectorAll('template[m\\:arm],script[type^="markless/"]')) node.remove();
	delete (globalThis as { __mArm?: unknown }).__mArm;
});

const restore = (persisted = true) => dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));

async function reasksInPlace(container: HTMLElement, runsBefore: number, before: string) {
	const section = container.querySelector('[data-quote]');
	const paragraph = container.querySelector('[data-text]');
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	field.focus();
	const answer = deferred<QuoteValue>();
	quotes.answer = () => answer.promise;
	const said = listen();
	const seen = watchPending();
	restore();
	await expect.poll(() => quotes.runs, poll).toBe(runsBefore + 1);
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(text(container, '[data-text]')).toBe(before);
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	answer.resolve({ text: `${before}, again` });
	await shows(container, '[data-text]', `${before}, again`);
	expect(container.querySelector('[data-quote]')).toBe(section);
	expect(container.querySelector('[data-text]')).toBe(paragraph);
	expect(document.activeElement).toBe(field);
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	expect(seen()).toEqual([]);
	expect(said()).toEqual([]);
}

test('a client mount re-asks when the page is restored, and only then', async () => {
	const container = (await render(Quote)).container as HTMLElement;
	await shows(container, '[data-text]', 'quote 1');
	expect(quotes.runs).toBe(1);
	await reasksInPlace(container, 1, 'quote 1');
	restore(false);
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(quotes.runs).toBe(2);
});

test('a streamed page whose runtime woke re-asks when restored', async () => {
	resetQuotes(async (id) => ({ text: `quote ${id} in the tab` }));
	const { container } = renderServerHTML(await renderStreamShell(Quote));
	await shows(container, '[data-text]', 'quote 1 in the tab');
	await reasksInPlace(container, 1, 'quote 1 in the tab');
});

test('a server-rendered page restored before its runtime woke wakes and re-asks', async () => {
	const { container } = await renderSSR(Quote);
	expect(text(container, '[data-text]')).toBe('quote 1');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(quotes.runs).toBe(0);
	await reasksInPlace(container as HTMLElement, 0, 'quote 1');
});

test('a failed re-ask keeps what the page showed and adds @catch after it', async () => {
	const container = (await render(Quote)).container as HTMLElement;
	await shows(container, '[data-text]', 'quote 1');
	quotes.answer = async () => {
		throw new Error('Quotes are down');
	};
	restore();
	await shows(container, '[data-failed]', 'Quotes are down');
	expect(text(container, '[data-text]')).toBe('quote 1');
});
