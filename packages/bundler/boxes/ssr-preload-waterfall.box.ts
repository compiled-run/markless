import { box } from '@async/witness';

const FIXTURE = 'fixtures/vite-ssr-preloader';
const COUNTER = '[data-counter]';
const SSR_ROUTE = '/';
const WAIT = { timeoutMs: 10_000 };
const MIN_COMPLEX_PRELOAD_COUNT = 6;
const SLOW_NETWORK = {
	latencyMs: 500,
	downloadThroughputBytesPerSecond: (300 * 1024) / 8,
	uploadThroughputBytesPerSecond: (300 * 1024) / 8,
	connectionType: 'cellular3g' as const,
};

export default box(
	{
		name: 'ssr preload: modulepreload requests overlap instead of waterfalling',
		tags: ['ssr', 'build', 'preview', 'browser', 'preload', 'network', 'waterfall'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const expectedPreloadHrefs = modulePreloadHrefs(await preview.request(SSR_ROUTE));
		assertComplexPreloadSet(expectedPreloadHrefs);
		const page = await preview.browser.visit(SSR_ROUTE, {
			networkConditions: SLOW_NETWORK,
		});
		await expect.page.text(page, COUNTER, '0', WAIT);
		const moduleRequests = await waitForBuildRequests(page, expectedPreloadHrefs.length);
		receipt.note(`SSR preload overlap requests:\n${formatTimeline(moduleRequests)}`);
		assertRequestsOverlap(moduleRequests, expectedPreloadHrefs);

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		await page.clearNetworkEmulation();
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('ssr preload module request overlap under throttling');
	},
);

type BrowserNetworkRequest = {
	readonly url: string;
	readonly method: string;
	readonly startTimeMs: number;
	readonly endTimeMs: number | null;
	readonly durationMs: number | null;
	readonly status: number | null;
	readonly failedReason: string | null;
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

function modulePreloadHrefs(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)].map(
		(match) => match[1],
	);
}

function assertComplexPreloadSet(hrefs: readonly string[]): void {
	if (hrefs.length < MIN_COMPLEX_PRELOAD_COUNT) {
		throw new Error(
			`Expected a complex preload set with at least ${MIN_COMPLEX_PRELOAD_COUNT} chunks, saw ${hrefs.length}: ${hrefs.join(', ')}`,
		);
	}
}

function jsBuildRequests(
	requests: readonly BrowserNetworkRequest[],
): readonly BrowserNetworkRequest[] {
	return requests.filter(
		(request) =>
			request.method === 'GET' &&
			new URL(request.url).pathname.startsWith('/build/') &&
			new URL(request.url).pathname.endsWith('.js'),
	);
}

function assertRequestsOverlap(
	requests: readonly BrowserNetworkRequest[],
	expectedHrefs: readonly string[],
): void {
	if (requests.length < 2) {
		throw new Error(
			`Expected at least two preloaded JS chunks to prove no waterfall, saw ${requests.length}.`,
		);
	}
	const requestPaths = new Set(requests.map((request) => new URL(request.url).pathname));
	for (const href of expectedHrefs) {
		const path = new URL(href, 'http://fixture.local').pathname;
		if (!requestPaths.has(path)) {
			throw new Error(
				`Expected rendered modulepreload href ${path} to be fetched during startup.\n${formatTimeline(requests)}`,
			);
		}
	}
	for (const request of requests) {
		if (request.status !== 200 || request.failedReason) {
			throw new Error(
				`Expected successful preload request, got ${request.status ?? '?'} ${request.url}`,
			);
		}
		if (request.endTimeMs === null || request.durationMs === null || request.durationMs <= 0) {
			throw new Error(`Expected complete CDP timing for preload request: ${request.url}`);
		}
	}

	const ordered = [...requests].sort((left, right) => left.startTimeMs - right.startTimeMs);
	for (let index = 1; index < ordered.length; index++) {
		const previous = ordered[index - 1];
		const current = ordered[index];
		if (previous.endTimeMs !== null && current.startTimeMs >= previous.endTimeMs) {
			throw new Error(
				`Expected overlapping modulepreload fetches, but ${new URL(current.url).pathname} started after ${new URL(previous.url).pathname} completed.\n${formatTimeline(ordered)}`,
			);
		}
	}
}

function formatTimeline(requests: readonly BrowserNetworkRequest[]): string {
	if (requests.length === 0) return '(none)';
	const firstStart = Math.min(...requests.map((request) => request.startTimeMs));
	return [...requests]
		.sort((left, right) => left.startTimeMs - right.startTimeMs)
		.map((request) => {
			const start = Math.round(request.startTimeMs - firstStart);
			const end =
				request.endTimeMs === null ? '?' : Math.round(request.endTimeMs - firstStart);
			const duration = request.durationMs === null ? '?' : Math.round(request.durationMs);
			return `${new URL(request.url).pathname} start=${start}ms end=${end}ms duration=${duration}ms`;
		})
		.join('\n');
}
