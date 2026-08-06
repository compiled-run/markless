import { box } from '@async/witness';

// Owner report: "open the library and spam click around and I'm unable to select
// a song." The cause is not spam. ONE click on a spot with no event record — the
// nav heading, the library heading, any gap — used to hand the page to the
// ungrouped full-prerender resume, which registered itself as the outermost
// dispatch handler with a one-parameter function. Registered handlers are
// `(handoff, fallback)` and must pass unhandled events down; dropping `fallback`
// made the trigger-group loader unreachable for the life of the page, so library
// song selection died permanently and silently (`ignoreUnmatched: true`).
//
// This box drives that exact 3-click sequence and then pins the second half of
// the same family: a recordless click must not roll the visible track back to
// the payload's initial state.
const NAV_HEADING = 'nav h1';
const LIBRARY_HEADING = '.library h2';
const LIBRARY_BUTTON = '.library-button';
const NEXT_TRACK = '[aria-label="Next track"]';
const PREVIOUS_TRACK = '[aria-label="Previous track"]';
const TRACK_ONE = 'Do I Clench My Fists? (Slowed + Reverb)';
const WAIT = { timeoutMs: 10_000 };
// The library sheet slides in after its class flips (same settle the
// csr-library-song sibling uses before it can click a song).
const SHEET_SETTLE = 250;
// The ungrouped fallback resume is async and silent: give it room to land (or to
// wreck the display) before the next assertion judges the page.
const FALLBACK_SETTLE = 500;

export default box(
	{
		name: 'music-player csr: a recordless click never kills library song selection',
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

		await expect.page.text(page, '.song-container h2', TRACK_ONE, WAIT);

		// Click 1: the nav heading carries no event record, so it takes the
		// ungrouped fallback. Nothing visible should change here — the point is
		// what the page can still do afterwards.
		await page.click(NAV_HEADING, WAIT);
		await new Promise((resolve) => setTimeout(resolve, FALLBACK_SETTLE));
		await expect.page.text(page, '.song-container h2', TRACK_ONE, WAIT);
		receipt.note('recordless nav-heading click dispatched before any trigger group woke');

		// Click 2: the nav toggle has a trigger group, and it must still reach it.
		await page.click(LIBRARY_BUTTON, WAIT);
		await expect.page.attribute(page, '.library', 'class', 'library active-library', WAIT);
		await new Promise((resolve) => setTimeout(resolve, SHEET_SETTLE));

		// Click 3: the failing one. Selecting song two must move both the visible
		// title and the player's video id.
		await page.click('.library-songs .library-song:nth-child(2)', WAIT);
		await expect.page.text(page, '.song-container h2', 'Empty Crown', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);
		receipt.note('library song selection survived the recordless click');

		// Stale-display pin: a recordless click AFTER a selection must leave the
		// visible track alone. The fallback runtime is seeded from the payload's
		// initial records, so a fallback that touches the DOM would roll the title
		// back to track one.
		await page.click(LIBRARY_HEADING, WAIT);
		await new Promise((resolve) => setTimeout(resolve, FALLBACK_SETTLE));
		await expect.page.text(page, '.song-container h2', 'Empty Crown', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);

		// And the transport still routes to its own groups from that state. Close
		// the library first: under the 768px breakpoint the open sheet is
		// position:fixed over the whole viewport and would swallow player clicks.
		await page.click(LIBRARY_BUTTON, WAIT);
		await expect.page.attribute(page, '.library', 'class', 'library', WAIT);
		await new Promise((resolve) => setTimeout(resolve, SHEET_SETTLE));

		await page.click(NEXT_TRACK, WAIT);
		await expect.page.text(page, '.song-container h2', 'No Problem', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'UQ0KmrvBPaY',
			WAIT,
		);
		await page.click(PREVIOUS_TRACK, WAIT);
		await expect.page.text(page, '.song-container h2', 'Empty Crown', WAIT);

		await expect.page.outcome(page, { events: { click: { atLeast: 7 } } }, WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('music-player csr recordless click left song selection alive');
	},
);
