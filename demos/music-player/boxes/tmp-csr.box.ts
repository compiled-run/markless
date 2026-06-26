import { box } from '@async/witness';
import { planModulePreloads, type ArcadeBundleGraph } from 'arcade/preload';

const WAIT = { timeoutMs: 10_000 };
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const MIN_CSR_PRELOAD_COUNT = 2;

export default box(
	{
		name: 'music-player csr: preview updates youtube command state',
		tags: ['music-player', 'csr', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build();
		const preview = await pipeline.preview(build);
		const page = await preview.browser.visit('/');
		const expectedPreloadHrefs = expectedCsrPreloadHrefs(
			JSON.parse(await preview.request(BUNDLE_GRAPH_REQUEST)) as ArcadeBundleGraph,
		);
		receipt.note(`music-player CSR expected preload JS: ${expectedPreloadHrefs.join(', ')}`);

		await expect.page.bodyText(
			page,
			{
				contains: 'Do I Clench My Fists? (Slowed + Reverb)',
			},
			WAIT,
		);
		const startupModules = await waitForExpectedPreloadRequests(page, expectedPreloadHrefs);
		assertPreloadedStartupModules(startupModules, expectedPreloadHrefs);
		receipt.note(`music-player CSR startup JS: ${formatRequests(startupModules)}`);
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
		await expect.page.exists(page, 'script[src="https://www.youtube.com/iframe_api"]', WAIT);

		const beforeInteraction = await page.networkRequests();
		await page.trackEvents('click');
		await page.click('[aria-label="Play or pause"]', WAIT);
		await expect.page.outcome(page, { events: { click: { atLeast: 1 } } }, WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-playing', 'true', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command-version', '1', WAIT);
		assertNoBuildScriptsLoadedAfterInteraction(beforeInteraction, await page.networkRequests());

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

		await preview.close();
		await receipt.capture('music-player csr preview youtube command state');
	},
);

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

function expectedCsrPreloadHrefs(bundleGraph: ArcadeBundleGraph): readonly string[] {
	const roots = bundleGraph
		.filter((item): item is string => typeof item === 'string' && item.startsWith('symbol:'))
		.map((name) => ({ name, priority: 'high' as const }));
	const hrefs = planModulePreloads({
		base: '/build/',
		bundleGraph,
		roots,
	}).map((preload) => preload.href);

	if (hrefs.length < MIN_CSR_PRELOAD_COUNT) {
		throw new Error(
			`Expected CSR music player to expose at least ${MIN_CSR_PRELOAD_COUNT} lazy symbol modulepreloads, saw ${hrefs.length}: ${hrefs.join(', ')}`,
		);
	}
	return hrefs;
}

async function waitForExpectedPreloadRequests(
	page: NetworkRequestPage,
	expectedHrefs: readonly string[],
	timeoutMs = 10_000,
): Promise<readonly BrowserNetworkRequest[]> {
	const expectedPaths = expectedHrefs.map(
		(href) => new URL(href, 'http://fixture.local').pathname,
	);
	const start = Date.now();
	let latest: readonly BrowserNetworkRequest[] = [];
	while (Date.now() - start < timeoutMs) {
		latest = jsBuildRequests(await page.networkRequests());
		const requestPaths = new Set(latest.map((request) => new URL(request.url).pathname));
		if (expectedPaths.every((path) => requestPaths.has(path))) return latest;
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
				`Expected rendered modulepreload href ${path} to be fetched during CSR startup, but saw: ${formatRequests(requests)}`,
			);
		}
	}
	for (const request of requests) {
		if (request.status !== 200 || request.failedReason) {
			throw new Error(
				`Expected successful CSR preloaded module request, got ${request.status ?? '?'} for ${request.url}`,
			);
		}
	}
}

function assertNoBuildScriptsLoadedAfterInteraction(
	beforeInteraction: readonly BrowserNetworkRequest[],
	afterInteraction: readonly BrowserNetworkRequest[],
): void {
	const loadedAfterInteraction = jsBuildRequests(
		afterInteraction.slice(beforeInteraction.length),
	);
	if (loadedAfterInteraction.length > 0) {
		throw new Error(
			`Expected preloaded CSR interaction to avoid new Arcade JS fetches after click, but saw: ${formatRequests(loadedAfterInteraction)}`,
		);
	}
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
