import { readFileSync } from 'node:fs';
import { box } from '@async/witness';

const WAIT = { timeoutMs: 30_000 };
// The home page's heading as its page source writes it, so a copy edit does not strand the box.
const HOME_HEADING = /^# (.+)$/m.exec(
	readFileSync(new URL('../pages/index.mdx', import.meta.url), 'utf8'),
)![1]!;

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
		const page = await browser.visit('/');
		await expect.page.text(page, 'h1', HOME_HEADING, WAIT);
		await page.click('.sidebar-summary', WAIT);
		await page.click('.sidebar a[href="/start/new-app"]', WAIT);
		await expect.page.text(page, 'h1', 'Creating a new app', WAIT);
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
			'.sidebar a[aria-current="page"][href="/start/new-app"]',
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
		await page.click('.site-header .crumb-home', WAIT);
		await expect.page.text(page, 'h1', HOME_HEADING, WAIT);
		if (
			(await page.networkRequests()).filter((request) => request.resourceType === 'Document')
				.length !== 1
		) {
			throw new Error('The header home link reloaded the document.');
		}
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('sidebar page link and header home link preserve the document');
	},
);
