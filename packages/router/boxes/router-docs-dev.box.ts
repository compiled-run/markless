import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-docs';
const HEADING = 'h1';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router docs dev: serves the docs home page',
		tags: ['router', 'dev', 'browser'],
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

		await expect.page.text(page, HEADING, 'Markless Router Docs', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('router docs dev served home page');
	},
);
