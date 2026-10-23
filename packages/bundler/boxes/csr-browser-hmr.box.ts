import { box } from '@async/witness';

// Product truth: a TSRX edit in dev falls back to Vite's full page reload.
// Granular HMR can replace this later, but the current adapter must still get
// the browser onto the updated source instead of silently doing nothing.
const FIXTURE = 'fixtures/vite-csr';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'csr browser hmr: tsrx edit reloads the page',
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
		await expect.page.text(page, '[data-counter]', '0', WAIT);

		// The edit shows on the page, so only the reloaded page can answer the wait below.
		const change = await project.edit(`${FIXTURE}/src/root.tsrx`, {
			replace: ['>{count}</button>', '>edited {count}</button>'],
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
		await expect.page.text(page, '[data-counter]', 'edited 0', WAIT);
		await expect.page.outcome(
			page,
			{
				navigations: 1,
			},
			WAIT,
		);
		await receipt.capture('after browser hmr edit');
	},
);
