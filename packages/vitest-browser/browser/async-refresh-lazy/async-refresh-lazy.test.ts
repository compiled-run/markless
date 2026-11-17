import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import QuoteCard from './quote-card.tsrx';

afterEach(cleanup);

const LOADS = { timeout: 5_000 };
// A page whose @try arrived settled resumes and reads its value without refreshing it; the first refresh answers.
// A build leaves the async plane's refresh half unloaded until then; the dev server loads the runtime's lazy modules with the page.
test('a settled @try that never refreshes keeps its served value, and its first refresh answers', async () => {
	const container = (await renderSSR(QuoteCard)).container as HTMLElement;
	expect(container.querySelector('[data-quote]')?.textContent).toBe('quote 1');

	(container.querySelector('[data-like]') as HTMLButtonElement).click();
	await expect.poll(() => container.querySelector('[data-likes]')?.textContent, LOADS).toBe('1');
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(container.querySelector('[data-quote]')?.textContent).toBe('quote 1');

	(container.querySelector('[data-next]') as HTMLButtonElement).click();
	await expect
		.poll(() => container.querySelector('[data-quote]')?.textContent, LOADS)
		.toBe('quote 2');
});
