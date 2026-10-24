import { box } from '@async/witness';
import type { UserConfig } from 'vite';

const WAIT = { timeoutMs: 10_000 };
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-figures';
const NITRO_OUTPUT_DIR = '.output/router-figures';
// Strings the figures' data holds only for markup no handler re-renders.
const SERVED_ONLY = ['SERVED-ONLY-WIDE', 'SERVED-ONLY-TALL', 'SERVED-ONLY-CAPTION'];
const SECOND_SERVED_ONLY = ['SECOND-SERVED-ONLY-ONE', 'SECOND-SERVED-ONLY-TWO'];

export default box(
	{
		name: 'figure data the browser never re-renders stays in the served HTML, on load and after navigation',
		tags: ['router', 'browser', 'mdx', 'build'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const config = (config: UserConfig) => ({
			...config,
			root: `${config.root}/fixtures/router-figures`,
			configFile: `${config.root}/fixtures/router-figures/vite.config.ts`,
			nitro: {
				buildDir: NITRO_BUILD_DIR,
				output: {
					dir: NITRO_OUTPUT_DIR,
					publicDir: `${NITRO_OUTPUT_DIR}/public`,
					serverDir: `${NITRO_OUTPUT_DIR}/server`,
				},
			},
		});
		const build = await pipeline.build({ config });
		const preview = await pipeline.preview(build, { config });
		try {
			const html = await preview.request('/');
			for (const marker of SERVED_ONLY) await expect.html.contains(html, marker);

			const page = await preview.browser.visit('/');
			await expect.page.exists(page, '[data-drawing][data-beat="rest"]', WAIT);
			await page.click('[data-beat-button]', WAIT);
			await expect.page.exists(page, '[data-drawing][data-beat="press"]', WAIT);
			// A row the graph adds renders in the browser, with the slice of data it reads.
			await page.click('[data-add-mark]', WAIT);
			await expect.page.text(page, '[data-mark="star"]', 'Star added', WAIT);
			await page.click('[data-add-mark]', WAIT);
			await expect.page.text(page, '[data-mark="dot"]', 'Dot added', WAIT);
			await page.click('[data-open]', WAIT);
			await expect.page.exists(page, '[data-opened][title="Star added"]', WAIT);

			await page.click('a[href="/second"]', WAIT);
			await expect.page.text(page, 'h1', 'Second', WAIT);
			await expect.page.exists(page, '[data-second][data-stamped="no"]', WAIT);
			await page.click('[data-stamp]', WAIT);
			await expect.page.exists(page, '[data-second][data-stamped="Stamped"]', WAIT);

			const requests = await page.networkRequests();
			if (requests.filter((request) => request.resourceType === 'Document').length !== 1)
				throw new Error('Navigating to the second figure reloaded the document.');
			const scripts = requests.filter((request) => request.resourceType === 'Script');
			if (scripts.length === 0) throw new Error('The figure pages loaded no script.');
			for (const script of scripts) {
				const body = await preview.request(new URL(script.url).pathname);
				for (const marker of [...SERVED_ONLY, ...SECOND_SERVED_ONLY])
					if (body.includes(marker))
						throw new Error(
							`${script.url} ships ${marker}, which only the served HTML needs.`,
						);
			}
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
			await receipt.capture(
				'figures resumed and navigated with their fixed data left in the HTML',
			);
		} finally {
			await preview.close();
		}
	},
);
