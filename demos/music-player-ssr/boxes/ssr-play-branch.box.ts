import { box } from '@async/witness';

// Product truth: the SSR demo must serve the player page (no internal server
// error) with branch comment anchors in the html, resume in the browser, and
// flip the Player's `@if (isPlaying)` icon branch on click — then flip it
// back. The branch condition is a parent-graph prop crossing a child-component
// edge, the exact shape of the demo regression.
const PLAY_TOGGLE = '[aria-label="Play or pause"]';
const PLAY_ICON = '.play .play-icon';
const PAUSED_ICON = '▶';
const PLAYING_ICON = '❚❚';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player ssr: page serves and play/pause icon branch flips',
		tags: ['music-player', 'router', 'ssr', 'preview', 'browser', 'branch'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, mode: 'ssr' }),
		});
		const preview = await pipeline.preview(build);

		// Server truth: `request('/')` resolves only for an OK status, and the
		// html carries the player, the resume payload, and branch anchors —
		// rendered on the paused arm (the demo regression served a 500 here).
		const html = await preview.request('/');
		if (html.includes('Internal Server Error')) {
			throw new Error('Expected SSR music player page, got an internal server error page.');
		}
		await expect.html.contains(html, 'aria-label="Play or pause"');
		await expect.html.contains(html, '<!--markless:branch:');
		await expect.html.contains(html, 'data-async-resumer');
		const preloadHrefs = modulePreloadHrefs(html);
		await assertModulePreloadsServe(preview, preloadHrefs);
		receipt.note(`ssr play-branch modulepreload hrefs: ${formatPaths(preloadHrefs)}`);
		// Scope the arm check to the rendered toggle button: the payload scripts
		// legitimately serialize both arm templates elsewhere in the document.
		assertRenderedToggleArm(html);

		// Resume truth: the paused arm comes from the payload, then the click
		// flips the icon branch to the playing arm.
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
		receipt.note(`ssr play-branch startup JS: ${formatPaths(startupScripts)}`);

		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PLAYING_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play active', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		await waitForLogInteractionAttribute(page, 1, WAIT);
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		receipt.note(`ssr play-branch post-click lazy JS: ${formatPaths(lazyChunks)}`);

		// Command-state depth (absorbed from the retired tmp-ssr box): the
		// App-root attach controller activated on the first interaction and
		// drives the YouTube command state, including the iframe API script.
		await expect.page.attribute(page, '.youtube-frame-host', 'data-playing', 'true', WAIT);
		await expect.page.exists(page, 'script[src="https://www.youtube.com/iframe_api"]', WAIT);

		// Round-trip truth: clicking again restores the paused arm.
		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PAUSED_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'pause', WAIT);
		await waitForLogInteractionAttribute(page, 2, WAIT);

		// Track navigation exercises composed events and dom updates deeper in
		// the tree (also absorbed from the retired tmp-ssr box).
		await page.click('[aria-label="Next track"]', WAIT);
		await expect.page.bodyText(page, { contains: 'Empty Crown' }, WAIT);
		// Paused next-track cues the new video (playing next-track loads it);
		// the video id change proves the composed dom updates flowed.
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'cue', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('music-player ssr served the page and round-tripped the icon branch');
	},
);

function assertRenderedToggleArm(html: string): void {
	const buttonStart = html.indexOf('aria-label="Play or pause"');
	if (buttonStart === -1) {
		throw new Error('Expected SSR html to render the play/pause toggle button.');
	}
	const buttonEnd = html.indexOf('</button>', buttonStart);
	if (buttonEnd === -1) {
		throw new Error('Expected SSR html to close the play/pause toggle button.');
	}
	const rendered = html.slice(buttonStart, buttonEnd);
	if (!rendered.includes('<!--markless:branch:')) {
		throw new Error(
			`Expected the toggle button to keep its branch comment anchors, got: ${rendered.trim()}`,
		);
	}
	if (!rendered.includes(PAUSED_ICON)) {
		throw new Error(`Expected the paused @else arm inside the toggle, got: ${rendered.trim()}`);
	}
	if (rendered.includes(PLAYING_ICON)) {
		throw new Error(
			`Expected SSR to render only the paused @else arm inside the toggle, got: ${rendered.trim()}`,
		);
	}
}

function modulePreloadHrefs(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)]
		.map((match) => match[1]!)
		.filter((href, index, hrefs) => hrefs.indexOf(href) === index);
}

async function assertModulePreloadsServe(
	preview: { request(path: string): Promise<string> },
	hrefs: readonly string[],
): Promise<void> {
	if (hrefs.length === 0) {
		throw new Error('Expected SSR music player HTML to render modulepreload links.');
	}
	for (const href of hrefs) {
		const path = new URL(href, 'http://markless.local').pathname;
		await preview.request(path);
	}
}

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
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (/data-markless-log-summary="markless: resumed [^"]*0 executed\)"/.test(html)) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Expected data-markless-log-summary to mirror the resume summary.');
}

async function waitForLogInteractionAttribute(
	page: ContentPage,
	count: number,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	const countPattern = new RegExp(`data-markless-log-interactions="${count}"`);
	const lastPattern = /data-markless-log-last="markless: click \[[^"]+\] · woke \d+ modules · ran warm \d+ modules · \d+(?:\.\d+)? KB"/;
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (countPattern.test(html) && lastPattern.test(html) && !/data-markless-log-last="[^"]*est\./.test(html)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(`Expected interaction ${count} to mirror a real-KB execution log line.`);
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
