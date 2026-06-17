import { box } from '@arcade/witness';

// Product truth: unlike the CSR fixture, SSR-related behavior has real server
// work. The Vite/Rolldown build must emit a server entry that renders the
// existing DOM shell plus canonical async payload scripts.
const FIXTURE = 'fixtures/vite-ssr';
const SERVER_ENTRY = `${FIXTURE}/dist/server/entry-server.js`;

export default box(
	{
		name: 'ssr build: Rolldown server entry renders payload shell',
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
		await expect.artifact.text(build, SERVER_ENTRY, {
			contains: ['data-counter', 'type=\\"arcade/state\\"', 'type=\\"arcade/view\\"'],
		});

		await receipt.capture('ssr server entry rendered payload shell');
	},
);
