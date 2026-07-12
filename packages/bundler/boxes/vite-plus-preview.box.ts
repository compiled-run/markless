import { box } from '@async/witness';

// Product truth: the Vite plugin also has to work when consumed through a
// vite-plus config, matching the repo's preferred tooling surface.
const FIXTURE = 'fixtures/vite-plus';
const INDEX = `${FIXTURE}/dist/index.html`;
const BUNDLE_GRAPH = `${FIXTURE}/dist/build/bundle-graph.json`;
const DASHBOARD = '[data-dashboard]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'vite-plus preview: built app loads markless output',
		tags: ['vite-plus', 'build', 'preview'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const instrumentedBuild = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/boxes/vite-plus.instrumented.config.ts`,
			}),
		});
		await expect.build.environment(instrumentedBuild, 'client');
		const instrumentedPreview = await pipeline.preview(instrumentedBuild, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/boxes/vite-plus.instrumented.config.ts`,
			}),
		});
		const instrumentedPage = await instrumentedPreview.browser.visit('/');
		await expect.page.text(instrumentedPage, DASHBOARD, 'ready', WAIT);
		// owner ratification 2026-07-12, T008D
		await waitForLoadAppBytes(instrumentedPage, WAIT);
		await instrumentedPreview.close();

		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.artifact(build, INDEX);
		await expect.build.artifact(build, BUNDLE_GRAPH);
		await expect.artifact.text(build, INDEX, { contains: '/build/chunk-' });
		await expect.artifact.json(await build.artifact(BUNDLE_GRAPH), (json) => {
			return Array.isArray(json) && json.includes('symbol:0');
		});

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const page = await preview.browser.visit('/');

		await expect.page.text(page, DASHBOARD, 'ready', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('vite-plus preview loaded markless output');
	},
);

type ContentPage = {
	content(): Promise<string>;
};

async function waitForLoadAppBytes(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const raw = /data-markless-log-app-bytes="(\d+)"/.exec(await page.content())?.[1];
		if (raw !== undefined && Number.isInteger(Number(raw)) && Number(raw) === 0) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Expected integer load app-bytes mirror to equal 0 exactly.');
}
