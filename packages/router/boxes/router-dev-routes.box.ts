import { box } from '@async/witness';

const FIXTURE = 'fixtures/router';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router dev browser: direct docs route and 404 render',
		tags: ['router', 'dev', 'browser', 'routes'],
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

		const docsPage = await browser.visit('/docs/getting-started');
		await expect.page.text(docsPage, 'h1', 'Docs', WAIT);
		await expect.page.bodyText(
			docsPage,
			{ contains: 'This MDX route is part of the top-level Markless Router fixture.' },
			WAIT,
		);
		await expect.page.text(docsPage, '[data-mdx-counter]', 'MDX Count 0', WAIT);
		await docsPage.click('[data-mdx-counter]', WAIT);
		await expect.page.text(docsPage, '[data-mdx-counter]', 'MDX Count 1', WAIT);
		await expect.page.outcome(docsPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		const notFoundPage = await browser.visit('/missing');
		await expect.page.text(notFoundPage, 'h1', 'Not found', WAIT);
		await expect.page.outcome(notFoundPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('router dev browser served direct docs and 404 routes');
	},
);
