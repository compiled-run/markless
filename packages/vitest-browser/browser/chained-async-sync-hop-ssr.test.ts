import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import SyncHopSsr from './fixtures/chained-async-sync-hop-ssr.tsrx';

afterEach(() => cleanup());

test('SSR derives a sync hop before the downstream runner and resumes revalidation', async () => {
	const screen = await renderSSR(SyncHopSsr);
	const container = screen.container;

	expect(container.querySelector('[data-exhibit]')?.textContent).toBe('Exhibit cobalt-fired');
	expect(container.querySelector('[data-failure]')).toBeNull();

	const change = container.querySelector<HTMLButtonElement>('[data-change-mineral]');
	if (!change) throw new Error('Expected the mineral control.');
	change.click();
	await expect
		.poll(() => container.querySelector('[data-exhibit]')?.textContent)
		.toBe('Exhibit amber-fired');
	expect(container.querySelector('[data-failure]')).toBeNull();
});
