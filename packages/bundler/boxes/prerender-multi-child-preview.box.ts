import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-prerender-multi-child';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'prerender multi-child preview: every imported child resumes events',
		tags: ['prerender', 'build', 'preview', 'multi-child'],
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
		await expect.build.environment(build, 'client');
		await expect.build.artifact(build, `${FIXTURE}/dist/index.html`);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const page = await preview.browser.visit('/');
		await expect.page.text(page, '[data-counter-side="left"]', '0', WAIT);
		await expect.page.text(page, '[data-counter-side="right"]', '10', WAIT);
		await page.click('[data-left-increment]', WAIT);
		await page.click('[data-right-increment]', WAIT);
		await expect.page.text(page, '[data-counter-side="left"]', '1', WAIT);
		await expect.page.text(page, '[data-counter-side="right"]', '12', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('both prerendered imported children resumed delegated events');
	},
);
