import { box } from '@async/witness';
import {
	evaluatePreloaderEvidence,
	measureAndRefuseI5,
	measureI5WithV8,
	requirePassingAnalyzerResults,
} from './analyzer-gate.ts';
import { clickCausedRequests, preClickInstantMs } from './network-phase.ts';
import {
	invalidateBundlerAnalyzerReceipt,
	writeBundlerAnalyzerReceipt,
} from './witness-verdict.ts';

const FIXTURE = 'fixtures/vite-ssr-preloader';
const COUNTER = '[data-counter]';
const SSR_ROUTE = '/';
const WAIT = { timeoutMs: 10_000 };
const MIN_COMPLEX_PRELOAD_COUNT = 6;
const SLOW_3G = {
	latencyMs: 400,
	downloadThroughputBytesPerSecond: (400 * 1024) / 8,
	uploadThroughputBytesPerSecond: (400 * 1024) / 8,
	connectionType: 'cellular3g' as const,
};

export default box(
	{
		name: 'ssr preload: low-network startup downloads preloaded chunks before interaction',
		tags: ['ssr', 'build', 'preview', 'browser', 'preload', 'network'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		await invalidateBundlerAnalyzerReceipt('ssr-preloader');
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
			networkConditions: SLOW_3G,
		});
		await expect.page.text(page, COUNTER, '0', WAIT);
		const startupModules = await waitForBuildRequests(page, expectedPreloadHrefs.length);
		receipt.note(`SSR preload throttled startup JS: ${formatRequests(startupModules)}`);
		assertPreloadedStartupModules(startupModules, expectedPreloadHrefs);

		const beforeClick = await page.networkRequests();
		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const afterClick = await page.networkRequests();
		// Phase by start time, not array position: witness records a request only
		// when it finishes, so slicing at beforeClick.length counts a page-parse
		// modulepreload that was still in flight at click time as click-caused.
		const actionStartTimeMs = preClickInstantMs(beforeClick);
		const interactionModules = jsBuildRequests(clickCausedRequests(beforeClick, afterClick));
		receipt.note(`SSR preload post-click JS: ${formatRequests(interactionModules)}`);
		if (interactionModules.length > 0) {
			throw new Error(
				`Expected preloaded SSR interaction to avoid new JS fetches after click, but saw: ${formatRequests(interactionModules)}`,
			);
		}

		await page.clearNetworkEmulation();
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		if (process.env.MARKLESS_ANALYZER_MEASURE_I5 === '1') {
			await measureAndRefuseI5('vite-ssr-preloader', () =>
				measureI5WithV8(page.url, COUNTER),
			);
		}
		const analyzerResults = evaluatePreloaderEvidence({
			fixture: 'vite-ssr-preloader',
			pageUrl: page.url,
			declaredPreloads: expectedPreloadHrefs,
			actionStartTimeMs,
			requests: afterClick,
		});
		// Merge-blocking: a failed analyzer result fails the box (never advisory).
		requirePassingAnalyzerResults(analyzerResults);
		await preview.close();
		await receipt.capture('ssr preload low network startup and interaction');
		await writeBundlerAnalyzerReceipt({
			name: 'ssr-preloader',
			identity: { fixture: 'vite-ssr-preloader' },
			results: analyzerResults,
		});
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

function assertPreloadedStartupModules(
	requests: readonly BrowserNetworkRequest[],
	expectedHrefs: readonly string[],
): void {
	if (requests.length === 0) {
		throw new Error(
			'Expected modulepreload startup to fetch built JS modules under throttling.',
		);
	}
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
				`Expected successful preloaded module request, got ${request.status ?? 'unknown'} for ${request.url}`,
			);
		}
		if (request.durationMs === null || request.durationMs <= 0) {
			throw new Error(
				`Expected CDP timing duration for preloaded module request: ${request.url}`,
			);
		}
	}
}

function formatRequests(requests: readonly BrowserNetworkRequest[]): string {
	if (requests.length === 0) return '(none)';
	return requests
		.map((request) => {
			const path = new URL(request.url).pathname;
			const duration =
				request.durationMs === null ? '?' : `${Math.round(request.durationMs)}ms`;
			return `${path} ${request.status ?? '?'} ${duration}`;
		})
		.join(', ');
}
