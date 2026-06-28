import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr browser hmr: repeated tsrx edits keep reloading',
		tags: ['ssr', 'hmr', 'browser'],
		modes: ['dev'],
	},
	async ({ pipeline, project, browser, expect, receipt }) => {
		await pipeline.dev({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		const page = await browser.visit('/');
		await expect.page.text(page, '[data-counter]', '0', WAIT);

		const firstChange = await project.edit(`${FIXTURE}/src/root.tsrx`, {
			replace: ['count++', 'count = count + 1'],
		});
		await expect.edit(firstChange, { client: { hmr: 'full-reload' } }, WAIT);
		await sleep(250);
		const secondChange = await project.edit(`${FIXTURE}/src/root.tsrx`, {
			replace: ['count = count + 1', 'count = count + 2'],
		});
		await expect.edit(secondChange, { client: { hmr: 'full-reload' } }, WAIT);
		await sleep(250);
		await expect.page.outcome(page, { navigations: 2 }, WAIT);
		await receipt.capture('after repeated ssr browser hmr edits');
	},
);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
