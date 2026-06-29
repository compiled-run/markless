import { box } from '@async/witness';

const FIXTURE = '../../fixtures/router';
const COUNTER = 'button';
const DOCS_LINK = 'a[data-arcade-router-link]';
const BACK_BUTTON = '[data-router-back]';
const MDX_COUNTER = '[data-mdx-counter]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router preview: built fixture resumes counters without eager router runtime',
		tags: ['router', 'build', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		try {
			const indexHtml = await preview.request('/');
			await expect.html.contains(indexHtml, '<h1>Arcade Router</h1>');
			await expect.html.contains(indexHtml, 'Button 0');
			await expect.html.contains(indexHtml, 'data-arcade-router-link');
			await expect.html.contains(indexHtml, 'data-async-resumer');
			if (indexHtml.includes('<script type="module"')) {
				throw new Error('Router preview HTML must not wake a module script on SSR startup.');
			}

			const page = await preview.browser.visit('/');

			await expect.page.text(page, 'h1', 'Arcade Router', WAIT);
			await expect.page.text(page, COUNTER, 'Button 0', WAIT);
			await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
			await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
			await page.click(COUNTER, WAIT);
			await expect.page.text(page, COUNTER, 'Button 1', WAIT);
			await page.click(DOCS_LINK, WAIT);
			await expect.page.text(page, 'h1', 'Docs', WAIT);
			await expect.page.text(page, MDX_COUNTER, 'MDX Count 0', WAIT);
			await page.click(MDX_COUNTER, WAIT);
			await expect.page.text(page, MDX_COUNTER, 'MDX Count 1', WAIT);
			await expect.page.text(page, BACK_BUTTON, 'Back', WAIT);
			await page.click(BACK_BUTTON, WAIT);
			await expect.page.text(page, 'h1', 'Arcade Router', WAIT);
			await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
			await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
			await expect.page.text(page, COUNTER, 'Button 1', WAIT);
			await page.click(COUNTER, WAIT);
			await expect.page.text(page, COUNTER, 'Button 2', WAIT);
			await expect.page.outcome(
				page,
				{ consoleErrors: 0, failedRequests: 0, navigations: 2 },
				WAIT,
			);
			receipt.note('vite preview served SSR HTML and lazy-resumed router fixture routes');
		} finally {
			await preview.close();
		}
		await receipt.capture('router vite preview resumed built fixture counters without startup module');
	},
);
