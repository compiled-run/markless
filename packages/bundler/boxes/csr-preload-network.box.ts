import { box } from '@async/witness';
import { planModulePreloadUrls } from '../src/build/preload-plan.ts';
import type { ArcadeBundleGraph } from '../src/types.ts';

const FIXTURE = 'fixtures/vite-csr';
const COUNTER = '[data-counter]';
const CSR_ROUTE = '/';
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const WAIT = { timeoutMs: 10_000 };
const MIN_CSR_PRELOAD_COUNT = 4;
const SLOW_NETWORK = {
	latencyMs: 500,
	downloadThroughputBytesPerSecond: (300 * 1024) / 8,
	uploadThroughputBytesPerSecond: (300 * 1024) / 8,
	connectionType: 'cellular3g' as const,
};

export default box(
	{
		name: 'csr preload: throttled startup overlaps lazy symbol modulepreloads',
		tags: ['csr', 'build', 'preview', 'browser', 'preload', 'network', 'waterfall'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const expectedPreloadHrefs = expectedCsrPreloadHrefs(
			JSON.parse(await preview.request(BUNDLE_GRAPH_REQUEST)) as ArcadeBundleGraph,
		);
		const page = await preview.browser.visit(CSR_ROUTE, {
			networkConditions: SLOW_NETWORK,
		});
		await expect.page.text(page, COUNTER, '0', WAIT);
		await expect.page.text(page, '#hmr-status', 'ready', WAIT);
		await expect.page.attribute(page, 'body', 'data-csr-lazy-module', 'cold', WAIT);
		const preloadRequests = await waitForExpectedPreloadRequests(page, expectedPreloadHrefs);
		receipt.note(`CSR preload throttled startup JS:\n${formatTimeline(preloadRequests)}`);
		assertPreloadedStartupModules(preloadRequests, expectedPreloadHrefs);
		assertRequestsOverlap(preloadRequests, expectedPreloadHrefs);

		const beforeClick = await page.networkRequests();
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		await expect.page.attribute(page, 'body', 'data-csr-lazy-module', 'evaluated', WAIT);
		const afterClick = await page.networkRequests();
		const interactionModules = jsBuildRequests(afterClick.slice(beforeClick.length));
		receipt.note(`CSR preload post-click JS: ${formatRequests(interactionModules)}`);
		if (interactionModules.length > 0) {
			throw new Error(
				`Expected preloaded CSR interaction to avoid new JS fetches after click, but saw: ${formatRequests(interactionModules)}`,
			);
		}

		await page.clearNetworkEmulation();
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('csr preload low network startup overlap and interaction');
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

function expectedCsrPreloadHrefs(bundleGraph: ArcadeBundleGraph): readonly string[] {
	const roots = bundleGraph
		.filter((item): item is string => typeof item === 'string' && item.startsWith('symbol:'))
		.map((name) => ({ name, priority: 'high' as const }));
	const hrefs = planModulePreloadUrls({
		base: '/build/',
		bundleGraph,
		roots,
	});

	if (hrefs.length < MIN_CSR_PRELOAD_COUNT) {
		throw new Error(
			`Expected CSR fixture to expose at least ${MIN_CSR_PRELOAD_COUNT} lazy symbol modulepreloads, saw ${hrefs.length}: ${hrefs.join(', ')}`,
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
		latest = jsBuildRequests(await page.networkRequests()).filter((request) =>
			expectedPaths.includes(new URL(request.url).pathname),
		);
		const requestPaths = new Set(latest.map((request) => new URL(request.url).pathname));
		if (expectedPaths.every((path) => requestPaths.has(path))) return latest;
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
	return requests.filter(
		(request) =>
			request.method === 'GET' &&
			new URL(request.url).pathname.startsWith('/build/') &&
			new URL(request.url).pathname.endsWith('.js'),
	);
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
				`Expected CSR startup to request lazy symbol modulepreload ${path}, but saw:\n${formatTimeline(requests)}`,
			);
		}
	}
	for (const request of requests) {
		if (request.status !== 200 || request.failedReason) {
			throw new Error(
				`Expected successful preloaded module request, got ${request.status ?? '?'} ${request.url}`,
			);
		}
		if (request.endTimeMs === null || request.durationMs === null || request.durationMs <= 0) {
			throw new Error(`Expected complete CDP timing for preload request: ${request.url}`);
		}
	}
}

function assertRequestsOverlap(
	requests: readonly BrowserNetworkRequest[],
	expectedHrefs: readonly string[],
): void {
	if (requests.length < 2) {
		throw new Error(
			`Expected at least two CSR preloaded JS chunks to prove no waterfall, saw ${requests.length}.`,
		);
	}
	const expectedPaths = new Set(
		expectedHrefs.map((href) => new URL(href, 'http://fixture.local').pathname),
	);
	const ordered = requests
		.filter((request) => expectedPaths.has(new URL(request.url).pathname))
		.sort((left, right) => left.startTimeMs - right.startTimeMs);
	const preloadBatch = dropAlreadyLoadedEntryDependencies(ordered);
	for (let index = 1; index < preloadBatch.length; index++) {
		const previous = preloadBatch[index - 1]!;
		const current = preloadBatch[index]!;
		if (previous.endTimeMs !== null && current.startTimeMs >= previous.endTimeMs) {
			throw new Error(
				`Expected overlapping CSR modulepreload fetches, but ${new URL(current.url).pathname} started after ${new URL(previous.url).pathname} completed.\n${formatTimeline(preloadBatch)}`,
			);
		}
	}
}

function dropAlreadyLoadedEntryDependencies(
	requests: readonly BrowserNetworkRequest[],
): readonly BrowserNetworkRequest[] {
	let start = 0;
	while (
		start + 1 < requests.length &&
		requests[start]!.endTimeMs !== null &&
		requests[start + 1]!.startTimeMs >= requests[start]!.endTimeMs
	) {
		start++;
	}
	return requests.slice(start);
}

function formatRequests(requests: readonly BrowserNetworkRequest[]): string {
	if (requests.length === 0) return '(none)';
	return requests.map((request) => new URL(request.url).pathname).join(', ');
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
