import { box } from '@async/witness';

const FIXTURE = '../../fixtures/router';
const DOCS_LINK = 'a[data-arcade-router-link]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router dev browser: SPA Link navigates to docs without reload',
		tags: ['router', 'dev', 'browser', 'spa', 'navigation-api'],
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

		await expect.page.text(page, 'h1', 'Arcade Router', WAIT);
		await page.click(DOCS_LINK, WAIT);
		await expect.page.text(page, 'h1', 'Docs', WAIT);
		await expect.page.bodyText(
			page,
			{ contains: 'This MDX route is part of the top-level Arcade Router fixture.' },
			WAIT,
		);
		const documentRequests = (await page.networkRequests()).filter(
			(request) => request.resourceType === 'Document',
		);
		if (documentRequests.length !== 1) {
			throw new Error(
				`Expected SPA Link to avoid a document reload, saw document requests:\n${documentRequests
					.map((request) => `${request.method} ${request.url}`)
					.join('\n')}`,
			);
		}
		await expect.page.outcome(
			page,
			{ consoleErrors: 0, failedRequests: 0, navigations: 1 },
			WAIT,
		);
		await receipt.capture('router dev browser SPA Link rendered docs route without reload');
	},
);
