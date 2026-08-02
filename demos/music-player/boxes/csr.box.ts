import { box } from '@async/witness';
import {
	evaluateMusicCsrPreloadWindow,
	evaluateMusicCsrRequests,
	invalidateMusicCsrReceipt,
	writeMusicCsrReceipt,
} from './analyzer/analyzer-gate.ts';
import { musicCsrAnalyzerPolicy } from './analyzer/policy.ts';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player csr: preview warms lazy symbols and resumes youtube command state',
		tags: ['music-player', 'csr', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		await invalidateMusicCsrReceipt();
		const build = await pipeline.build();
		const preview = await pipeline.preview(build);
		const html = await preview.request('/');
		const preloadHrefs = modulePreloadHrefs(html);
		if (!/\brel="?modulepreload"?/.test(html))
			throw new Error('Expected CSR music player HTML to carry modulepreload links (quoted or compact).');
		if (preloadHrefs.length === 0) {
			throw new Error('Expected CSR music player HTML to render modulepreload links.');
		}
		assertModulePreloadsInHead(html);
		if (/type=["']markless\/(?:state|view)["']/.test(html)) {
			throw new Error('Prerendered music player HTML must not include state/view payload scripts.');
		}
		if (!/<script\b[^>]*\btype="module"[^>]*\bsrc=/.test(html)) {
			throw new Error(
				'Expected CSR music player HTML to load the app through a module script.',
			);
		}

		const page = await preview.browser.visit('/');

		await expect.page.bodyText(
			page,
			{
				contains: 'Do I Clench My Fists? (Slowed + Reverb)',
			},
			WAIT,
		);
		const startupModules = await waitForBuildRequests(page, preloadHrefs.length);
		assertPreloadedStartupModules(startupModules, preloadHrefs);
		receipt.note(`music-player csr startup JS: ${formatRequests(startupModules)}`);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'cue', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'DwTzcZxyUUg',
			WAIT,
		);
		await expect.page.attribute(page, '.track', 'data-color-start', '#2f4f66', WAIT);
		await expect.page.attribute(page, '.track', 'data-color-end', '#a57c5b', WAIT);

		const startupPaths = new Set(startupModules.map((request) => pathOf(request.url)));
		const actionStartIndex = (await page.networkRequests()).length;
		await page.trackEvents('click');
		await page.click('[aria-label="Play or pause"]', WAIT);
		await expect.page.outcome(page, { events: { click: { atLeast: 1 } } }, WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-playing', 'true', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command-version', '1', WAIT);
		await expect.page.exists(page, 'script[src="https://www.youtube.com/iframe_api"]', WAIT);
		// Exactness contract (preloader-router-regressions goal): the preload
		// plan covers every interaction-reachable chunk, so the play click must
		// load NOTHING beyond the startup preloaded set.
		assertNoNewBuildJs(await page.networkRequests(), startupPaths, 'play interaction');

		await page.click('[aria-label="Next track"]', WAIT);
		await expect.page.bodyText(page, { contains: 'Empty Crown' }, WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'load', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'm_qlgFQs7E4',
			WAIT,
		);
		await expect.page.attribute(page, '.track', 'data-color-start', '#4b3f72', WAIT);
		await expect.page.attribute(page, '.track', 'data-color-end', '#d79f6f', WAIT);
		assertNoNewBuildJs(await page.networkRequests(), startupPaths, 'next-track interaction');
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		const requests = await page.networkRequests();
		const fixtureOrigin = new URL(page.url).origin;
		const analyzerResults = [
			evaluateMusicCsrPreloadWindow({
				baseUrl: page.url,
				actionKind: 'interaction',
				declaredPreloads: preloadHrefs,
				// S1 governs the fixture's own build modules; declared third-party
				// player internals are I2's jurisdiction (network rules below).
				observedRequests: requests
					.map((request, index) => ({
						phase: index < actionStartIndex ? ('bootstrap' as const) : ('action' as const),
						...(index < actionStartIndex ? {} : { actionId: 'play-or-next-track' }),
						url: request.url,
					}))
					.filter((observation) => new URL(observation.url).origin === fixtureOrigin),
			}).invariant,
			evaluateMusicCsrRequests({
				pageOrigin: new URL(page.url).origin,
				rules: musicCsrAnalyzerPolicy.network,
				requests,
			}),
			{ id: 'MLA-I1-CONSOLE' as const, status: 'pass' as const, details: [] },
			{ id: 'MLA-EXT-WITNESS' as const, status: 'pass' as const, details: [] },
		];
		for (const result of analyzerResults) {
			if (result.status === 'fail') throw new Error(result.details.join('\n'));
		}

		await preview.close();
		await receipt.capture('music-player csr preview youtube command state');
		await writeMusicCsrReceipt(analyzerResults);
	},
);

function modulePreloadHrefs(html: string): readonly string[] {
	// The post-build compactor may emit unquoted attribute values; accept both.
	return [...html.matchAll(/<link\b(?=[^>]*\brel="?modulepreload"?)[^>]*\bhref="?([^"\s>]+)"?/g)].map(
		(match) => match[1]!,
	);
}

function assertModulePreloadsInHead(html: string): void {
	const headEnd = html.indexOf('</head>');
	const bodyStart = html.indexOf('<body>');
	const firstPreload = html.search(/\brel="?modulepreload"?/);
	if (headEnd === -1 || bodyStart === -1 || firstPreload === -1) {
		throw new Error('Expected HTML document with modulepreload links in head.');
	}
	if (firstPreload > headEnd || firstPreload > bodyStart) {
		throw new Error('Expected CSR music player modulepreloads before </head>.');
	}
	const bodyHtml = html.slice(bodyStart);
	if (/\brel="?modulepreload"?/.test(bodyHtml)) {
		throw new Error('Expected CSR music player body to contain no modulepreload links.');
	}
}

type BrowserNetworkRequest = {
	readonly url: string;
	readonly method: string;
	readonly status: number | null;
	readonly failedReason: string | null;
	readonly durationMs: number | null;
};

type NetworkRequestPage = {
	networkRequests(): Promise<BrowserNetworkRequest[]>;
};

async function waitForBuildRequests(
	page: NetworkRequestPage,
	minCount: number,
	timeoutMs = 10_000,
): Promise<readonly BrowserNetworkRequest[]> {
	const start = Date.now();
	let latest: readonly BrowserNetworkRequest[] = [];
	while (Date.now() - start < timeoutMs) {
		latest = jsBuildRequests(await page.networkRequests());
		if (latest.length >= minCount) return latest;
		await sleep(50);
	}
	return latest;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPreloadedStartupModules(
	requests: readonly BrowserNetworkRequest[],
	expectedHrefs: readonly string[],
): void {
	const requestPaths = new Set(requests.map((request) => new URL(request.url).pathname));
	for (const href of expectedHrefs) {
		const path = new URL(href, 'http://fixture.local').pathname;
		if (!requestPaths.has(path)) {
			throw new Error(
				`Expected rendered modulepreload href ${path} to be fetched during startup, but saw: ${formatRequests(requests)}`,
			);
		}
	}
	for (const request of requests) {
		if (request.status !== 200 || request.failedReason) {
			throw new Error(
				`Expected successful preloaded module request, got ${request.status ?? '?'} for ${request.url}`,
			);
		}
	}
}

function assertNoNewBuildJs(
	requests: readonly BrowserNetworkRequest[],
	startupPaths: ReadonlySet<string>,
	label: string,
): void {
	const loadedAfterStartup = jsBuildRequests(requests).filter(
		(request) => !startupPaths.has(pathOf(request.url)),
	);
	if (loadedAfterStartup.length > 0) {
		throw new Error(
			`Expected ${label} to use only startup modulepreloads, but saw new JS:\n${formatRequests(loadedAfterStartup)}`,
		);
	}
}

function pathOf(url: string): string {
	return new URL(url).pathname;
}

function jsBuildRequests(
	requests: readonly BrowserNetworkRequest[],
): readonly BrowserNetworkRequest[] {
	return requests.filter((request) => {
		const pathname = new URL(request.url).pathname;
		return (
			request.method === 'GET' && pathname.startsWith('/build/') && pathname.endsWith('.js')
		);
	});
}

function formatRequests(requests: readonly BrowserNetworkRequest[]): string {
	if (requests.length === 0) return '(none)';
	return requests
		.map((request) => {
			const duration =
				request.durationMs === null ? '?' : `${Math.round(request.durationMs)}ms`;
			return `${new URL(request.url).pathname} ${request.status ?? '?'} ${duration}`;
		})
		.join(', ');
}
