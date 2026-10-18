import { box } from '@async/witness';
import { marklessBuildManifestPath } from '../../bundler/src/build/build-manifests.ts';
import { MARKLESS_BUNDLE_GRAPH } from '../../bundler/src/build/chunking.ts';

const FIXTURE = 'fixtures/router-docs';
const BUNDLE_GRAPH = marklessBuildManifestPath(`${FIXTURE}/.output/public`, MARKLESS_BUNDLE_GRAPH);

export default box(
	{
		name: 'router docs preview: vite preview serves the built docs home page',
		tags: ['router', 'build', 'preview'],
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
		await expect.build.environment(build, 'ssr');
		await expect.artifact.exists(build, BUNDLE_GRAPH);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		try {
			const html = await preview.request('/');
			await expect.html.contains(html, '<h1>Markless Router Docs</h1>');
			await expect.html.contains(html, 'This page is the docs fixture home route.');
			receipt.note('vite preview served / for router-docs');
		} finally {
			await preview.close();
		}
		await receipt.capture('router docs vite preview served home page');
	},
);
