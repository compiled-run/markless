import { box } from '@async/witness';

// Product truth: unlike the CSR fixture, SSR-related behavior has real server
// work. The Vite/Rolldown build must emit a compiled TSRX artifact that can
// render the DOM shell and expose payload metadata to renderToString().
const FIXTURE = 'fixtures/vite-ssr';
const SERVER_ARTIFACT = `${FIXTURE}/dist/server/root.js`;

export default box(
	{
		name: 'ssr build: Rolldown server artifact renders payload shell',
		tags: ['ssr', 'build'],
		modes: ['build'],
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
		await expect.artifact.text(build, SERVER_ARTIFACT, {
			contains: ['data-counter', 'renderSsr(props, marklessRenderContext)', 'payloadView: view'],
		});

		await receipt.capture('ssr server artifact rendered payload shell');
	},
);
