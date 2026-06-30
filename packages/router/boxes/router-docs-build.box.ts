import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-docs';
const BUNDLE_GRAPH = `${FIXTURE}/.output/public/build/bundle-graph.json`;

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
		await expect.build.artifact(build, BUNDLE_GRAPH);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		try {
			const html = await preview.request('/');
			await expect.html.contains(html, '<h1>Arcade Router Docs</h1>');
			await expect.html.contains(html, 'This page is the docs fixture home route.');
			receipt.note('vite preview served / for router-docs');
		} finally {
			await preview.close();
		}
		await receipt.capture('router docs vite preview served home page');
	},
);
