import { box } from '@async/witness';

// Product truth: `attach={installYouTubeController}` (App.tsrx:61) activates on
// the FIRST dispatched click, and the YouTube IFrame API then replaces
// `.youtube-player-target` with its own `<iframe>`. Every later control is a
// different build-computed trigger group whose first wake re-resolves dom-order
// locators against that mutated tree. This box clicks around after the foreign
// mutation and pins an observable state change per click, because the failure
// mode is either a thrown RuntimeResumeError or a silent dead click.
const LIBRARY_BUTTON = '.library-button';
const YOUTUBE_IFRAME = '.youtube-frame-host iframe';
const PLAY_TOGGLE = '[aria-label="Play or pause"]';
const NEXT_TRACK = '[aria-label="Next track"]';
const PREVIOUS_TRACK = '[aria-label="Previous track"]';
const WAIT = { timeoutMs: 10_000 };
// The third-party widget has to fetch and boot before it can mutate the tree.
const FOREIGN_DOM_WAIT = { timeoutMs: 30_000 };

export default box(
	{
		name: 'music-player csr: controls keep working after the YouTube widget replaces its target element',
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

		// First wake: the nav toggle's trigger group loads, and the same dispatch
		// activates the App-root attach behavior that hands the target div to the
		// IFrame API.
		await page.click(LIBRARY_BUTTON, WAIT);
		await expect.page.attribute(page, '.library', 'class', 'library active-library', WAIT);
		// Gate: everything below only proves something once the foreign element is
		// actually in the tree.
		await expect.page.exists(page, YOUTUBE_IFRAME, FOREIGN_DOM_WAIT);
		receipt.note('youtube iframe replaced .youtube-player-target before the later clicks');
		// The sheet's slide transition lags the class flip (same settle as the
		// csr-library-song sibling).
		await new Promise((resolve) => setTimeout(resolve, 250));

		// Trigger group 2: a library song select, whose host sits after the widget.
		await page.click('.library-songs .library-song:nth-child(2)', WAIT);
		await expect.page.text(page, '.song-container h2', 'Empty Crown', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);

		// Close the library first: under the 768px breakpoint the open sheet is
		// position:fixed over the whole viewport and would swallow player clicks.
		await page.click(LIBRARY_BUTTON, WAIT);
		await expect.page.attribute(page, '.library', 'class', 'library', WAIT);
		await new Promise((resolve) => setTimeout(resolve, 250));

		// Trigger group 3: previous track. Track one is a state no other control
		// on the page can produce, so a misrouted click cannot fake this pass.
		await page.click(PREVIOUS_TRACK, WAIT);
		await expect.page.text(
			page,
			'.song-container h2',
			'Do I Clench My Fists? (Slowed + Reverb)',
			WAIT,
		);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'DwTzcZxyUUg',
			WAIT,
		);

		// Trigger group 4: next track, forward to track two again.
		await page.click(NEXT_TRACK, WAIT);
		await expect.page.text(page, '.song-container h2', 'Empty Crown', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);

		// Trigger group 5: play/pause, whose branch arm also has to re-resolve.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, '.play .play-icon', '❚❚', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);

		// A recordless click last: it matches no trigger group, so it rides the
		// ungrouped fallback resume, whose record set carries EVERY locator
		// including the replaced widget target — the path that threw for real
		// users. Kept after the state assertions because the fallback runtime's
		// own post-creation behavior is a separate concern from locator safety.
		await page.click('.song-container h2', WAIT);
		// The fallback resume is async; give its failure path time to surface
		// before the console/error outcome is judged.
		await new Promise((resolve) => setTimeout(resolve, 500));

		await expect.page.outcome(page, { events: { click: { atLeast: 5 } } }, WAIT);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('music-player csr controls survived the youtube widget dom takeover');
	},
);
