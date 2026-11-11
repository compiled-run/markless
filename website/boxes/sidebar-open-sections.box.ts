import { box } from '@async/witness';
import { skipWhileQuarantined } from './quarantined.ts';

const WAIT = { timeoutMs: 30_000 };
const branch = (title: string) => `.sidebar .branch[aria-label="${title}"]`;
const current = (href: string) => `.sidebar a[aria-current="page"][href="${href}"]`;
const trigger = (title: string) => `${branch(title)} > .branch-trigger`;
const expanded = (title: string, open: boolean) =>
	`${branch(title)}[aria-expanded="${open ? 'true' : 'false'}"]`;

export default box(
	{
		name: 'website sidebar: a section the reader opened stays open across in-place navigation',
		tags: ['website', 'router', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, browser, expect, receipt }) => {
		if (skipWhileQuarantined('sidebar-open-sections')) return;
		await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		// A page's first compile writes its code-block modules, and a new module file reloads open pages.
		for (const route of ['/ui/accordion', '/ui/collapsible', '/ui/checkbox', '/ui/checklist'])
			await browser.request(route);
		const page = await browser.visit('/ui/accordion');
		await expect.page.exists(page, current('/ui/accordion'), WAIT);
		// At the box's phone width the sections sit behind "Browse pages"; the sidebar is kept, so it stays open.
		await page.click('.sidebar-summary', WAIT);
		await expect.page.exists(page, expanded('Show and hide', true), WAIT);
		await expect.page.exists(page, expanded('Forms', false), WAIT);

		await page.click(trigger('Forms'), WAIT);
		await expect.page.exists(page, expanded('Forms', true), WAIT);

		await page.click('.sidebar a[href="/ui/collapsible"]', WAIT);
		await expect.page.exists(page, current('/ui/collapsible'), WAIT);
		await expect.page.exists(page, '.sidebar-disclosure[open]', WAIT);
		await expect.page.exists(page, expanded('Forms', true), WAIT);
		await expect.page.exists(page, expanded('Show and hide', true), WAIT);

		// The next page's own section opens, and a navigation closes none: the section the reader left stays open too.
		await page.click('.sidebar a[href="/ui/checkbox"]', WAIT);
		await expect.page.exists(page, current('/ui/checkbox'), WAIT);
		await expect.page.exists(page, expanded('Forms', true), WAIT);
		await expect.page.exists(page, expanded('Show and hide', true), WAIT);
		await page.click(trigger('Show and hide'), WAIT);
		await expect.page.exists(page, expanded('Show and hide', false), WAIT);

		// Opened or closed by hand, a section stays that way while the reader moves within the same section.
		await page.click(trigger('Show and hide'), WAIT);
		await expect.page.exists(page, expanded('Show and hide', true), WAIT);
		await page.click(trigger('Forms'), WAIT);
		await expect.page.exists(page, expanded('Forms', false), WAIT);
		await page.click('.pager a[href="/ui/checklist"]', WAIT);
		await expect.page.exists(page, current('/ui/checklist'), WAIT);
		await expect.page.exists(page, expanded('Forms', false), WAIT);
		await expect.page.exists(page, expanded('Show and hide', true), WAIT);

		// The kept sidebar still answers the reader after all of that.
		await page.click(trigger('Forms'), WAIT);
		await expect.page.exists(page, expanded('Forms', true), WAIT);

		if (
			(await page.networkRequests()).filter((request) => request.resourceType === 'Document')
				.length !== 1
		)
			throw new Error('Sidebar navigation reloaded the document.');

		// A full load opens the page's section plus every one the reader left open.
		await page.reload();
		await expect.page.exists(page, current('/ui/checklist'), WAIT);
		await expect.page.exists(page, expanded('Forms', true), WAIT);
		await expect.page.exists(page, expanded('Show and hide', true), WAIT);
		await expect.page.exists(page, expanded('Overlays', false), WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await receipt.capture('opened sidebar sections stay open across in-place navigation');
	},
);
