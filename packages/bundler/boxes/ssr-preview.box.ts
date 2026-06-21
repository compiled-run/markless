import { box } from '@async/witness';
import { runtimeSizeReport, type RuntimeSizeReport } from '../test-support/runtime-size.ts';

// Product truth: SSR resumability needs server-produced HTML. This box uses the
// fixture's real Vite app build, then serves it through Vite preview. Preview
// must run the built server entry for HTML requests; the box must not rewrite
// built HTML to make the assertion pass.
const FIXTURE = 'fixtures/vite-ssr';
const DIST = `${FIXTURE}/dist`;
const INDEX = `${FIXTURE}/dist/index.html`;
const COUNTER = '[data-counter]';
const REQUESTS = '/__arcade-fixture-requests';
const WAIT = { timeoutMs: 10_000 };
const MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES = 2_175;
const MAX_PRELOADED_SCRIPTS_GZIP_BYTES = 4_100;
const MAX_PRELOADED_SCRIPT_COUNT = 6;

export default box(
	{
		name: 'ssr preview: built server entry shell resumes counter click',
		tags: ['ssr', 'build', 'preview', 'browser'],
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

		await expect.build.environment(build, 'client');
		await expect.build.environment(build, 'ssr');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const html = await preview.request('/');
		await expect.html.contains(html, 'data-counter');
		await expect.html.contains(html, 'type="arcade/state"');
		await expect.html.contains(html, 'type="arcade/view"');
		await expect.html.contains(html, 'data-async-resumer');
		assertHtmlHasPreloadsWithoutExternalScripts(html);
		const preloadHrefs = modulePreloadHrefs(html);
		receipt.note(`SSR preview modulepreload hrefs: ${preloadHrefs.join(', ')}`);

		const page = await preview.browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		const beforeInteraction = await readScriptRequests(preview);
		receipt.note(`SSR startup script requests: ${formatRequests(beforeInteraction)}`);
		const preloadedScripts = assertStartupPreloadsFetched(beforeInteraction, preloadHrefs);
		const preloadedRuntimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: preloadedScripts,
		});
		receipt.note(`SSR preloaded runtime size:\n${preloadedRuntimeSize.summary}`);
		assertRuntimeSizeBudget(preloadedRuntimeSize);

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`SSR interaction script requests: ${formatRequests(afterInteraction)}`);
		assertNoScriptsLoadedAfterInteraction(beforeInteraction, afterInteraction);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr preview resumed server entry shell counter click');
	},
);

type ScriptRequestLog = {
	readonly scripts: readonly string[];
};

type Requestable = {
	request(path: string): Promise<string>;
};

function assertHtmlHasPreloadsWithoutExternalScripts(html: string): void {
	if (/<script\b[^>]*\bsrc=/.test(html)) {
		throw new Error('Expected SSR HTML to keep startup JavaScript script-free.');
	}
	if (!/rel="modulepreload"/.test(html)) {
		throw new Error('Expected SSR HTML to ship modulepreload hints for resumable chunks.');
	}
}

function modulePreloadHrefs(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)].map(
		(match) => match[1],
	);
}

async function readScriptRequests(server: Requestable): Promise<ScriptRequestLog> {
	return JSON.parse(await server.request(REQUESTS)) as ScriptRequestLog;
}

function formatRequests(log: ScriptRequestLog): string {
	return log.scripts.length === 0 ? '(none)' : log.scripts.join(', ');
}

function assertStartupPreloadsFetched(
	log: ScriptRequestLog,
	expectedHrefs: readonly string[],
): readonly string[] {
	if (expectedHrefs.length === 0) {
		throw new Error('Expected SSR preview HTML to render modulepreload hrefs.');
	}
	if (log.scripts.length === 0) {
		throw new Error('Expected SSR browser startup to request rendered modulepreload chunks.');
	}
	const expectedPaths = expectedHrefs.map(
		(href) => new URL(href, 'http://fixture.local').pathname,
	);
	const expectedPathSet = new Set(expectedPaths);
	const requestPaths = new Set(log.scripts);
	for (const path of expectedPaths) {
		if (!requestPaths.has(path)) {
			throw new Error(
				`Expected SSR browser startup to request modulepreload ${path}, but saw: ${formatRequests(log)}`,
			);
		}
	}
	return [...new Set(log.scripts.filter((script) => expectedPathSet.has(script)))];
}

function assertNoScriptsLoadedAfterInteraction(
	beforeInteraction: ScriptRequestLog,
	afterInteraction: ScriptRequestLog,
): void {
	const loadedAfterInteraction = afterInteraction.scripts.slice(beforeInteraction.scripts.length);
	if (loadedAfterInteraction.length > 0) {
		throw new Error(
			`Expected preloaded SSR interaction to avoid new JS fetches after click, but saw: ${loadedAfterInteraction.join(', ')}`,
		);
	}
}

function assertRuntimeSizeBudget(report: RuntimeSizeReport): void {
	const largestRuntimeChunk = report.largestRuntimeChunk?.gzipBytes ?? 0;
	if (largestRuntimeChunk > MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES) {
		throw new Error(
			`SSR preloaded runtime chunk gzip budget exceeded: ${largestRuntimeChunk} > ${MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.gzipBytes > MAX_PRELOADED_SCRIPTS_GZIP_BYTES) {
		throw new Error(
			`SSR preloaded script gzip budget exceeded: ${report.asyncScripts.gzipBytes} > ${MAX_PRELOADED_SCRIPTS_GZIP_BYTES}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.count > MAX_PRELOADED_SCRIPT_COUNT) {
		throw new Error(
			`SSR preloaded script count budget exceeded: ${report.asyncScripts.count} > ${MAX_PRELOADED_SCRIPT_COUNT}\n${report.summary}`,
		);
	}
	const chunksWithVitePreloadHelper = report.runtimeChunks
		.filter((chunk) => chunk.hasVitePreloadHelper)
		.map((chunk) => chunk.fileName);
	if (chunksWithVitePreloadHelper.length > 0) {
		throw new Error(
			`SSR preloaded runtime chunks still include the Vite preload helper: ${chunksWithVitePreloadHelper.join(', ')}\n${report.summary}`,
		);
	}
}
