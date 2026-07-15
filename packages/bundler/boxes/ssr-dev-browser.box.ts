import { box } from '@async/witness';

// Product truth: the SSR fixture's dev command must render server-produced HTML
// before the browser resume entry runs. A click proves the page resumed existing
// DOM instead of starting from the empty static index shell, and that the lazy
// event symbol resolver imports through Vite's browser-loadable dev URLs.
const FIXTURE = 'fixtures/vite-ssr';
const COUNTER = '[data-counter]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr dev browser: server shell resumes counter click',
		tags: ['ssr', 'dev', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		const page = await browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '2', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('ssr dev lazy symbol resolver preserved repeated counter state');
	},
);
