import { gzipSync } from 'node:zlib';
import { box } from '@async/witness';
import { runtimeSizeReport, type RuntimeSizeReport } from '../test-support/runtime-size.ts';

const FIXTURE = 'fixtures/vite-ssr-shared';
const DIST = `${FIXTURE}/dist`;
const INDEX = `${FIXTURE}/dist/index.html`;
const ACTION = '[data-async-container="shared-header"] [data-shared-action]';
const HEADER_PANEL = '[data-async-container="shared-header"] [data-shared-panel]';
const SIDEBAR_PANEL = '[data-async-container="shared-sidebar"] [data-shared-panel]';
const REQUESTS = '/__arcade-fixture-requests';
const WAIT = { timeoutMs: 10_000 };
const MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES = 4_000;
const MAX_INTERACTION_NETWORK_BYTES = 14_000;
const MAX_INTERACTION_SCRIPT_COUNT = 3;

export default box(
	{
		name: 'ssr shared network size: first interaction does not load the full resume runtime',
		tags: ['ssr', 'shared', 'preview', 'browser', 'size'],
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
		await expect.html.contains(html, 'data-async-container="shared-header"');
		await expect.html.contains(html, 'data-async-container="shared-sidebar"');
		assertHtmlHasNoExternalScripts(html);

		const page = await preview.browser.visit('/');

		await expect.page.text(page, HEADER_PANEL, 'server-cart / server-ready', WAIT);
		await expect.page.text(page, SIDEBAR_PANEL, 'server-cart / server-ready', WAIT);
		const beforeInteraction = await readScriptRequests(preview);
		receipt.note(`SSR shared startup script requests: ${formatRequests(beforeInteraction)}`);
		assertNoScriptsLoaded(beforeInteraction);

		await page.click(ACTION, WAIT);
		await expect.page.text(page, HEADER_PANEL, 'client-cart / client-ready', WAIT);
		await expect.page.text(page, SIDEBAR_PANEL, 'client-cart / client-ready', WAIT);
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`SSR shared interaction script requests: ${formatRequests(afterInteraction)}`);
		const interactionScripts = assertScriptsLoadedAfterInteraction(
			beforeInteraction,
			afterInteraction,
		);
		const networkSizes = await scriptNetworkSizes(preview, interactionScripts);
		receipt.note(`SSR shared interaction network size:\n${formatNetworkSizes(networkSizes)}`);
		assertNetworkSizeBudget(networkSizes);

		const runtimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: interactionScripts,
			targetLabel:
				'spec target: shared SSR interaction must not load the generic resume runtime',
		});
		receipt.note(`SSR shared interaction runtime size:\n${runtimeSize.summary}`);
		assertRuntimeSizeBudget(runtimeSize);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr shared interaction network size stayed within runtime budget');
	},
);

type ScriptRequestLog = {
	readonly scripts: readonly string[];
};

type Requestable = {
	request(path: string): Promise<string>;
};

type ScriptNetworkSize = {
	readonly path: string;
	readonly rawBytes: number;
	readonly gzipBytes: number;
};

function assertHtmlHasNoExternalScripts(html: string): void {
	if (html.includes('<script async type="module"') || html.includes('rel="modulepreload"')) {
		throw new Error(
			'Expected shared SSR HTML to ship only the inline resumer before interaction.',
		);
	}
}

async function readScriptRequests(server: Requestable): Promise<ScriptRequestLog> {
	return JSON.parse(await server.request(REQUESTS)) as ScriptRequestLog;
}

function formatRequests(log: ScriptRequestLog): string {
	return log.scripts.length === 0 ? '(none)' : log.scripts.join(', ');
}

function assertNoScriptsLoaded(log: ScriptRequestLog): void {
	if (log.scripts.length === 0) return;

	throw new Error(
		`Expected shared SSR startup to request no JavaScript modules, but saw: ${log.scripts.join(', ')}`,
	);
}

function assertScriptsLoadedAfterInteraction(
	beforeInteraction: ScriptRequestLog,
	afterInteraction: ScriptRequestLog,
): readonly string[] {
	const loadedAfterInteraction = afterInteraction.scripts.slice(beforeInteraction.scripts.length);
	if (loadedAfterInteraction.length === 0) {
		throw new Error(
			'Expected shared SSR first interaction to request the lazy resume JavaScript module.',
		);
	}
	if (!loadedAfterInteraction.some((path) => path.includes('/build/chunk-'))) {
		throw new Error(
			`Expected shared SSR first interaction to request built chunks, but saw: ${loadedAfterInteraction.join(', ')}`,
		);
	}
	return loadedAfterInteraction;
}

async function scriptNetworkSizes(
	server: Requestable,
	scripts: readonly string[],
): Promise<ScriptNetworkSize[]> {
	return Promise.all(
		scripts.map(async (path) => {
			const source = await server.request(path);
			const bytes = new TextEncoder().encode(source);
			return {
				path,
				rawBytes: bytes.length,
				gzipBytes: gzipSync(bytes, { level: 9 }).length,
			};
		}),
	);
}

function formatNetworkSizes(sizes: readonly ScriptNetworkSize[]): string {
	return sizes
		.map((size) => `${size.path} raw=${size.rawBytes} gzip=${size.gzipBytes}`)
		.join('\n');
}

function assertNetworkSizeBudget(sizes: readonly ScriptNetworkSize[]): void {
	const rawBytes = sizes.reduce((total, size) => total + size.rawBytes, 0);
	if (rawBytes <= MAX_INTERACTION_NETWORK_BYTES) return;

	throw new Error(
		`SSR shared interaction network byte budget exceeded: ${rawBytes} > ${MAX_INTERACTION_NETWORK_BYTES}\n${formatNetworkSizes(sizes)}`,
	);
}

function assertRuntimeSizeBudget(report: RuntimeSizeReport): void {
	const largestRuntimeChunk = report.largestRuntimeChunk?.gzipBytes ?? 0;
	if (largestRuntimeChunk > MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES) {
		throw new Error(
			`SSR shared interaction runtime chunk gzip budget exceeded: ${largestRuntimeChunk} > ${MAX_INTERACTION_RUNTIME_CHUNK_GZIP_BYTES}\n${report.summary}`,
		);
	}
	if (report.asyncScripts.count > MAX_INTERACTION_SCRIPT_COUNT) {
		throw new Error(
			`SSR shared interaction script count budget exceeded: ${report.asyncScripts.count} > ${MAX_INTERACTION_SCRIPT_COUNT}\n${report.summary}`,
		);
	}
}
