import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import { installMarklessResumeCache } from '@markless/web/fns/resume-cache';
import { Quote } from './quote.tsrx';
import { Other } from './other.tsrx';
import TodoApp from '../async-optimistic-rows/todo-app.tsrx';
import { resetSaveApi, saveCalls } from '../async-optimistic-rows/save-api.ts';
import { quotes, type Quote as QuoteValue } from './quote-source.ts';
import {
	SCOPE,
	SEEDED,
	clearEntries,
	deferred,
	drainEntries,
	entries,
	listen,
	poll,
	resetQuotes,
	shows,
	text,
	useScope,
	watchPending,
} from './support.ts';

const TOKEN = useScope('csr-visitor');

// A client mount of a page this tab already saw settled shows that content at once, with no @pending
// frame, and revalidates it in place, quietly: nobody asked for that refresh.
beforeEach(() => {
	clearEntries();
	document.documentElement.setAttribute(SCOPE, TOKEN);
	resetQuotes();
});
afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
	document.documentElement.removeAttribute(SCOPE);
	// A new document starts without the token the last one carried.
	delete (document as { __mScope?: unknown }).__mScope;
	await drainEntries();
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

test('reload: cached content paints with no @pending frame and no layout change, then revalidates quietly in place', async () => {
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
	// Past the point a loud refresh would mark itself busy and say "Updating…".
	await new Promise((resolve) => setTimeout(resolve, 1_200));
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	const paragraph = container.querySelector('[data-text]');
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	field.focus();
	revalidation.resolve({ text: 'quote 1, revised' });
	await shows(container, '[data-text]', 'quote 1, revised');
	expect(container.querySelector('[data-quote]')).toBe(section);
	expect(container.querySelector('[data-text]')).toBe(paragraph);
	expect(document.activeElement).toBe(field);
	await expect.poll(() => section.hasAttribute(SEEDED), poll).toBe(false);
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	expect(said()).toEqual([]);
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

test('a slow revalidation keeps the seeded content up, marked seeded and not busy, past the stall threshold', async () => {
	await firstVisit();
	const revalidation = deferred<QuoteValue>();
	quotes.answer = () => revalidation.promise;
	const seen = watchPending();
	const container = (await render(Quote)).container as HTMLElement;
	await expect.poll(() => quotes.runs, poll).toBe(2);
	await new Promise((resolve) => setTimeout(resolve, 5_600));
	expect(text(container, '[data-text]')).toBe('quote 1');
	expect(container.querySelector('[data-quote]')!.hasAttribute(SEEDED)).toBe(true);
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
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
	document.documentElement.setAttribute(SCOPE, `${TOKEN}-rotated`);
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

test('a value a click fetched is never kept: the entry keeps what the page loaded with', async () => {
	await firstVisit();
	const container = (await render(Quote)).container as HTMLElement;
	await expect.poll(() => quotes.runs, poll).toBe(2);
	await expect.poll(() => container.querySelector(`[${SEEDED}]`), poll).toBeNull();
	container.querySelector<HTMLButtonElement>('[data-next]')!.click();
	await shows(container, '[data-text]', 'quote 2');
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(entries()).toHaveLength(1);
	expect(sessionStorage.getItem(entries()[0]!)).toContain('quote 1');
	expect(sessionStorage.getItem(entries()[0]!)).not.toContain('quote 2');
});

test('a back-forward cache restore revalidates the seeded page quietly', async () => {
	await firstVisit();
	const container = (await render(Quote)).container as HTMLElement;
	await expect.poll(() => quotes.runs, poll).toBe(2);
	await expect.poll(() => container.querySelector(`[${SEEDED}]`), poll).toBeNull();
	const said = listen();
	quotes.answer = async () => ({ text: 'quote 1, restored' });
	dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
	await shows(container, '[data-text]', 'quote 1, restored');
	expect(quotes.runs).toBe(3);
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	expect(said()).toEqual([]);
	dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(quotes.runs).toBe(3);
});

test('back navigation: returning to a page seeds it from the cache; another route never sees its entry', async () => {
	const start = location.pathname;
	try {
		history.pushState(null, '', '/quotes');
		await firstVisit();
		history.pushState(null, '', '/elsewhere');
		const other = (await render(Other)).container as HTMLElement;
		expect(other.querySelector('[data-other]')).not.toBeNull();
		await cleanup();
		const elsewhere = (await render(Quote)).container as HTMLElement;
		expect(elsewhere.querySelector('[data-pending]')).not.toBeNull();
		await shows(elsewhere, '[data-text]', 'quote 1');
		await expect.poll(entries, poll).toHaveLength(2);
		await cleanup();

		history.pushState(null, '', '/quotes');
		const seen = watchPending();
		const back = (await render(Quote)).container as HTMLElement;
		expect(text(back, '[data-text]')).toBe('quote 1');
		expect(back.querySelector('[data-quote]')!.hasAttribute(SEEDED)).toBe(true);
		expect(seen()).toEqual([]);
	} finally {
		history.pushState(null, '', start);
	}
});

test('a save a click started is never kept, so a reload never replays it', async () => {
	resetSaveApi();
	const container = (await render(TodoApp)).container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, poll).toBe(1);
	const input = container.querySelector<HTMLInputElement>('[data-title]')!;
	input.value = 'Pay rent';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
	await expect.poll(() => container.querySelector('[data-saving-row] [data-confirmed]')?.textContent, poll).toBe('Pay rent');
	await new Promise((resolve) => setTimeout(resolve, 300));
	// The list's rows bring async values and state of their own, so the list is not kept either.
	for (const key of entries()) expect(sessionStorage.getItem(key)).not.toMatch(/Write report|Pay rent/);
	await cleanup();

	const reloaded = (await render(TodoApp)).container as HTMLElement;
	await expect
		.poll(() => [...reloaded.querySelectorAll('[data-editing-row] [data-confirmed]')].map((row) => row.textContent?.split(' · ')[0]), poll)
		.toEqual(['Write report', 'Pay rent']);
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(saveCalls()).toHaveLength(1);
});

test('an excluded value is never kept, and an entry kept before the exclusion is purged, not seeded', async () => {
	await firstVisit();
	const [key] = entries();
	installMarklessResumeCache(['quo*']);
	try {
		const container = (await render(Quote)).container as HTMLElement;
		expect(container.querySelector('[data-pending]')).not.toBeNull();
		await shows(container, '[data-text]', 'quote 1');
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(sessionStorage.getItem(key!)).toBeNull();
		expect(entries()).toEqual([]);
	} finally {
		installMarklessResumeCache([]);
	}
});
