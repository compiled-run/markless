import { box } from '@arcade/witness';

// Product truth: the Vite dev client injected by the arcade adapter
// reaches a real browser page. A TSRX edit must emit the framework hot payload,
// the browser must receive the cancelable arcade:update event, and the
// fixture must consume it without navigating.
const FIXTURE = 'fixtures/vite-csr';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'csr browser hmr: tsrx edit reaches page without reload',
		tags: ['csr', 'hmr', 'browser'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const page = await browser.visit('/');
		await expect.page.exists(page, '#app', WAIT);
		await page.trackEvents('arcade:update');

		const change = await project.edit(`${FIXTURE}/src/root.tsrx`, {
			replace: ['count++', 'count = count + 1'],
		});

		await expect.edit(
			change,
			{
				client: {
					hmr: 'none',
					invalidated: ['src/root.tsrx'],
					messages: ['arcade:update'],
				},
			},
			WAIT,
		);
		await expect.page.text(page, '#hmr-status', 'arcade:update', WAIT);
		await expect.page.outcome(
			page,
			{
				navigations: 0,
				events: { 'arcade:update': { atLeast: 1 } },
			},
			WAIT,
		);
		await receipt.capture('after browser hmr edit');
	},
);
