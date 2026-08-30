import { box } from '@async/witness';
import {
	evaluateMusicSsrPreloadWindow,
	evaluateMusicSsrRequests,
	invalidateMusicSsrReceipt,
	writeMusicSsrReceipt,
} from './analyzer/analyzer-gate.ts';
import { musicSsrAnalyzerPolicy } from './analyzer/policy.ts';

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
const LIBRARY_BUTTON = '.library-button';
const LIBRARY_PANEL = '.library';
const PAUSED_ICON = '▶';
const PLAYING_ICON = '❚❚';
const WAIT = { timeoutMs: 10_000 };
// Head-size sanity: 64 links before resolver-aware preload (5 cold post-click
// chunks); the route symbol closure adds ~22. Past 2x the old baseline means
// the plan stopped being route-scoped (the named misfire is preloading EVERY
// symbol module globally, breaking cross-route exclusion).
const MIN_HEAD_LINKS = 65;
const MAX_HEAD_LINKS = 128;
// Permanent execution walls: owner ratification 2026-07-12, T006.
const LOAD_APP_BYTES = 0;
const LOAD_INSTRUMENT_BYTES = 0;
// 1,906 -> 7,523 (re-derived 2026-08-06, execution-clarity ledger U7). The old
// number is not comparable with the new one, for three reasons the slice itself
// created: the unit is now raw chunk bytes rather than gzip; `web:resume-events`
// moved into the framework category and left the app number; and the turn now
// charges every module the click actually executed, not the two the event record
// names. Measured on the box build, summing the served execution-sizes.json over
// the ten app chunks this click wakes:
//   4860 + 205 + 466 + 259 + 240 + 239 + 247 + 254 + 523 + 230 = 7,523 B
// The box re-derives this every run rather than trusting the literal: it sums the
// size map over data-markless-log-turn-modules and fails unless the mirrored app
// delta equals that sum, so a newly waking module moves both sides.
// 7,523 -> 7,524 (interim re-anchor 2026-08-17): no chunk above grew. This tree
// still measures 7,523 with the ten listed sizes byte-identical; the extra byte
// appears only on the linux CI runner, in run 32047847197, the first CI run to
// reach this box since the boxes step went skipped behind a red unit step. Origin
// unexplained; covers the measured linux actual with no headroom, tighten-only
// policy unchanged.
// 7,524 -> 7,551 (2026-08-30): +28 B in the Player branch-arm renderer chunk
// (523 -> 551 B) from the branch-only-component SSR emit fix — components whose
// body is only a branch now get their own server render function. Correctness
// cost, attributed; the other nine chunks match the prior sizes within 1 B.
// Covers the measured local actual (7,550) plus the known 1 B linux delta.
const FIRST_PLAY_APP_BYTES_MAX = 7_551;
// 2,400 -> 2,520 (owner receipt 2026-07-12): the wiring repair relocated
// ~111 B of accounting from the app chunk into the lazy logger - app bytes
// unchanged, never-mode byte-identical; instrument growth stays visible.
// 2,610 -> 9,537 (re-derived 2026-08-06, execution-clarity ledger U7). Same unit
// change as the app wall: 2,610 was the dev-log chunk's GZIP size (7,036 raw /
// ~2,626 gzip at the T006 pin) and the ledger charges raw chunk bytes. Measured
// dev-log chunk: 9,537 raw / 3,430 gzip. Raw growth over 7,036 is this slice's own
// ledger arithmetic (the ledger, the attribution lookup, the chunk dedupe); it
// stays in its own category and out of the headline, which is what the pin wanted
// visible.
const FIRST_PLAY_INSTRUMENT_BYTES_MAX = 9_537;

export default box(
	{
		name: 'music-player ssr: page serves and play/pause icon branch flips',
		tags: ['music-player', 'router', 'ssr', 'preview', 'browser', 'branch'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		await invalidateMusicSsrReceipt();
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
		if (/<script type="markless\/(?:state|view)">/.test(html)) {
			throw new Error(
				'Expected build-known music-player SSR state to use the zero-payload prerender container.',
			);
		}
		if (!/data-markless-resume-module="\/build\/chunk-[A-Za-z0-9_-]+\.js"/.test(html)) {
			throw new Error('Expected music-player SSR to carry its hashed prerender-wake URL.');
		}
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
		const actionStartIndex = (await page.networkRequests()).length;
		receipt.note(`ssr play-branch startup JS: ${formatPaths(startupScripts)}`);

		await page.click(PLAY_TOGGLE, WAIT);
		await expect.page.text(page, PLAY_ICON, PLAYING_ICON, WAIT);
		await expect.page.attribute(page, PLAY_TOGGLE, 'class', 'play active', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		const sizes = await servedExecutionSizes(preview);
		const firstPlay = await waitForLogInteractionAttribute(page, 1, sizes, WAIT);
		receipt.note(
			`first-Play charge: app ${firstPlay.app} B, framework ${firstPlay.framework} B over ` +
				`[${firstPlay.modules.join(', ')}]`,
		);
		if (firstPlay.app > FIRST_PLAY_APP_BYTES_MAX) {
			throw new Error(
				`Expected first-Play app bytes to stay <= ${FIRST_PLAY_APP_BYTES_MAX}, got ${firstPlay.app}.`,
			);
		}
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
		// The second click charges only what the first did not: the ledger counts
		// each module once, so this turn's own delta is smaller, never a re-charge.
		const secondPlay = await waitForLogInteractionAttribute(page, 2, sizes, WAIT);
		receipt.note(
			`second-Play charge: app ${secondPlay.app} B, framework ${secondPlay.framework} B`,
		);

		// Track navigation exercises composed events and dom updates deeper in
		// the tree (also absorbed from the retired tmp-ssr box).
		await page.click('[aria-label="Next track"]', WAIT);
		await expect.page.bodyText(page, { contains: 'Empty Crown' }, WAIT);
		// Next-track app-execution wall. 1,906 -> 3,301 (re-derived 2026-08-06, U7):
		// same unit and coverage change as the first-Play wall above — raw chunk
		// bytes over the 11 modules this turn actually executed, measured on the box
		// build (turn delta app 3,301 B, framework 358 B).
		await waitForAppBytesCeiling(page, 3_301, WAIT);
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

		// Witness currently permits only one Nitro preview per run, so the
		// library regression probe shares this box's resumed page. Unlike the
		// button binding, the panel binding belongs to the composed Library child
		// and turns red when a child-edge dom-update record is dropped.
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
		const requests = await page.networkRequests();
		const fixtureOrigin = new URL(page.url).origin;
		const analyzerResults = [
			evaluateMusicSsrPreloadWindow({
				baseUrl: page.url,
				actionKind: 'interaction',
				declaredPreloads: preloadHrefs,
				// S1 governs the fixture's own build modules; declared third-party
				// player internals are I2's jurisdiction (network rules below).
				observedRequests: requests
					.map((request, index) => ({
						phase:
							index < actionStartIndex ? ('bootstrap' as const) : ('action' as const),
						...(index < actionStartIndex
							? {}
							: { actionId: 'play-pause-next-or-library' }),
						url: request.url,
					}))
					.filter((observation) => new URL(observation.url).origin === fixtureOrigin),
			}).invariant,
			evaluateMusicSsrRequests({
				pageOrigin: new URL(page.url).origin,
				rules: musicSsrAnalyzerPolicy.network,
				requests,
			}),
			{ id: 'MLA-I1-CONSOLE' as const, status: 'pass' as const, details: [] },
			{ id: 'MLA-EXT-WITNESS' as const, status: 'pass' as const, details: [] },
		];
		for (const result of analyzerResults) {
			if (result.status === 'fail') throw new Error(result.details.join('\n'));
		}

		await preview.close();
		await receipt.capture(
			'music-player ssr round-tripped the icon branch and library panel class',
		);
		await writeMusicSsrReceipt(analyzerResults);
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
	networkRequests(): Promise<
		ReadonlyArray<{
			readonly url: string;
			readonly method: string;
			readonly status: number | null;
			readonly failedReason: string | null;
		}>
	>;
};

type ContentPage = {
	content(): Promise<string>;
};

async function waitForLogSummaryAttribute(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	// Exact zero is the permanent load gate (owner ratification 2026-07-12, T006):
	// any positive app or instrument execution during resume is a regression.
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		if (
			/data-markless-log-summary="markless: resumed — 0\.0 KB app executed, \d+ modules preloaded \(0 app executed\) · 0\.0 KB instrument"/.test(
				html,
			) &&
			new RegExp(`data-markless-log-app-bytes="${LOAD_APP_BYTES}"`).test(html) &&
			new RegExp(`data-markless-log-instrument-bytes="${LOAD_INSTRUMENT_BYTES}"`).test(
				html,
			) &&
			!/data-markless-log-summary="[^"]*· 3\.1 KB"/.test(html)
		)
			return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Expected data-markless-log-summary to mirror the resume summary.');
}

type ExecutionSizeMap = Record<
	string,
	{ readonly raw?: number; readonly gzip?: number; readonly instrument?: true }
>;

const FRAMEWORK_LOG_ID = /^(?:web|runtime|serializer|router|core|analyzer):/;

async function servedExecutionSizes(preview: {
	request(path: string): Promise<string>;
}): Promise<ExecutionSizeMap> {
	const sizes = JSON.parse(
		await preview.request('/build/execution-sizes.json'),
	) as ExecutionSizeMap;
	if (!sizes['web:resume-events']?.raw) {
		throw new Error('Expected the served size map to carry a raw size for web:resume-events.');
	}
	return sizes;
}

// The turn's cost is proven, not guessed: the ledger names the modules it
// charged, and each one is joined against the served size map by category. The
// arithmetic is checked end to end over the observed set, so a new module waking
// changes the sum AND the module list rather than silently fitting a literal.
async function waitForLogInteractionAttribute(
	page: ContentPage,
	count: number,
	sizes: ExecutionSizeMap,
	options: { readonly timeoutMs: number },
): Promise<{ readonly app: number; readonly framework: number; readonly modules: string[] }> {
	const started = Date.now();
	const countPattern = new RegExp(`data-markless-log-interactions="${count}"`);
	// The owner's wording, and the shapes that must never come back: a bare
	// total with no per-click clause, and any "bytes unknown" accounting.
	const lastPattern =
		/data-markless-log-last="markless: (\d+\.\d) KB executed at load · this click \+(\d+\.\d) KB · total (\d+\.\d) KB[^"]*"/;
	// Self-check the matcher against the pre-ledger wording it must never accept.
	if (
		lastPattern.test(
			'data-markless-log-last="markless: click [button.play] · woke 1 modules · ran warm 2 modules · 3.1 KB"',
		)
	) {
		throw new Error('Execution-log matcher accepted the pre-ledger interaction wording.');
	}
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		const last = lastPattern.exec(html);
		const read = (name: string) =>
			new RegExp(`data-markless-log-${name}="([^"]*)"`).exec(html)?.[1];
		if (!countPattern.test(html) || !last) {
			await new Promise((resolve) => setTimeout(resolve, 25));
			continue;
		}
		if (/data-markless-log-incomplete="/.test(html)) {
			throw new Error(
				`The ledger reported unmapped ids on interaction ${count}: ${read('last')}`,
			);
		}
		const modules = (read('turn-modules') ?? '').split(' ').filter(Boolean);
		if (modules.length === 0) {
			throw new Error(
				`Interaction ${count} charged no modules; the ledger mirrored nothing.`,
			);
		}
		const expected = { app: 0, framework: 0, instrument: 0 };
		for (const id of modules) {
			const entry = sizes[id];
			if (!entry?.raw) {
				throw new Error(
					`Interaction ${count} charged ${id}, which the served size map cannot back.`,
				);
			}
			expected[
				entry.instrument ? 'instrument' : FRAMEWORK_LOG_ID.test(id) ? 'framework' : 'app'
			] += entry.raw;
		}
		const app = Number(read('app-bytes'));
		const framework = Number(read('framework-bytes'));
		if (app !== expected.app || framework !== expected.framework) {
			throw new Error(
				`Interaction ${count} accounting disagrees with the size map: mirrored ` +
					`app=${app} framework=${framework}, size-map sum over [${modules.join(', ')}] ` +
					`app=${expected.app} framework=${expected.framework}.`,
			);
		}
		// The readable clause and the exact mirror must be the same number.
		if ((Number(read('turn-bytes')) / 1024).toFixed(1) !== last[2]) {
			throw new Error(
				`Interaction ${count} printed +${last[2]} KB but mirrored ${read('turn-bytes')} B.`,
			);
		}
		const instrumentBytes = Number(read('instrument-bytes'));
		if (
			!Number.isInteger(instrumentBytes) ||
			instrumentBytes > FIRST_PLAY_INSTRUMENT_BYTES_MAX
		) {
			throw new Error(
				`Expected first-Play instrument bytes to be an integer <= ${FIRST_PLAY_INSTRUMENT_BYTES_MAX}, got ${instrumentBytes}.`,
			);
		}
		return { app, framework, modules };
	}
	throw new Error(`Expected interaction ${count} to mirror the owner-worded ledger line.`);
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

async function waitForAppBytesCeiling(
	page: ContentPage,
	ceilingBytes: number,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	let lastSeen: string | null = null;
	while (Date.now() - started < options.timeoutMs) {
		const html = await page.content();
		const raw = /data-markless-log-app-bytes="(\d+)"/.exec(html)?.[1];
		if (raw !== undefined) {
			lastSeen = raw;
			if (Number(raw) <= ceilingBytes) return;
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error(
		`Expected app-bytes mirror within the ${ceilingBytes} B wall, saw ${lastSeen ?? '(absent)'}.`,
	);
}
