import { box } from '@async/witness';

// Product truth: editing a TSRX source file in the Vite CSR fixture runs
// through the real Vite dev pipeline, invalidates generated markless
// virtual modules, and falls back to a full browser reload.
const FIXTURE = 'fixtures/vite-csr';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'csr hmr: tsrx edit sends full reload',
		tags: ['csr', 'hmr'],
	},
	async ({ pipeline, project, environment, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		await environment.client.request('/');
		await environment.client.request('/src/main.ts');
		await environment.client.request('/src/root.tsrx');

		const change = await project.edit(`${FIXTURE}/src/root.tsrx`, {
			replace: ['count++', 'count = count + 1'],
		});

		await expect.edit(
			change,
			{
				client: {
					hmr: 'full-reload',
					invalidated: ['src/root.tsrx'],
				},
			},
			WAIT,
		);
		await receipt.capture('after tsrx hmr edit');
	},
);
