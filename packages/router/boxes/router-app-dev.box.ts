import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-app';
const COUNTER = 'button';
const HOME_LINK = 'a[data-markless-router-link]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router app dev browser: counter Link and 404 render',
		tags: ['router', 'dev', 'browser', 'counter', 'link', '404'],
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

		await expect.page.text(page, 'h1', 'Markless Router App', WAIT);
		await expect.page.text(page, COUNTER, 'Count 0', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, 'Count 1', WAIT);
		await expect.page.text(page, HOME_LINK, 'Home', WAIT);
		await expect.page.attribute(page, HOME_LINK, 'href', '/', WAIT);

		const notFound = await browser.visit('/missing');
		await expect.page.text(notFound, 'h1', 'Page not found', WAIT);
		await expect.page.text(notFound, HOME_LINK, 'Home', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await expect.page.outcome(notFound, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('router app dev browser counter Link and 404 rendered');
	},
);
