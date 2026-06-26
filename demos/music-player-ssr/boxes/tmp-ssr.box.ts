import { box } from '@async/witness';

const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'music-player ssr: preview resumes youtube command state',
		tags: ['music-player', 'ssr', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({ ...config, mode: 'ssr' }),
		});
		const preview = await pipeline.preview(build);
		const html = await preview.request('/');
		const preloadHrefs = modulePreloadHrefs(html);
		await expect.html.contains(html, 'data-async-resumer');
		await expect.html.contains(html, 'rel="modulepreload"');
		if (preloadHrefs.length === 0) {
			throw new Error('Expected SSR music player HTML to render modulepreload links.');
		}
		if (/<script\b[^>]*\bsrc=/.test(html)) {
			throw new Error('Expected SSR playground HTML to keep startup JavaScript script-free.');
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
		receipt.note(`music-player SSR startup JS: ${formatRequests(startupModules)}`);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'cue', WAIT);
		await expect.page.attribute(
			page,
			'.youtube-frame-host',
			'data-video-id',
			'DwTzcZxyUUg',
			WAIT,
		);

		await page.click('[aria-label="Play or pause"]', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command', 'play', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-playing', 'true', WAIT);
		await expect.page.attribute(page, '.youtube-frame-host', 'data-command-version', '1', WAIT);
		await expect.page.exists(page, 'script[src="https://www.youtube.com/iframe_api"]', WAIT);

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
		await receipt.capture('music-player ssr preview resumed youtube command state');
	},
);

function modulePreloadHrefs(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)].map(
		(match) => match[1]!,
	);
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
