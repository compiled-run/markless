import { box } from '@async/witness';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'live-feed csr: staged direct wake keeps settled rows interactive',
		tags: ['live-feed', 'csr', 'preview', 'browser', 'async', 'repeat', 'staged-wake'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/staged-csr.vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);
		try {
			const page = await preview.browser.visit('/?latency=40');
			await expect.page.attribute(page, '[data-update-list]', 'data-row-count', '3', WAIT);
			await page.click('[data-row-key="atlas-204"]', WAIT);
			await expect.page.text(page, '[data-selected-key]', 'Selected atlas-204', WAIT);
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		} finally {
			await preview.close();
		}

		await receipt.capture('live-feed staged direct-CSR settled row interaction');
	},
);
