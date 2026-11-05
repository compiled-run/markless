import { box } from '@async/witness';

const WAIT = { timeoutMs: 30_000 };
const branch = (title: string) => `.sidebar .branch[aria-label="${title}"]`;
const current = (href: string) => `.sidebar a[aria-current="page"][href="${href}"]`;
const trigger = (title: string) => `${branch(title)} > .branch-trigger`;

export default box(
	{
		name: 'website sidebar: a section the reader opened stays open across in-place navigation',
		tags: ['website', 'router', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		// A page's first compile writes its code-block modules, and a new module file reloads open pages.
		for (const route of ['/ui/accordion', '/ui/collapsible', '/ui/checkbox', '/ui/checklist'])
			await browser.request(route);
		const page = await browser.visit('/ui/accordion');
		await expect.page.exists(page, current('/ui/accordion'), WAIT);
		// At the box's phone width the sections sit behind "Browse pages", which closes on each navigation.
		await page.click('.sidebar-summary', WAIT);
		await expect.page.exists(page, `${branch('Show and hide')}[aria-expanded="true"]`, WAIT);
		await expect.page.exists(page, `${branch('Forms')}[aria-expanded="false"]`, WAIT);

		await page.click(trigger('Forms'), WAIT);
		await expect.page.exists(page, `${branch('Forms')}[aria-expanded="true"]`, WAIT);

		await page.click('.sidebar a[href="/ui/collapsible"]', WAIT);
		await expect.page.exists(page, current('/ui/collapsible'), WAIT);
		await page.click('.sidebar-summary', WAIT);
		await expect.page.exists(page, `${branch('Forms')}[aria-expanded="true"]`, WAIT);
		await expect.page.exists(page, `${branch('Show and hide')}[aria-expanded="true"]`, WAIT);

		// The section the reader was in stays open when they move into another one.
		await page.click('.sidebar a[href="/ui/checkbox"]', WAIT);
		await expect.page.exists(page, current('/ui/checkbox'), WAIT);
		await page.click('.sidebar-summary', WAIT);
		await expect.page.exists(page, `${branch('Show and hide')}[aria-expanded="true"]`, WAIT);
		await expect.page.exists(page, `${branch('Forms')}[aria-expanded="true"]`, WAIT);

		// Closed by hand, a section stays closed, and the next page's own section opens again.
		await page.click(trigger('Show and hide'), WAIT);
		await expect.page.exists(page, `${branch('Show and hide')}[aria-expanded="false"]`, WAIT);
		await page.click(trigger('Forms'), WAIT);
		await expect.page.exists(page, `${branch('Forms')}[aria-expanded="false"]`, WAIT);
		await page.click('.pager a[href="/ui/checklist"]', WAIT);
		await expect.page.exists(page, current('/ui/checklist'), WAIT);
		await page.click('.sidebar-summary', WAIT);
		await expect.page.exists(page, `${branch('Forms')}[aria-expanded="true"]`, WAIT);
		await expect.page.exists(page, `${branch('Show and hide')}[aria-expanded="false"]`, WAIT);

		if (
			(await page.networkRequests()).filter((request) => request.resourceType === 'Document')
				.length !== 1
		)
			throw new Error('Sidebar navigation reloaded the document.');
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('opened sidebar sections stay open across in-place navigation');
	},
);
