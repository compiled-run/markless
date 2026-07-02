import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-full-stack';
const COUNTER = 'button';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router full stack dev: counter API middleware and static asset work',
		tags: ['router', 'dev', 'browser', 'counter', 'api', 'middleware', 'static'],
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

		const page = await browser.visit('/');

		await expect.page.text(page, 'h1', 'Markless Full Stack', WAIT);
		await expect.page.text(page, COUNTER, 'Count 0', WAIT);
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, 'Count 1', WAIT);

		const api = await environment.client.fetch('/api/health');
		await expect.response.matches(api, {
			status: 200,
			contentType: 'application/json',
			contains: '"ok":true',
		});
		if (!api.text.includes('"requestId":"router-full-stack"')) {
			throw new Error(
				`Expected API response to include middleware requestId, saw ${api.text}`,
			);
		}
		if (api.headers['x-markless-router'] !== '1') {
			throw new Error(
				`Expected API middleware/header flow to set x-markless-router, saw ${api.headers['x-markless-router'] ?? '<missing>'}`,
			);
		}

		const asset = await environment.client.fetch('/markless-router.txt');
		await expect.response.matches(asset, {
			status: 200,
			contains: 'Markless Router static asset fixture.',
		});

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture(
			'router full stack dev browser API middleware and static asset worked',
		);
	},
);
