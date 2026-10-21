import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import ServedCounter from './served-counter.tsrx';

// test/ssr-module-cache-rerun.test.ts runs this file twice against one Vitest module cache.
afterEach(() => cleanup());

test('a served counter resumes and counts a click', async () => {
	await renderSSR(ServedCounter);
	await page.getByTestId('bump').click();
	await expect
		.poll(() => page.getByTestId('count').element().textContent, { timeout: 10_000 })
		.toBe('1');
});
