import { box } from '@async/witness';

// Product truth: App owns `libraryOpen`, while the Library child owns the
// panel class binding. This interaction pins the composed child attribute so
// a dropped child-edge dom-update record cannot hide behind the Nav button's
// same-component class update.
const LIBRARY_BUTTON = '.library-button';
const LIBRARY_PANEL = '.library';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player csr: library panel class opens and closes',
		tags: ['music-player', 'csr', 'preview', 'browser', 'composition', 'attribute'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);

		const page = await preview.browser.visit('/');
		await expect.page.bodyText(
			page,
			{ contains: 'Do I Clench My Fists? (Slowed + Reverb)' },
			WAIT,
		);
		await expect.page.attribute(page, LIBRARY_PANEL, 'class', 'library', WAIT);
		await expect.page.attribute(page, LIBRARY_BUTTON, 'class', 'library-button', WAIT);

		await page.click(LIBRARY_BUTTON, WAIT);
		await expect.page.attribute(page, LIBRARY_PANEL, 'class', 'library active-library', WAIT);
		await expect.page.attribute(page, LIBRARY_BUTTON, 'class', 'library-button active', WAIT);
		await expect.page.computedStyle(
			page,
			LIBRARY_PANEL,
			{ transform: 'matrix(1, 0, 0, 1, 0, 0)' },
			WAIT,
		);

		await page.click(LIBRARY_BUTTON, WAIT);
		await expect.page.attribute(page, LIBRARY_PANEL, 'class', 'library', WAIT);
		await expect.page.attribute(page, LIBRARY_BUTTON, 'class', 'library-button', WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('music-player csr library panel class round-tripped');
	},
);
