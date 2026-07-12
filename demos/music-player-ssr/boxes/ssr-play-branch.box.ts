import { box } from '@async/witness';

// Product truth: the SSR demo must serve the player page (no internal server
// error) with branch comment anchors in the html, resume in the browser, and
// flip the Player's `@if (isPlaying)` icon branch on click — then flip it
// back. The branch condition is a parent-graph prop crossing a child-component
// edge, the exact shape of the demo regression.
//
// Zero-cold-click probe (preload-integrity goal, owner doctrine): "Chunks in
// the network tab from execution means it was not preloaded correctly,
// period." The play click must fetch ZERO `/build/*.js` chunks — every
// route-scoped chunk (including the symbol resolver's computed-import-table
// targets) is head-preloaded, so bytes are warm before the first interaction
// while execution stays lazy (resume summary still reports 0 executed).
// The probe matcher is `/build/*.js` only: `/build/execution-sizes.json` is
// the dev execution log auto-activating on localhost origins (PM ruling: dev
// tooling, local-origin-gated at packages/web/src/dev-log.ts) and YouTube
// embed traffic is out of scope. This probe lives in THIS box because witness
// currently supports one nitro preview per run: a second in-process preview
// reuses the first (closed) server entry module and 404s.
const PLAY_TOGGLE = '[aria-label="Play or pause"]';
const PLAY_ICON = '.play .play-icon';
const PAUSED_ICON = '▶';
const PLAYING_ICON = '❚❚';
const WAIT = { timeoutMs: 10_000 };
// Head-size sanity: 64 links before resolver-aware preload (5 cold post-click
// chunks); the route symbol closure adds ~22. Past 2x the old baseline means
// the plan stopped being route-scoped (the named misfire is preloading EVERY
// symbol module globally, breaking cross-route exclusion).
const MIN_HEAD_LINKS = 65;
const MAX_HEAD_LINKS = 128;

export default box(
	{
		name: 'music-player ssr: page serves and play/pause icon branch flips',
		tags: ['music-player', 'router', 'ssr', 'preview', 'browser', 'branch'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				configFile: 'boxes/vite.config.ts',
				mode: 'ssr',
			}),
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
		receipt.note(
			`ssr play-branch modulepreload hrefs (${preloadHrefs.length}): ${formatPaths(preloadHrefs)}`,
		);
		if (preloadHrefs.length < MIN_HEAD_LINKS || preloadHrefs.length > MAX_HEAD_LINKS) {
			throw new Error(
				`Expected the route-scoped head preload map to stay in the sane band ` +
					`[${MIN_HEAD_LINKS}, ${MAX_HEAD_LINKS}], saw ${preloadHrefs.length} links.`,
			);
		}
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
		const startupScripts = await waitForQuietBuildJs(page);
		receipt.note(`ssr play-branch startup JS: ${formatPaths(startupScripts)}`);

		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PLAYING_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play active', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		const expectedAppBytes = await expectedFirstPlayAppBytes(preview);
		await waitForLogInteractionAttribute(page, 1, expectedAppBytes, WAIT);
		const afterClickScripts = await waitForQuietBuildJs(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		receipt.note(
			`ssr play-branch post-click /build JS request diff: ${formatPaths(lazyChunks)}`,
		);
		if (lazyChunks.length > 0) {
			throw new Error(
				`Expected the first interaction to fetch ZERO framework chunks ` +
					`(bytes head-preloaded, execution lazy), saw cold fetches: ${formatPaths(lazyChunks)}`,
			);
		}

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
		await waitForLogInteractionAttribute(page, 2, expectedAppBytes, WAIT);

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
		if (
			/data-markless-log-summary="markless: resumed — 0\.0 KB app executed, \d+ modules preloaded \(0 app executed\) · 0\.0 KB instrument"/.test(
				html,
			) &&
			/data-markless-log-app-bytes="0"/.test(html) &&
			/data-markless-log-instrument-bytes="0"/.test(html) &&
			!/data-markless-log-summary="[^"]*· 3\.1 KB"/.test(html)
		)
			return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Expected data-markless-log-summary to mirror the resume summary.');
}

// The first-Play app cost is derived from the served size map (resume-events +
// the Player click symbol) rather than pinned as a literal: the assertion then
// proves the accounting arithmetic end to end and survives byte drift, while a
// composition change (a new module waking) still fails the woke/warm counts and
// the derived sum.
async function expectedFirstPlayAppBytes(preview: {
	request(path: string): Promise<string>;
}): Promise<number> {
	const sizes = JSON.parse(await preview.request('/build/execution-sizes.json')) as Record<
		string,
		{ readonly gzip?: number; readonly instrument?: true }
	>;
	const playerSymbolKey = Object.keys(sizes).find(
		(key) =>
			key.startsWith('virtual:markless:symbol:') &&
			decodeURIComponent(key).includes('/components/Player.tsrx') &&
			decodeURIComponent(key).endsWith(':symbol:3'),
	);
	const resumeEvents = sizes['web:resume-events']?.gzip;
	const playerSymbol = playerSymbolKey ? sizes[playerSymbolKey]?.gzip : undefined;
	if (!resumeEvents || !playerSymbol) {
		throw new Error(
			`Expected size-map entries for web:resume-events and Player symbol:3, got ${resumeEvents} and ${playerSymbol}.`,
		);
	}
	return resumeEvents + playerSymbol;
}

async function waitForLogInteractionAttribute(
	page: ContentPage,
	count: number,
	expectedAppBytes: number,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	const countPattern = new RegExp(`data-markless-log-interactions="${count}"`);
	const expectedAppClause = (expectedAppBytes / 1024).toFixed(1);
	const lastPattern = new RegExp(
		`data-markless-log-last="markless: click \\[[^"]+\\] · woke \\d+ modules · ran warm \\d+ modules · ${expectedAppClause.replace('.', '\\.')} KB app · (\\d+(?:\\.\\d+)?) KB instrument"`,
	);
	const rejectedFixtures = [
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3.1 KB"',
		'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 2 app modules (bytes unknown; 1 unmapped) · 1.9 KB instrument"',
	];
	for (const fixture of rejectedFixtures) {
		if (lastPattern.test(fixture))
			throw new Error(`Execution-log matcher accepted a rejected format: ${fixture}`);
	}
	const appBytesPattern = new RegExp(`data-markless-log-app-bytes="${expectedAppBytes}"`);
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		const readableInstrument = lastPattern.exec(html)?.[1];
		const exactInstrument = /data-markless-log-instrument-bytes="(\d+)"/.exec(html)?.[1];
		if (
			countPattern.test(html) &&
			readableInstrument !== undefined &&
			exactInstrument !== undefined &&
			(Number(exactInstrument) / 1024).toFixed(1) === readableInstrument &&
			appBytesPattern.test(html) &&
			!/data-markless-log-last="[^"]*est\./.test(html)
		) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(
		`Expected interaction ${count} to mirror app-bytes=${expectedAppBytes} derived from the size map.`,
	);
}

async function jsBuildRequestPaths(page: NetworkRequestPage): Promise<readonly string[]> {
	const requests = await page.networkRequests();
	return requests
		.filter((request) => request.method === 'GET')
		.map((request) => new URL(request.url).pathname)
		.filter((pathname) => pathname.startsWith('/build/') && pathname.endsWith('.js'));
}

// Poll until no NEW /build/*.js request lands for a quiet window, so preload
// fetches finish before the snapshot (networkidle scoped to framework JS).
async function waitForQuietBuildJs(page: NetworkRequestPage): Promise<readonly string[]> {
	const quietMs = 500;
	const started = Date.now();
	let paths = await jsBuildRequestPaths(page);
	let quietSince = Date.now();
	while (Date.now() - started < WAIT.timeoutMs) {
		await new Promise((resolve) => setTimeout(resolve, 50));
		const latest = await jsBuildRequestPaths(page);
		if (latest.length !== paths.length) {
			paths = latest;
			quietSince = Date.now();
		} else if (Date.now() - quietSince >= quietMs) {
			return paths;
		}
	}
	return paths;
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
