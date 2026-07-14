import { box } from '@async/witness';

const FIXTURE = 'fixtures/router-app';
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-app-preview';
const NITRO_OUTPUT_DIR = 'node_modules/.output-router-app-preview';
const COUNTER = 'button';
const UNSCOPED_BUTTON = '[data-unscoped-button]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router app preview: scoped TSRX style reaches first paint',
		tags: ['router', 'build', 'preview', 'browser', 'styles'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});
		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});

		try {
			const html = await preview.request('/');
			await expect.html.contains(html, 'rel="stylesheet"');
			if (html.includes('<script type="module"')) {
				throw new Error(
					'Router preview must deliver scoped CSS without eager page JavaScript.',
				);
			}

			const page = await preview.browser.visit('/');
			await expect.page.text(page, COUNTER, 'Count 0', WAIT);
			await expect.page.exists(page, 'button[class^="mk-"]', WAIT);
			await expect.page.computedStyle(
				page,
				COUNTER,
				{ 'background-color': 'rgb(255, 0, 0)' },
				WAIT,
			);
			await expect.page.computedStyle(
				page,
				UNSCOPED_BUTTON,
				{ 'background-color': 'rgb(239, 239, 239)' },
				WAIT,
			);
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
			await receipt.capture('built router delivered scoped TSRX CSS at first paint');
		} finally {
			await preview.close();
		}
	},
);

function isolatedNitroOutput() {
	return {
		buildDir: NITRO_BUILD_DIR,
		output: {
			dir: NITRO_OUTPUT_DIR,
			publicDir: `${NITRO_OUTPUT_DIR}/public`,
			serverDir: `${NITRO_OUTPUT_DIR}/server`,
		},
	};
}
