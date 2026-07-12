import { box } from '@async/witness';
import { planModulePreloads } from '../src/build/preload-plan.ts';
import { runtimeSizeReport, type RuntimeSizeReport } from '../test-support/runtime-size.ts';
import type { MarklessBundleGraph } from '../src/types.ts';

// Product truth: the Vite CSR fixture's production output is not only emitted
// correctly; it can be served by Vite preview and load the generated client
// payload/resolver/symbol pipeline for a counter click. This is client-created
// DOM, not a resumability proof.
const FIXTURE = 'fixtures/vite-csr';
const DIST = `${FIXTURE}/dist`;
const INDEX = `${FIXTURE}/dist/index.html`;
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const COUNTER = '[data-counter]';
const REQUESTS = '/__markless-fixture-requests';
const WAIT = { timeoutMs: 10_000 };
const MIN_CSR_PRELOAD_COUNT = 2;
const MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES = 3_000;
const MAX_PRELOADED_SCRIPTS_GZIP_BYTES = 4_500;
const MAX_PRELOADED_SCRIPT_COUNT = 8;
const MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES = 0;
const MAX_INTERACTION_SCRIPTS_GZIP_BYTES = 0;
const MAX_INTERACTION_SCRIPT_COUNT = 0;

export default box(
	{
		name: 'csr preview: built app loads through vite preview',
		tags: ['csr', 'preview', 'preload'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const instrumentedBuild = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/boxes/vite-csr.instrumented.config.ts`,
			}),
		});
		await expect.build.environment(instrumentedBuild, 'client');
		const instrumentedPreview = await pipeline.preview(instrumentedBuild, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/boxes/vite-csr.instrumented.config.ts`,
			}),
		});
		const instrumentedPage = await instrumentedPreview.browser.visit('/');
		await expect.page.text(instrumentedPage, COUNTER, '0', WAIT);
		// owner ratification 2026-07-12, T008D
		await waitForLoadAppBytes(instrumentedPage, WAIT);
		// Owner-deferred: CSR counter dispatch is not yet wired to the execution logger.
		await instrumentedPreview.close();

		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		await expect.build.environment(build, 'client');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const page = await preview.browser.visit('/');
		const expectedPreloadHrefs = expectedCsrPreloadHrefs(
			JSON.parse(await preview.request(BUNDLE_GRAPH_REQUEST)) as MarklessBundleGraph,
		);
		receipt.note(`CSR expected lazy symbol modulepreloads: ${expectedPreloadHrefs.join(', ')}`);

		await expect.page.exists(page, '#app', WAIT);
		await expect.page.text(page, '#hmr-status', 'ready', WAIT);
		await expect.page.text(page, COUNTER, '0', WAIT);
		const startupModules = await waitForExpectedPreloadRequests(page, expectedPreloadHrefs);
		receipt.note(`CSR startup preloaded JS: ${formatNetworkRequests(startupModules)}`);
		const beforeInteraction = await readScriptRequests(preview);
		receipt.note(`CSR startup script requests: ${formatRequests(beforeInteraction)}`);
		const preloadedScripts = assertStartupPreloadsFetched(
			beforeInteraction,
			expectedPreloadHrefs,
		);
		const preloadedRuntimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: preloadedScripts,
		});
		receipt.note(`CSR preloaded runtime size:\n${preloadedRuntimeSize.summary}`);
		assertRuntimeSizeBudget(preloadedRuntimeSize, {
			label: 'CSR preloaded',
			maxRuntimeChunkGzipBytes: MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES,
			maxScriptsGzipBytes: MAX_PRELOADED_SCRIPTS_GZIP_BYTES,
			maxScriptCount: MAX_PRELOADED_SCRIPT_COUNT,
		});

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`CSR interaction script requests: ${formatRequests(afterInteraction)}`);
		const interactionScripts = assertNoScriptsLoadedAfterInteraction(
			beforeInteraction,
			afterInteraction,
		);
		const interactionRuntimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: interactionScripts,
		});
		receipt.note(`CSR interaction runtime size:\n${interactionRuntimeSize.summary}`);
		assertRuntimeSizeBudget(interactionRuntimeSize, {
			label: 'CSR interaction',
			maxRuntimeChunkGzipBytes: MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES,
			maxScriptsGzipBytes: MAX_INTERACTION_SCRIPTS_GZIP_BYTES,
			maxScriptCount: MAX_INTERACTION_SCRIPT_COUNT,
		});
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('csr preview loaded client counter click');
	},
);

type ScriptRequestLog = {
	readonly scripts: readonly string[];
};

type Requestable = {
	request(path: string): Promise<string>;
};

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

type ContentPage = {
	content(): Promise<string>;
};

async function waitForLoadAppBytes(
	page: ContentPage,
	options: { readonly timeoutMs: number },
): Promise<void> {
	const started = Date.now();
	while (Date.now() - started < options.timeoutMs) {
		const raw = /data-markless-log-app-bytes="(\d+)"/.exec(await page.content())?.[1];
		if (raw !== undefined && Number.isInteger(Number(raw)) && Number(raw) === 0) return;
		await sleep(25);
	}
	throw new Error('Expected integer load app-bytes mirror to equal 0 exactly.');
}

type RuntimeSizeBudget = {
	readonly label: string;
	readonly maxRuntimeChunkGzipBytes: number;
	readonly maxScriptsGzipBytes: number;
	readonly maxScriptCount: number;
};

async function readScriptRequests(server: Requestable): Promise<ScriptRequestLog> {
	return JSON.parse(await server.request(REQUESTS)) as ScriptRequestLog;
}

function formatRequests(log: ScriptRequestLog): string {
	return log.scripts.length === 0 ? '(none)' : log.scripts.join(', ');
}

function expectedCsrPreloadHrefs(bundleGraph: MarklessBundleGraph): readonly string[] {
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

function assertStartupPreloadsFetched(
	log: ScriptRequestLog,
	expectedHrefs: readonly string[],
): readonly string[] {
	const expectedPaths = expectedHrefs.map(
		(href) => new URL(href, 'http://fixture.local').pathname,
	);
	const expectedPathSet = new Set(expectedPaths);
	const requestPaths = new Set(log.scripts);
	for (const path of expectedPaths) {
		if (!requestPaths.has(path)) {
			throw new Error(
				`Expected CSR startup to request lazy symbol modulepreload ${path}, but saw: ${formatRequests(log)}`,
			);
		}
	}
	return [...new Set(log.scripts.filter((script) => expectedPathSet.has(script)))];
}

function assertNoScriptsLoadedAfterInteraction(
	beforeInteraction: ScriptRequestLog,
	afterInteraction: ScriptRequestLog,
): readonly string[] {
	const loadedAfterInteraction = afterInteraction.scripts.slice(beforeInteraction.scripts.length);
	if (loadedAfterInteraction.length > 0) {
		throw new Error(
			`Expected preloaded CSR interaction to avoid new JS fetches after click, but saw: ${loadedAfterInteraction.join(', ')}`,
		);
	}
	return loadedAfterInteraction;
}

function formatNetworkRequests(requests: readonly BrowserNetworkRequest[]): string {
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

function assertRuntimeSizeBudget(report: RuntimeSizeReport, budget: RuntimeSizeBudget): void {
	const largestRuntimeChunk = report.largestRuntimeChunk?.gzipBytes ?? 0;
	if (largestRuntimeChunk > budget.maxRuntimeChunkGzipBytes) {
		throw new Error(
			`${budget.label} runtime chunk gzip budget exceeded: ${largestRuntimeChunk} > ${budget.maxRuntimeChunkGzipBytes}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.gzipBytes > budget.maxScriptsGzipBytes) {
		throw new Error(
			`${budget.label} script gzip budget exceeded: ${report.asyncScripts.gzipBytes} > ${budget.maxScriptsGzipBytes}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.count > budget.maxScriptCount) {
		throw new Error(
			`${budget.label} script count budget exceeded: ${report.asyncScripts.count} > ${budget.maxScriptCount}\n${report.summary}`,
		);
	}
	const chunksWithVitePreloadHelper = report.runtimeChunks
		.filter((chunk) => chunk.hasVitePreloadHelper)
		.map((chunk) => chunk.fileName);
	if (chunksWithVitePreloadHelper.length > 0) {
		throw new Error(
			`${budget.label} runtime chunks still include the Vite preload helper: ${chunksWithVitePreloadHelper.join(', ')}\n${report.summary}`,
		);
	}
}
