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

		// Each edit also changes the page's text, so the box waits for the reloaded document instead of a fixed sleep.
		const firstChange = await project.edit(`${FIXTURE}/src/root.tsrx`, (code) =>
			code
				.replace('count++', 'count = count + 1')
				.replace('<span>hello</span>', '<span>first edit</span>'),
		);
		await expect.edit(firstChange, { client: { hmr: 'full-reload' } }, WAIT);
		await expect.page.text(page, 'section span', 'first edit', WAIT);
		const secondChange = await project.edit(`${FIXTURE}/src/root.tsrx`, (code) =>
			code
				.replace('count = count + 1', 'count = count + 2')
				.replace('<span>first edit</span>', '<span>second edit</span>'),
		);
		await expect.edit(secondChange, { client: { hmr: 'full-reload' } }, WAIT);
		await expect.page.text(page, 'section span', 'second edit', WAIT);
		await expect.page.outcome(page, { navigations: 2 }, WAIT);
		await receipt.capture('after repeated ssr browser hmr edits');
	},
);
