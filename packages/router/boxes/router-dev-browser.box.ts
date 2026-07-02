import { box } from '@async/witness';

const FIXTURE = 'fixtures/router';
const COUNTER = 'button';
const DOCS_LINK = 'a[data-markless-router-link]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router dev browser: resumes counter and rewrites typed Link href',
		tags: ['router', 'dev', 'browser', 'counter', 'link'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const page = await browser.visit('/');

		await expect.page.text(page, 'h1', 'Markless Router', WAIT);
		await expect.page.text(page, COUNTER, 'Button 0', WAIT);
		await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
		await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, 'Button 1', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture(
			'router dev browser resumed counter click and rendered typed Link href',
		);
	},
);
