import { box } from '@async/witness';

// Product truth: shared() is the request/page dataflow boundary for SSR and MFE
// composition. Two separately rendered containers should start with the same
// server payload and synchronize client-side shared writes through resume.
const FIXTURE = 'fixtures/vite-ssr-shared';
const INDEX = `${FIXTURE}/dist/index.html`;
const ACTION = '[data-async-container="shared-header"] [data-shared-action]';
const HEADER_PANEL = '[data-async-container="shared-header"] [data-shared-panel]';
const SIDEBAR_PANEL = '[data-async-container="shared-sidebar"] [data-shared-panel]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr shared preview: shared primitive syncs sibling containers after resume',
		tags: ['ssr', 'shared', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const html = await preview.request('/');

		await expect.html.contains(html, 'data-async-container="shared-header"');
		await expect.html.contains(html, 'data-async-container="shared-sidebar"');
		await expect.html.contains(html, '#shell');
		await expect.html.contains(html, 'server-cart / server-ready');

		const page = await preview.browser.visit('/');

		await expect.page.text(page, HEADER_PANEL, 'server-cart / server-ready', WAIT);
		await expect.page.text(page, SIDEBAR_PANEL, 'server-cart / server-ready', WAIT);
		await page.click(ACTION, WAIT);
		await expect.page.text(page, HEADER_PANEL, 'client-cart / client-ready', WAIT);
		await expect.page.text(page, SIDEBAR_PANEL, 'client-cart / client-ready', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr shared containers synchronized after resume');
	},
);
