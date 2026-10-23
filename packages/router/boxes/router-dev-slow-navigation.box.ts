import { box } from '@async/witness';

const FIXTURE = 'fixtures/router';
const DOCS_LINK = 'a[data-markless-router-link]';
const MDX_COUNTER = '[data-mdx-counter]';
const WAIT = { timeoutMs: 20_000 };

// On a slow connection the press on the link wakes the home page's code, which arrives after the swap to the docs page.
export default box(
	{
		name: 'router dev: code the leaving page woke that arrives after an in-place navigation never runs the next page',
		tags: ['router', 'dev', 'browser', 'resume'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				server: { ...config.server, watch: null },
			}),
		});

		const page = await browser.visit('/');
		await expect.page.text(page, 'h1', 'Markless Router', WAIT);
		await page.emulateNetwork({
			latencyMs: 200,
			downloadThroughputBytesPerSecond: -1,
			uploadThroughputBytesPerSecond: -1,
		});
		await page.click(DOCS_LINK, WAIT);
		await expect.page.text(page, 'h1', 'Docs', WAIT);
		await page.click(MDX_COUNTER, WAIT);
		await expect.page.text(page, MDX_COUNTER, 'MDX Count 1', WAIT);
		await page.click(MDX_COUNTER, WAIT);
		await expect.page.text(page, MDX_COUNTER, 'MDX Count 2', WAIT);
		await expect.page.outcome(page, { navigations: 1, consoleErrors: 0 }, WAIT);
		await receipt.capture('each press on the docs page counted once after a slow in-place navigation');
	},
);
