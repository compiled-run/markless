import { box } from '@async/witness';

// Product truth (T003): a render turn prints ONE `markless: rendered` console
// line. Each injected entry module calls the render summary in from its own
// dynamic-import resolution, so a microtask window closes between the callers of
// a single render and every one of them used to print — this page preloads 108
// modules, so the load turn alone was a console wall. The line is coalesced onto
// the animation frame (50 ms timeout backstop) while the attribute mirror keeps
// its per-call timing, which is why this box counts CONSOLE lines and not the
// `data-markless-log-summary` mirror.
const LIBRARY_BUTTON = '.library-button';
const LIBRARY_PANEL = '.library';
const RENDER_LOG_LINES = 'data-render-log-lines';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player csr: one render turn prints one console line',
		tags: ['music-player', 'csr', 'preview', 'browser', 'execution-log'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				configFile: 'boxes/render-log-lines.vite.config.ts',
			}),
		});
		const preview = await pipeline.preview(build);
		try {
			const page = await preview.browser.visit('/');
			await expect.page.bodyText(
				page,
				{ contains: 'Do I Clench My Fists? (Slowed + Reverb)' },
				WAIT,
			);
			// The load turn: one line, not one per preloaded entry module.
			await expect.page.attribute(page, 'html', RENDER_LOG_LINES, '1', WAIT);

			// The first click wakes this button's trigger group, which is a second
			// render turn — and therefore exactly one more line.
			await page.click(LIBRARY_BUTTON, WAIT);
			await expect.page.attribute(page, LIBRARY_PANEL, 'class', 'library active-library', WAIT);

			// Two more clicks, each with an observable state change, wake nothing
			// further: no new render turn, so no new line. Asserting the exact total
			// only after the third click's state change means a broken coalesce has
			// had three full turns to print its extra lines by the time it is read.
			await page.click(LIBRARY_BUTTON, WAIT);
			await expect.page.attribute(page, LIBRARY_PANEL, 'class', 'library', WAIT);
			await page.click(LIBRARY_BUTTON, WAIT);
			await expect.page.attribute(page, LIBRARY_PANEL, 'class', 'library active-library', WAIT);
			await expect.page.attribute(page, 'html', RENDER_LOG_LINES, '2', WAIT);

			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
			receipt.note('load turn + first waking click = 2 render lines across 3 clicks');
		} finally {
			await preview.close();
		}

		await receipt.capture('music-player csr render-summary console line coalesced per turn');
	},
);
