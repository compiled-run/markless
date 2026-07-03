import { box } from '@async/witness';

// Product truth: the Player's `@if (isPlaying)` icon branch lives in a child
// component whose condition is a parent-graph prop. CSR composition must keep
// the child branch records wired so clicking play/pause flips the icon arm and
// clicking again flips it back (the demo regression: the icon never flipped).
// The branch-flip machinery may load lazily only after the first interaction.
const PLAY_TOGGLE = '[aria-label="Play or pause"]';
const PLAY_ICON = '.play .play-icon';
const PAUSED_ICON = '▶';
const PLAYING_ICON = '❚❚';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player csr: play/pause icon branch flips and flips back',
		tags: ['music-player', 'csr', 'preview', 'browser', 'branch'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build();
		const preview = await pipeline.preview(build);

		// Mount truth: the app renders paused — the @else arm shows the play
		// glyph and the toggle button carries the paused class binding.
		const page = await preview.browser.visit('/');
		await expect.page.bodyText(
			page,
			{ contains: 'Do I Clench My Fists? (Slowed + Reverb)' },
			WAIT,
		);
		await expect.page.text(page, PLAY_ICON, PAUSED_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play', WAIT);
		const startupScripts = await jsBuildRequestPaths(page);
		receipt.note(`csr play-branch startup JS: ${formatPaths(startupScripts)}`);

		// Interaction truth: the click writes `isPlaying`, the icon branch flips
		// to the playing arm, and the class binding rides along.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PLAYING_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play active', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		receipt.note(`csr play-branch post-click lazy JS: ${formatPaths(lazyChunks)}`);

		// Round-trip truth: clicking again restores the paused arm without stale
		// leftovers from the playing arm.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PAUSED_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'pause', WAIT);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('music-player csr play icon branch flipped and round-tripped');
	},
);

type NetworkRequestPage = {
	networkRequests(): Promise<ReadonlyArray<{ readonly url: string; readonly method: string }>>;
};

async function jsBuildRequestPaths(page: NetworkRequestPage): Promise<readonly string[]> {
	const requests = await page.networkRequests();
	return requests
		.filter((request) => request.method === 'GET')
		.map((request) => new URL(request.url).pathname)
		.filter((pathname) => pathname.startsWith('/build/') && pathname.endsWith('.js'));
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
