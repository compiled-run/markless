import { box } from '@arcadejs/witness';

// Product truth: the Vite plugin also has to work when consumed through a
// vite-plus config, matching the repo's preferred tooling surface.
const FIXTURE = 'fixtures/vite-plus';
const INDEX = `${FIXTURE}/dist/index.html`;
const MANIFEST = `${FIXTURE}/dist/arcade-manifest.json`;
const BUNDLE_GRAPH = `${FIXTURE}/dist/build/bundle-graph.json`;
const DASHBOARD = '[data-dashboard]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'vite-plus preview: built app loads arcade output',
		tags: ['vite-plus', 'build', 'preview'],
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
		await expect.build.artifact(build, INDEX);
		await expect.build.artifact(build, MANIFEST);
		await expect.build.artifact(build, BUNDLE_GRAPH);
		await expect.artifact.text(build, INDEX, { contains: '/build/async-' });
		await expect.artifact.json(await build.artifact(MANIFEST), (json) => {
			const value = json as {
				version?: unknown;
				bundleGraphAsset?: unknown;
				modules?: Array<{ source?: unknown }>;
			};

			return (
				value.version === 1 &&
				value.bundleGraphAsset === 'build/bundle-graph.json' &&
				!!value.modules?.some(
					(module) =>
						typeof module.source === 'string' &&
						module.source.endsWith('/src/root.tsrx'),
				)
			);
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
		await receipt.capture('vite-plus preview loaded arcade output');
	},
);
