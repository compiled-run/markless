import { box } from '@async/witness';

const WAIT = { timeoutMs: 30_000 };

export default box(
	{
		name: 'website UI sidebar renders destination pages without reloading',
		tags: ['website', 'router', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const page = await browser.visit('/markless/ui/select');
		await expect.page.text(page, 'h1', 'select', WAIT);
		await page.click('.sidebar-summary', WAIT);
		await page.click('.sidebar a[href="/markless/ui/combobox"]', WAIT);
		await expect.page.text(page, 'h1', 'combobox', WAIT);
		await expect.page.exists(page, '.site-header', WAIT);
		if (
			(await page.networkRequests()).filter((request) => request.resourceType === 'Document')
				.length !== 1
		)
			throw new Error('UI sidebar reloaded the document');
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('UI sidebar rendered combobox from select without reloading');
	},
);
