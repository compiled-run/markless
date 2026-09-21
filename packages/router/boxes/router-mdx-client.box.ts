import { box } from '@async/witness';
import type { UserConfig } from 'vite';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'built MDX routes resume and navigate through their client modules',
		tags: ['router', 'browser', 'mdx'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const config = (config: UserConfig) => ({
			...config,
			root: `${config.root}/fixtures/router`,
			configFile: `${config.root}/fixtures/router/vite.config.ts`,
		});
		const build = await pipeline.build({ config });
		const preview = await pipeline.preview(build, { config });
		try {
			const page = await preview.browser.visit('/docs/getting-started');
			await expect.page.text(page, '[data-mdx-counter]', 'MDX Count 0', WAIT);
			await page.click('[data-mdx-counter]', WAIT);
			await expect.page.text(page, '[data-mdx-counter]', 'MDX Count 1', WAIT);
			await page.click('[data-router-home]', WAIT);
			await expect.page.text(page, 'h1', 'Markless Router', WAIT);
			await page.click('[data-home-counter]', WAIT);
			await expect.page.text(page, '[data-home-counter]', 'Button 1', WAIT);
			await page.click('a[data-markless-router-link]', WAIT);
			await expect.page.text(page, '[data-mdx-counter]', 'MDX Count 0', WAIT);
			await page.click('[data-mdx-counter]', WAIT);
			await expect.page.text(page, '[data-mdx-counter]', 'MDX Count 1', WAIT);
			const documents = (await page.networkRequests()).filter(
				(request) => request.resourceType === 'Document',
			);
			if (documents.length !== 1) throw new Error('Client routes reloaded the document');
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
			await receipt.capture('MDX resumed from SSR and after SPA navigation');
		} finally {
			await preview.close();
		}
	},
);
