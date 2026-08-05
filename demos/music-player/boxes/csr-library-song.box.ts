import { box } from '@async/witness';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player csr: selecting a library song changes the current track',
		tags: ['music-player', 'csr', 'preview', 'browser', 'composition', 'event'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);
		const page = await preview.browser.visit('/');
		await page.trackEvents('click');

		await expect.page.text(
			page,
			'.song-container h2',
			'Do I Clench My Fists? (Slowed + Reverb)',
			WAIT,
		);
		await page.click('.library-button', WAIT);
		await expect.page.attribute(page, '.library', 'class', 'library active-library', WAIT);
		await expect.page.attribute(page, 'html', 'data-markless-log-interactions', '1', WAIT);
		await new Promise((resolve) => setTimeout(resolve, 250));
		await page.click('.library-songs .library-song:nth-child(2)', WAIT);
		await expect.page.outcome(page, { events: { click: { atLeast: 2 } } }, WAIT);
		await expect.page.text(page, '.song-container h2', 'Empty Crown', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('music-player csr library song changed the current track');
	},
);
