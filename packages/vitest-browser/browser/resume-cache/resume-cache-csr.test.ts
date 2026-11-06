import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { Quote } from './quote.tsrx';
import { quotes, type Quote as QuoteValue } from './quote-source.ts';
import {
	SCOPE,
	SEEDED,
	deferred,
	entries,
	listen,
	poll,
	resetQuotes,
	shows,
	text,
	watchPending,
} from './support.ts';

// A client mount of a page this tab already saw settled shows that content at once, with no @pending
// frame, and revalidates it in place as a refresh would.
beforeEach(() => {
	sessionStorage.clear();
	document.documentElement.setAttribute(SCOPE, 'visitor-1');
	resetQuotes();
});
afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
	document.documentElement.removeAttribute(SCOPE);
	sessionStorage.clear();
});

async function firstVisit(): Promise<number> {
	const container = (await render(Quote)).container as HTMLElement;
	await shows(container, '[data-text]', 'quote 1');
	await expect.poll(entries, poll).toHaveLength(1);
	const height = container.querySelector('[data-boundary]')!.getBoundingClientRect().height;
	await cleanup();
	return height;
}

test('first visit: @pending shows, then the settled content, as without a cache', async () => {
	const seen = watchPending();
	const container = (await render(Quote)).container as HTMLElement;
	await shows(container, '[data-text]', 'quote 1');
	expect(seen().length).toBeGreaterThan(0);
	expect(container.querySelector(`[${SEEDED}]`)).toBeNull();
	expect(quotes.runs).toBe(1);
});

test('reload: cached content paints with no @pending frame and no layout change, then revalidates in place', async () => {
	const height = await firstVisit();
	const revalidation = deferred<QuoteValue>();
	quotes.answer = () => revalidation.promise;
	const seen = watchPending();
	const said = listen();
	const container = (await render(Quote)).container as HTMLElement;

	expect(text(container, '[data-text]')).toBe('quote 1');
	expect(container.querySelector('[data-pending]')).toBeNull();
	const section = container.querySelector<HTMLElement>('[data-quote]')!;
	expect(section.hasAttribute(SEEDED)).toBe(true);
	expect(container.querySelector('[data-boundary]')!.getBoundingClientRect().height).toBe(height);
	// A refresh always fetches: the seed changes what shows meanwhile, never whether it happens.
	await expect.poll(() => quotes.runs, poll).toBe(2);
	await expect.poll(() => container.querySelectorAll('[aria-busy="true"]').length, poll).toBeGreaterThan(0);

	// Announced like any refresh once it outlasts the settle deadline.
	await expect.poll(() => document.querySelector('[data-markless-announcer]')?.textContent, poll).toBe('Updating…');
	const paragraph = container.querySelector('[data-text]');
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	field.focus();
	revalidation.resolve({ text: 'quote 1, revised' });
	await shows(container, '[data-text]', 'quote 1, revised');
	expect(container.querySelector('[data-quote]')).toBe(section);
	expect(container.querySelector('[data-text]')).toBe(paragraph);
	expect(document.activeElement).toBe(field);
	await expect.poll(() => section.hasAttribute(SEEDED), poll).toBe(false);
	await expect.poll(() => container.querySelectorAll('[aria-busy="true"]').length, poll).toBe(0);
	await expect.poll(() => document.querySelector('[data-markless-announcer]')?.textContent, poll).toBe('Updated');
	expect(said()).toEqual(['Updating…', 'Updated']);
	expect(seen()).toEqual([]);
	// The revalidated value replaces the entry.
	await expect.poll(() => sessionStorage.getItem(entries()[0]!), poll).toContain('quote 1, revised');
});

test('a failed revalidation shows @catch after the seeded content and drops the entry', async () => {
	await firstVisit();
	const revalidation = deferred<QuoteValue>();
	quotes.answer = () => revalidation.promise;
	const container = (await render(Quote)).container as HTMLElement;
	expect(text(container, '[data-text]')).toBe('quote 1');
	await expect.poll(() => quotes.runs, poll).toBe(2);

	revalidation.reject(new Error('Quotes are down'));
	await shows(container, '[data-failed]', 'Quotes are down');
	const kept = container.querySelector('[data-quote]')!;
	expect(text(kept, '[data-text]')).toBe('quote 1');
	expect(kept.compareDocumentPosition(container.querySelector('[data-failed]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(kept.hasAttribute(SEEDED)).toBe(false);
	expect(entries()).toEqual([]);
});

test('a slow revalidation keeps the seeded content busy past the stall threshold and never shows @pending', async () => {
	await firstVisit();
	const revalidation = deferred<QuoteValue>();
	quotes.answer = () => revalidation.promise;
	const seen = watchPending();
	const container = (await render(Quote)).container as HTMLElement;
	await expect.poll(() => quotes.runs, poll).toBe(2);
	await new Promise((resolve) => setTimeout(resolve, 5_600));
	expect(text(container, '[data-text]')).toBe('quote 1');
	expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
	revalidation.resolve({ text: 'quote 1, late' });
	await shows(container, '[data-text]', 'quote 1, late');
	expect(seen()).toEqual([]);
}, 15_000);

test('an entry from another build is ignored without an error', async () => {
	await firstVisit();
	for (const key of entries()) {
		const [prefix, cache, scope, build, ...rest] = key.split(':');
		sessionStorage.setItem([prefix, cache, scope, `${build}-older`, ...rest].join(':'), sessionStorage.getItem(key)!);
		sessionStorage.removeItem(key);
	}
	const seen = watchPending();
	const container = (await render(Quote)).container as HTMLElement;
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1');
	expect(seen().length).toBeGreaterThan(0);
});

test('a rotated session scope reaches none of the old entries', async () => {
	await firstVisit();
	document.documentElement.setAttribute(SCOPE, 'visitor-2');
	const container = (await render(Quote)).container as HTMLElement;
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1');
});

test('without a scope token the cache keeps and seeds nothing', async () => {
	document.documentElement.removeAttribute(SCOPE);
	const container = (await render(Quote)).container as HTMLElement;
	await shows(container, '[data-text]', 'quote 1');
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(entries()).toEqual([]);
});

test('an entry whose dependency key differs is a miss', async () => {
	await firstVisit();
	const [key] = entries();
	const entry = JSON.parse(sessionStorage.getItem(key!)!);
	sessionStorage.setItem(key!, JSON.stringify({ ...entry, k: entry.k.replace('1', '2') }));
	const container = (await render(Quote)).container as HTMLElement;
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1');
});

test('a malformed entry is a miss and is purged', async () => {
	await firstVisit();
	const [key] = entries();
	sessionStorage.setItem(key!, '{"k":"[1');
	const container = (await render(Quote)).container as HTMLElement;
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1');
	await expect.poll(() => sessionStorage.getItem(key!) !== '{"k":"[1', poll).toBe(true);
});

test('full storage keeps nothing and the next load is a normal first load', async () => {
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
	});
	const first = (await render(Quote)).container as HTMLElement;
	await shows(first, '[data-text]', 'quote 1');
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(entries()).toEqual([]);
	await cleanup();
	const container = (await render(Quote)).container as HTMLElement;
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1');
});

test('unavailable storage is a normal load', async () => {
	await firstVisit();
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new DOMException('Storage is disabled.', 'SecurityError');
	});
	const container = (await render(Quote)).container as HTMLElement;
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1');
});
