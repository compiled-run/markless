import { box } from '@async/witness';
import { runtimeSizeReport, type RuntimeSizeReport } from '../test-support/runtime-size.ts';

// Product truth: the Vite CSR fixture's production output is not only emitted
// correctly; it can be served by Vite preview and load the generated client
// payload/resolver/symbol pipeline for a counter click. This is client-created
// DOM, not a resumability proof.
const FIXTURE = 'fixtures/vite-csr';
const DIST = `${FIXTURE}/dist`;
const INDEX = `${FIXTURE}/dist/index.html`;
const COUNTER = '[data-counter]';
const REQUESTS = '/__arcade-fixture-requests';
const WAIT = { timeoutMs: 10_000 };
const MAX_STARTUP_RUNTIME_CHUNK_GZIP_BYTES = 3_000;
const MAX_STARTUP_SCRIPTS_GZIP_BYTES = 3_050;
const MAX_STARTUP_SCRIPT_COUNT = 2;
const MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES = 0;
const MAX_INTERACTION_SCRIPTS_GZIP_BYTES = 550;
const MAX_INTERACTION_SCRIPT_COUNT = 1;

export default box(
	{
		name: 'csr preview: built app loads through vite preview',
		tags: ['csr', 'preview'],
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

		await expect.build.environment(build, 'client');
		await expect.build.artifact(build, INDEX);

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const page = await preview.browser.visit('/');

		await expect.page.exists(page, '#app', WAIT);
		await expect.page.text(page, '#hmr-status', 'ready', WAIT);
		await expect.page.text(page, COUNTER, '0', WAIT);
		const beforeInteraction = await readScriptRequests(preview);
		receipt.note(`CSR startup script requests: ${formatRequests(beforeInteraction)}`);
		const startupRuntimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: beforeInteraction.scripts,
		});
		receipt.note(`CSR startup runtime size:\n${startupRuntimeSize.summary}`);
		assertRuntimeSizeBudget(startupRuntimeSize, {
			label: 'CSR startup',
			maxRuntimeChunkGzipBytes: MAX_STARTUP_RUNTIME_CHUNK_GZIP_BYTES,
			maxScriptsGzipBytes: MAX_STARTUP_SCRIPTS_GZIP_BYTES,
			maxScriptCount: MAX_STARTUP_SCRIPT_COUNT,
		});

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`CSR interaction script requests: ${formatRequests(afterInteraction)}`);
		const interactionScripts = assertScriptsLoadedAfterInteraction(
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

function assertScriptsLoadedAfterInteraction(
	beforeInteraction: ScriptRequestLog,
	afterInteraction: ScriptRequestLog,
): readonly string[] {
	const loadedAfterInteraction = afterInteraction.scripts.slice(beforeInteraction.scripts.length);
	if (loadedAfterInteraction.length === 0) {
		throw new Error('Expected CSR counter click to request the lazy symbol chunk.');
	}
	if (!loadedAfterInteraction.some((path) => path.includes('/build/chunk-'))) {
		throw new Error(
			`Expected CSR counter click to request built chunks, but saw: ${loadedAfterInteraction.join(', ')}`,
		);
	}
	return loadedAfterInteraction;
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
