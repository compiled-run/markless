import { box } from '@async/witness';
import { fragmentPageUrl } from '@markless/router/vite';

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
		// A page's first compile writes its code-block modules, and a new module file reloads open pages.
		for (const route of ['/ui/select', '/ui/combobox']) await browser.request(route);
		const page = await browser.visit('/ui/select');
		await expect.page.text(page, 'h1', 'select', WAIT);
		await page.click('.sidebar-summary', WAIT);
		await page.click('.sidebar a[href="/ui/combobox"]', WAIT);
		await expect.page.text(page, 'h1', 'combobox', WAIT);
		await expect.page.exists(page, '.site-navbar', WAIT);
		const requests = await page.networkRequests();
		if (requests.filter((request) => request.resourceType === 'Document').length !== 1)
			throw new Error('UI sidebar reloaded the document');
		// A click cancels the guesses still arriving for other pages, by design: those aborts are the router's, not failures.
		const cancelled = requests.filter((request) => {
			const fetched = fragmentPageUrl(new URL(request.url));
			return (
				request.method === 'GET' &&
				request.failedReason === 'net::ERR_ABORTED' &&
				fetched !== undefined &&
				fetched.pathname !== '/ui/combobox'
			);
		}).length;
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: cancelled }, WAIT);
		await receipt.capture('UI sidebar rendered combobox from select without reloading');
	},
);
