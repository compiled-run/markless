import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, renderServerHTML, renderStream, renderStreamShell } from '../../src/index.ts';
import { Quote } from './quote.tsrx';
import { quotes, type Quote as QuoteValue } from './quote-source.ts';
import {
	SCOPE,
	SEEDED,
	deferred,
	entries,
	play,
	poll,
	resetQuotes,
	shows,
	text,
	watchPending,
} from './support.ts';

// A streamed shell whose pending block this tab already saw settled fills it from the cache before
// it paints, then the runtime resumes over that content and revalidates it in place.
beforeEach(() => {
	sessionStorage.clear();
	resetQuotes(async (id) => ({ text: `quote ${id} in the tab` }));
});
afterEach(async () => {
	await cleanup();
	for (const node of document.body.querySelectorAll('template[m\\:arm],script[data-seeded],script[type^="markless/"]'))
		node.remove();
	delete (globalThis as { __mArm?: unknown }).__mArm;
	sessionStorage.clear();
});

const options = { resumeScope: 'visitor-1' };

async function firstVisit(): Promise<void> {
	const shell = await renderStreamShell(Quote, options);
	expect(shell).toContain(`${SCOPE}="visitor-1"`);
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

test('reload: the shell paints the cached arm before its first frame, then resumes and revalidates in place', async () => {
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
	await expect.poll(() => container.querySelectorAll('[aria-busy="true"]').length, poll).toBeGreaterThan(0);
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

	// The resumed content stays interactive.
	quotes.answer = async (id) => ({ text: `quote ${id} next` });
	container.querySelector<HTMLButtonElement>('[data-next]')!.click();
	await shows(container, '[data-text]', 'quote 2 next');
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

test('a streamed patch arriving before the runtime wakes is the revalidator', async () => {
	await firstVisit();
	const { shell, appends } = await renderStream(Quote, options);
	quotes.answer = () => new Promise(() => {});
	const { container } = renderServerHTML(shell);
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(text(container, '[data-text]')).toBe('quote 1 in the tab');
	for (const chunk of appends) play(chunk);
	await shows(container, '[data-text]', 'quote 1');
	expect(container.querySelector('[data-pending]')).toBeNull();
});

test('a shell rendered for another scope or build fills nothing', async () => {
	await firstVisit();
	const shell = await renderStreamShell(Quote, { resumeScope: 'visitor-2' });
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
