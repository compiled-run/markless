import { box } from '@async/witness';

const WAIT = { timeoutMs: 30_000 };

export default box(
	{
		name: 'website sidebar: navigation keeps the document and resumes the destination',
		tags: ['website', 'router', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const page = await browser.visit('/markless/');
		await expect.page.text(page, 'h1', 'The compiler for user interfaces', WAIT);
		await page.click('.sidebar-summary', WAIT);
		await page.click('.sidebar a[href="/markless/start/first-app"]', WAIT);
		await expect.page.text(page, 'h1', 'One command, then three scripts', WAIT);
		const documents = (await page.networkRequests()).filter(
			(request) => request.resourceType === 'Document',
		);
		if (documents.length !== 1) {
			throw new Error(
				`Sidebar navigation loaded ${documents.length} documents instead of one.`,
			);
		}
		await expect.page.exists(
			page,
			'.sidebar a[aria-current="page"][href="/markless/start/first-app"]',
			WAIT,
		);
		await page.click('[data-theme-toggle="dark"]', WAIT);
		await expect.page.exists(page, 'html.dark', WAIT);
		await expect.page.exists(page, '.site-header', WAIT);
		for (let click = 0; click < 6; click++) {
			await page.click('.mode-select-trigger', WAIT);
			await expect.page.exists(
				page,
				`.mode-select-trigger[aria-expanded="${click % 2 === 0}"]`,
				WAIT,
			);
		}
		await page.click('.sidebar .site-mark', WAIT);
		await expect.page.text(page, 'h1', 'The compiler for user interfaces', WAIT);
		if (
			(await page.networkRequests()).filter((request) => request.resourceType === 'Document')
				.length !== 1
		) {
			throw new Error('The sidebar home link reloaded the document.');
		}
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('sidebar page and home links preserve the document');
	},
);
