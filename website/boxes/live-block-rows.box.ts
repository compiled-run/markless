import { box } from '@async/witness';
import { chromium, expect } from '@playwright/test';

// Every live block on a page is rooted at a component of the same name; a row added in one that is not the page's last must still render from its own block.
export default box(
	{
		name: 'Code block: a row added in a live block loads its own async value',
		tags: ['website', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, receipt }) => {
		const server = await pipeline.dev({
			config: (config) => ({ ...config, server: { ...config.server, watch: null } }),
		});
		const browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));
		try {
			await page.goto(new URL('/concepts/async', server.url).href);
			const stages = page.locator('[data-code-stage]');
			const feed = stages.filter({ has: page.getByRole('button', { name: 'Load more' }) });
			await expect(feed).toHaveCount(1);
			expect(await stages.count()).toBeGreaterThan(1);
			await expect(stages.last()).not.toContainText('Load more');
			await expect(feed).toContainText('Post 1 of page 1', { timeout: 30_000 });
			await feed.getByRole('button', { name: 'Load more' }).click();
			await expect(feed).toContainText('Post 3 of page 2', { timeout: 30_000 });
			await expect(feed).not.toContainText("didn't load");
			receipt.note(JSON.stringify({ errors }));
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
	},
);
