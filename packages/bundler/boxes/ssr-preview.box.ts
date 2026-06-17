import { box } from '@arcade/witness';
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
const MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES = 2_175;
const MAX_INTERACTION_SCRIPTS_GZIP_BYTES = 2_650;
const MAX_INTERACTION_SCRIPT_COUNT = 3;

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
		assertHtmlHasNoExternalScripts(html);

		const page = await preview.browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		const beforeInteraction = await readScriptRequests(preview);
		receipt.note(`SSR startup script requests: ${formatRequests(beforeInteraction)}`);
		assertNoScriptsLoaded(beforeInteraction);

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`SSR interaction script requests: ${formatRequests(afterInteraction)}`);
		const interactionScripts = assertScriptsLoadedAfterInteraction(
			beforeInteraction,
			afterInteraction,
		);
		const interactionRuntimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: interactionScripts,
		});
		receipt.note(`SSR interaction runtime size:\n${interactionRuntimeSize.summary}`);
		assertRuntimeSizeBudget(interactionRuntimeSize);
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

function assertHtmlHasNoExternalScripts(html: string): void {
	if (/<script\b[^>]*\bsrc=/.test(html) || /rel="modulepreload"/.test(html)) {
		throw new Error('Expected SSR HTML to ship only the inline resumer before interaction.');
	}
}

async function readScriptRequests(server: Requestable): Promise<ScriptRequestLog> {
	return JSON.parse(await server.request(REQUESTS)) as ScriptRequestLog;
}

function formatRequests(log: ScriptRequestLog): string {
	return log.scripts.length === 0 ? '(none)' : log.scripts.join(', ');
}

function assertNoScriptsLoaded(log: ScriptRequestLog): void {
	if (log.scripts.length !== 0) {
		throw new Error(
			`Expected SSR browser startup to request no JavaScript modules, but saw: ${log.scripts.join(', ')}`,
		);
	}
}

function assertScriptsLoadedAfterInteraction(
	beforeInteraction: ScriptRequestLog,
	afterInteraction: ScriptRequestLog,
): readonly string[] {
	const loadedAfterInteraction = afterInteraction.scripts.slice(beforeInteraction.scripts.length);
	if (loadedAfterInteraction.length === 0) {
		throw new Error(
			'Expected first interaction to request the lazy SSR resume JavaScript module.',
		);
	}
	if (!loadedAfterInteraction.some((path) => path.includes('/build/chunk-'))) {
		throw new Error(
			`Expected first interaction to request built chunks, but saw: ${loadedAfterInteraction.join(', ')}`,
		);
	}
	return loadedAfterInteraction;
}

function assertRuntimeSizeBudget(report: RuntimeSizeReport): void {
	const largestRuntimeChunk = report.largestRuntimeChunk?.gzipBytes ?? 0;
	if (largestRuntimeChunk > MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES) {
		throw new Error(
			`SSR interaction runtime chunk gzip budget exceeded: ${largestRuntimeChunk} > ${MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.gzipBytes > MAX_INTERACTION_SCRIPTS_GZIP_BYTES) {
		throw new Error(
			`SSR interaction script gzip budget exceeded: ${report.asyncScripts.gzipBytes} > ${MAX_INTERACTION_SCRIPTS_GZIP_BYTES}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.count > MAX_INTERACTION_SCRIPT_COUNT) {
		throw new Error(
			`SSR interaction script count budget exceeded: ${report.asyncScripts.count} > ${MAX_INTERACTION_SCRIPT_COUNT}\n${report.summary}`,
		);
	}
	const chunksWithVitePreloadHelper = report.runtimeChunks
		.filter((chunk) => chunk.hasVitePreloadHelper)
		.map((chunk) => chunk.fileName);
	if (chunksWithVitePreloadHelper.length > 0) {
		throw new Error(
			`SSR interaction runtime chunks still include the Vite preload helper: ${chunksWithVitePreloadHelper.join(', ')}\n${report.summary}`,
		);
	}
}
