import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, renderServerHTML, renderStream, renderStreamShell } from '../../src/index.ts';
import { Quote } from './quote.tsrx';
import { quotes, type Quote as QuoteValue } from './quote-source.ts';
import {
	SCOPE,
	SEEDED,
	clearEntries,
	deferred,
	drainEntries,
	entries,
	listen,
	play,
	poll,
	resetQuotes,
	shows,
	text,
	useScope,
	watchPending,
} from './support.ts';

// A streamed shell whose pending block this tab already saw settled fills it from the cache before
// it paints, then the runtime resumes over that content and revalidates it in place.
beforeEach(() => {
	clearEntries();
	resetQuotes(async (id) => ({ text: `quote ${id} in the tab` }));
});
afterEach(async () => {
	await cleanup();
	for (const node of document.body.querySelectorAll('template[m\\:arm],script[data-seeded],script[type^="markless/"]'))
		node.remove();
	delete (globalThis as { __mArm?: unknown }).__mArm;
	delete (document as { __mScope?: unknown }).__mScope;
	delete (document as { __mStreamOpen?: unknown }).__mStreamOpen;
	await drainEntries();
});

const options = { resumeScope: useScope('ssr-visitor') };

async function firstVisit(): Promise<void> {
	const shell = await renderStreamShell(Quote, options);
	expect(shell).toContain(`${SCOPE}="${options.resumeScope}"`);
	const { container } = renderServerHTML(shell);
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1 in the tab');
	await expect.poll(entries, poll).toHaveLength(1);
	await cleanup();
	delete (globalThis as { __mArm?: unknown }).__mArm;
	resetQuotes(quotes.answer);
}

test('first visit: the streamed shell shows @pending, the tab settles it and keeps it', async () => {
	await firstVisit();
	const entry = JSON.parse(sessionStorage.getItem(entries()[0]!)!);
	expect(entry.h).toContain('quote 1 in the tab');
	expect(entry.a.locators).toBeDefined();
});

test('reload: the shell paints the cached arm before its first frame, then resumes and revalidates quietly in place', async () => {
	await firstVisit();
	const shell = await renderStreamShell(Quote, options);
	const revalidation = deferred<QuoteValue>();
	quotes.answer = () => revalidation.promise;
	const { container } = renderServerHTML(shell);
	const frames = watchPending();
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(text(container, '[data-text]')).toBe('quote 1 in the tab');
	const section = container.querySelector<HTMLElement>('[data-quote]')!;
	expect(section.hasAttribute(SEEDED)).toBe(true);

	await expect.poll(() => quotes.runs, poll).toBe(1);
	const said = listen();
	await new Promise((resolve) => setTimeout(resolve, 1_200));
	expect(container.querySelectorAll('[aria-busy]').length).toBe(0);
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	const paragraph = container.querySelector('[data-text]');
	field.focus();
	revalidation.resolve({ text: 'quote 1, revised' });
	await shows(container, '[data-text]', 'quote 1, revised');
	expect(container.querySelector('[data-quote]')).toBe(section);
	expect(container.querySelector('[data-text]')).toBe(paragraph);
	expect(document.activeElement).toBe(field);
	await expect.poll(() => section.hasAttribute(SEEDED), poll).toBe(false);
	expect(frames()).toEqual([]);
	expect(said()).toEqual([]);

	// The resumed content stays interactive.
	quotes.answer = async (id) => ({ text: `quote ${id} next` });
	container.querySelector<HTMLButtonElement>('[data-next]')!.click();
	await shows(container, '[data-text]', 'quote 2 next');
	// A refresh the click asked for is announced, unlike the cache's own.
	await expect.poll(() => document.querySelector('[data-markless-announcer]')?.textContent, poll).toBe('Updated');
});

test('a failed revalidation shows @catch after the seeded content and drops the entry', async () => {
	await firstVisit();
	const shell = await renderStreamShell(Quote, options);
	const revalidation = deferred<QuoteValue>();
	quotes.answer = () => revalidation.promise;
	const { container } = renderServerHTML(shell);
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(text(container, '[data-text]')).toBe('quote 1 in the tab');
	await expect.poll(() => quotes.runs, poll).toBe(1);
	revalidation.reject(new Error('Quotes are down'));
	await shows(container, '[data-failed]', 'Quotes are down');
	expect(text(container, '[data-text]')).toBe('quote 1 in the tab');
	expect(entries()).toEqual([]);
});

test('while the document still streams, its patch is the one revalidator and lands in place', async () => {
	await firstVisit();
	const { shell, appends } = await renderStream(Quote, options);
	expect(appends.length).toBeGreaterThan(0);
	let end!: () => void;
	(document as { __mStreamOpen?: Promise<void> }).__mStreamOpen = new Promise<void>((done) => (end = done));
	const frames = watchPending();
	const { container } = renderServerHTML(shell);
	expect(text(container, '[data-text]')).toBe('quote 1 in the tab');
	const section = container.querySelector<HTMLElement>('[data-quote]')!;
	const field = container.querySelector<HTMLInputElement>('[data-field]')!;
	field.focus();
	// The runtime the seed woke waits on the stream instead of fetching.
	await expect.poll(() => (container.querySelector('[data-async-container]') as { __asyncResumeRuntimeStarted?: boolean } | null)?.__asyncResumeRuntimeStarted, poll).toBe(true);
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(quotes.runs).toBe(0);
	for (const chunk of appends) play(chunk);
	end();
	await shows(container, '[data-text]', 'quote 1');
	expect(container.querySelector('[data-quote]')).toBe(section);
	expect(document.activeElement).toBe(field);
	await expect.poll(() => section.hasAttribute(SEEDED), poll).toBe(false);
	expect(quotes.runs).toBe(0);
	expect(frames()).toEqual([]);
});

test('a shell rendered for another scope or build fills nothing', async () => {
	await firstVisit();
	const shell = await renderStreamShell(Quote, { resumeScope: `${options.resumeScope}-rotated` });
	const { container } = renderServerHTML(shell);
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	await shows(container, '[data-text]', 'quote 1 in the tab');
});

test('a shell without a scope token carries no seed and no token', async () => {
	const shell = await renderStreamShell(Quote);
	expect(shell).not.toContain(SCOPE);
	expect(shell).not.toContain('data-markless-resume-seed');
});

test('a stream that ends without the block hands its revalidation to the browser', async () => {
	await firstVisit();
	const shell = await renderStreamShell(Quote, options);
	let end!: () => void;
	(document as { __mStreamOpen?: Promise<void> }).__mStreamOpen = new Promise<void>((done) => (end = done));
	const { container } = renderServerHTML(shell);
	expect(text(container, '[data-text]')).toBe('quote 1 in the tab');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(quotes.runs).toBe(0);
	quotes.answer = async () => ({ text: 'quote 1, fetched here' });
	end();
	await shows(container, '[data-text]', 'quote 1, fetched here');
	expect(quotes.runs).toBe(1);
	expect(container.querySelector('[data-pending]')).toBeNull();
});

test('a malformed entry is a miss for the shell, and is purged', async () => {
	await firstVisit();
	const [key] = entries();
	sessionStorage.setItem(key!, '{"k":"[1');
	const shell = await renderStreamShell(Quote, options);
	const { container } = renderServerHTML(shell);
	expect(container.querySelector('[data-pending]')).not.toBeNull();
	expect(sessionStorage.getItem(key!) === '{"k":"[1').toBe(false);
	await shows(container, '[data-text]', 'quote 1 in the tab');
});
