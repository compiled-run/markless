import { box } from '@async/witness';

const FIXTURE = '../../fixtures/router';
const DOCS_LINK = 'a[data-arcade-router-link]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router dev browser: Link uses document navigation and resumes docs lazily',
		tags: ['router', 'dev', 'browser', 'resume'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, environment, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const indexHtml = await environment.client.request('/');
		if (
			indexHtml.includes('<script type="module" src="/@id/virtual:arcade-router') ||
			indexHtml.includes('__arcadeRouterStartSpaNavigation')
		) {
			throw new Error('Router dev HTML must not wake the Arcade router runtime on SSR startup.');
		}

		const page = await browser.visit('/');

		await expect.page.text(page, 'h1', 'Arcade Router', WAIT);
		await page.click(DOCS_LINK, WAIT);
		await expect.page.text(page, 'h1', 'Docs', WAIT);
		await expect.page.bodyText(
			page,
			{ contains: 'This MDX route is part of the top-level Arcade Router fixture.' },
			WAIT,
		);
		await expect.page.text(page, '[data-mdx-counter]', 'MDX Count 0', WAIT);
		await page.click('[data-mdx-counter]', WAIT);
		await expect.page.text(page, '[data-mdx-counter]', 'MDX Count 1', WAIT);
		const documentRequests = (await page.networkRequests()).filter(
			(request) => request.resourceType === 'Document',
		);
		if (documentRequests.length < 2) {
			throw new Error(
				`Expected Link to use document navigation, saw document requests:\n${documentRequests
					.map((request) => `${request.method} ${request.url}`)
					.join('\n')}`,
			);
		}
		await expect.page.outcome(
			page,
			{ consoleErrors: 0, failedRequests: 0, navigations: 1 },
			WAIT,
		);
		await receipt.capture('router dev browser Link document navigation lazy-resumed docs route');
	},
);
