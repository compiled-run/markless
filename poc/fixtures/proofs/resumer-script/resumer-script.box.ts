import { box } from '@arcadejs/witness';

const FIXTURE = 'poc/fixtures/proofs/resumer-script/browser';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'resumer-script: inline event resumer waits for click',
		tags: ['resumer-script', 'ssr', 'browser'],
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

		await expect.page.text(page, '#counter', 'Count 0', WAIT);
		await expect.page.attribute(page, 'body', 'data-component-bodies', '0', WAIT);
		await expect.page.attribute(page, 'body', 'data-app-modules', '0', WAIT);
		await expect.page.attribute(page, 'body', 'data-symbol-modules', '0', WAIT);
		await expect.page.attribute(page, 'body', 'data-handlers', '0', WAIT);
		await expect.page.attribute(page, '#root', 'data-count', '0', WAIT);

		await page.click('#counter', WAIT);

		await expect.page.text(page, '#counter', 'Count 1', WAIT);
		await expect.page.attribute(page, 'body', 'data-component-bodies', '0', WAIT);
		await expect.page.attribute(page, 'body', 'data-app-modules', '0', WAIT);
		await expect.page.attribute(page, 'body', 'data-symbol-modules', '1', WAIT);
		await expect.page.attribute(page, 'body', 'data-handlers', '1', WAIT);
		await expect.page.attribute(page, '#root', 'data-count', '1', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await receipt.capture(
			'resumer-script inline event resumer lazy-loaded one symbol after click',
		);
	},
);
