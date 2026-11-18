import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import QuoteCard from './quote-card.tsrx';

afterEach(cleanup);

const LOADS = { timeout: 5_000 };
const refreshHalfLoaded = () =>
	performance
		.getEntriesByType('resource')
		.some((entry) => /\/(?:graph-async-refresh|async-refresh)\.ts\b/.test(entry.name));

// A page whose @try arrived settled resumes and reads its value without the async plane's refresh half; the first refresh loads it.
test('a settled @try that never refreshes leaves the refresh half unloaded', async () => {
	const container = (await renderSSR(QuoteCard)).container as HTMLElement;
	expect(container.querySelector('[data-quote]')?.textContent).toBe('quote 1');

	(container.querySelector('[data-like]') as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('[data-likes]')?.textContent, LOADS).toBe('1');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(refreshHalfLoaded()).toBe(false);

	(container.querySelector('[data-next]') as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('[data-quote]')?.textContent, LOADS).toBe('quote 2');
	expect(refreshHalfLoaded()).toBe(true);
});
