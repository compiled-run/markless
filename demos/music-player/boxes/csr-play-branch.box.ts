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
		const build = await pipeline.build({
			config: (config) => ({ ...config, configFile: 'boxes/vite.config.ts' }),
		});
		const preview = await pipeline.preview(build);

		// Mount truth: the app renders paused — the @else arm shows the play
		// glyph and the toggle button carries the paused class binding.
		const page = await preview.browser.visit('/');
		await waitForLogSummaryAttribute(page, WAIT);
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
		await waitForLogInteractionAttribute(page, 1, WAIT);
		// Exactness contract: no chunk may load post-click that was not in the
		// startup preloaded set.
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		if (lazyChunks.length > 0) {
			throw new Error(`Post-click chunks were not preloaded: ${formatPaths(lazyChunks)}`);
		}

		// Round-trip truth: clicking again restores the paused arm without stale
		// leftovers from the playing arm.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PAUSED_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'pause', WAIT);
		await waitForLogInteractionAttribute(page, 2, WAIT);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('music-player csr play icon branch flipped and round-tripped');
	},
);

type NetworkRequestPage = {
	networkRequests(): Promise<ReadonlyArray<{ readonly url: string; readonly method: string }>>;
};

type ContentPage = {
	content(): Promise<string>;
};

async function waitForLogSummaryAttribute(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	await waitForLogMirror(
		page,
		options,
		/data-markless-log-summary="markless: rendered — \d+ app modules? executed \(\d+(?:\.\d+)? KB app\) · \d+ instrument modules? executed \(\d+(?:\.\d+)? KB\)"/,
		/data-markless-log-summary="[^"]*est\./,
		'Expected data-markless-log-summary to mirror the CSR render summary.',
		undefined,
		[/data-markless-log-app-bytes="\d+"/, /data-markless-log-instrument-bytes="\d+"/],
	);
}

async function waitForLogInteractionAttribute(
	page: ContentPage,
	count: number,
	options: { readonly timeoutMs: number },
): Promise<void> {
	// Ruling 9 accepts honest-unknown here: CSR substitutes csr-callback ids, which
	// intentionally do not guess source ownership in the pull-attribution design.
	const lastPattern =
		/data-markless-log-last="markless: click \[[^"]+\] · woke \d+ modules · ran warm \d+ modules · \d+ app modules \(bytes unknown; \d+ unmapped\) · \d+(?:\.\d+)? KB instrument"/;
	const rejectedFixtures = [
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3.1 KB"',
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 1.8 KB app · 1.5 KB instrument"',
	];
	for (const fixture of rejectedFixtures) {
		if (lastPattern.test(fixture))
			throw new Error(`Execution-log matcher accepted a rejected format: ${fixture}`);
	}
	const started = Date.now();
	const countPattern = new RegExp(`data-markless-log-interactions="${count}"`);
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (
			countPattern.test(html) &&
			lastPattern.test(html) &&
			!/data-markless-log-app-bytes=/.test(html) &&
			!/data-markless-log-instrument-bytes=/.test(html) &&
			!/data-markless-log-last="[^"]*est\./.test(html)
		)
			return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(
		`Expected interaction ${count} to mirror an honest-unknown execution log line.`,
	);
}

async function waitForLogMirror(
	page: ContentPage,
	options: { readonly timeoutMs: number },
	pattern: RegExp,
	estPattern: RegExp,
	message: string,
	extraPattern?: RegExp,
	structuredPatterns: readonly RegExp[] = [],
): Promise<void> {
	const oldTotalFixture =
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3.1 KB"';
	if (pattern.test(oldTotalFixture))
		throw new Error('Execution-log matcher accepted the old single-total format.');
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (
			(!extraPattern || extraPattern.test(html)) &&
			structuredPatterns.every((structured) => structured.test(html)) &&
			pattern.test(html) &&
			!estPattern.test(html) &&
			!/data-markless-log-(?:summary|last)="[^"]*· 3\.1 KB"/.test(html)
		)
			return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(message);
}

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
