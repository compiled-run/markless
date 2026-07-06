import { box } from '@async/witness';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
	type PayloadRecordInventory,
} from '../test-support/execution-expectations.ts';
import { executedModulesPlugin } from '../test-support/executed-modules-plugin.ts';
import { runtimeSizeReport, type RuntimeSizeReport } from '../test-support/runtime-size.ts';

// Product truth: SSR resumability needs server-produced HTML. This box uses the
// fixture's real Vite app build, then serves it through Vite preview. Preview
// must render the built TSRX artifact for HTML requests; the box must not
// rewrite built HTML to make the assertion pass.
const FIXTURE = 'fixtures/vite-ssr';
const DIST = `${FIXTURE}/dist`;
const INDEX = `${FIXTURE}/dist/index.html`;
const COUNTER = '[data-counter]';
const REQUESTS = '/__markless-fixture-requests';
const WAIT = { timeoutMs: 10_000 };
const MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES = 2_175;
const PREVIOUS_COUNTER_CLICK_EXECUTED_GZIP_BYTES = 6_600;
const MAX_COUNTER_CLICK_EXECUTED_GZIP_BYTES = 6_199; // measured 5,904 on 2026-07-06; tighten-only.
const MAX_FIRST_INTERACTION_TOTAL_GZIP_BYTES = 40_260; // measured 38,345 on 2026-07-06; tighten-only.

export default box(
	{
		name: 'ssr preview: built TSRX artifact resumes counter click',
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
				plugins: [...(config.plugins ?? []), executedModulesPlugin()],
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
		await expect.html.contains(html, 'type="markless/state"');
		await expect.html.contains(html, 'type="markless/view"');
		await expect.html.contains(html, 'data-async-resumer');
		assertHtmlHasPreloadsWithoutExternalScripts(html);
		const preloadHrefs = modulePreloadHrefs(html);
		receipt.note(`SSR preview modulepreload hrefs: ${preloadHrefs.join(', ')}`);

		const page = await preview.browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		const loadExecuted = executedFromHtml(await page.content());
		if (loadExecuted.length > 0) {
			throw new Error(
				`Expected SSR preview load to execute zero runtime modules, but saw: ${loadExecuted.join(', ')}`,
			);
		}
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
		const clickedHtml = await page.content();
		const executed = executedFromHtml(clickedHtml);
		const view = viewPayloadFromHtml(clickedHtml);
		const action = counterClickAction(view);
		const allowed = deriveAllowedModules(view, action);
		const forbidden = forbiddenExecutedModules(executed, allowed);
		if (forbidden.length > 0) {
			throw new Error(
				`Expected SSR preview counter click to execute only allowed runtime modules, but saw forbidden modules: ${forbidden.join(', ')}`,
			);
		}
		for (const expected of ['web/fns/write-scalar', 'web/fns/update-text']) {
			if (!executed.includes(expected)) throw new Error(`Expected ${expected}. Saw: ${executed.join(', ')}`);
		}
		for (const excluded of ['web/dom-journal', 'web/payload', 'web/payload-document']) {
			if (executed.includes(excluded)) throw new Error(`Unexpected ${excluded}. Saw: ${executed.join(', ')}`);
		}
		const executionSizes = JSON.parse(await preview.request('/build/execution-sizes.json')) as ExecutionSizeMap;
		const counterClickGzip = executedGzipReport(executed, executionSizes);
		receipt.note(`SSR counter click executed gzip: before=${PREVIOUS_COUNTER_CLICK_EXECUTED_GZIP_BYTES} after=${counterClickGzip.gzipBytes} budget=${MAX_COUNTER_CLICK_EXECUTED_GZIP_BYTES}\n${counterClickGzip.summary}`);
		if (counterClickGzip.missing.length > 0 || counterClickGzip.gzipBytes > MAX_COUNTER_CLICK_EXECUTED_GZIP_BYTES) {
			throw new Error(`SSR counter click executed gzip budget failed.\n${counterClickGzip.summary}`);
		}
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`SSR interaction script requests: ${formatRequests(afterInteraction)}`);
		receipt.note(
			`SSR post-click JS fetches: ${formatRequests({
				scripts: afterInteraction.scripts.slice(beforeInteraction.scripts.length),
			})}`,
		);
		const firstInteractionSize = await runtimeSizeReport({
			dist: DIST,
			scripts: [...new Set(afterInteraction.scripts)],
		});
		receipt.note(`SSR first-interaction total size:\n${firstInteractionSize.summary}`);
		if (firstInteractionSize.asyncScripts.gzipBytes > MAX_FIRST_INTERACTION_TOTAL_GZIP_BYTES) {
			throw new Error(
				`SSR first-interaction total gzip budget exceeded: ${firstInteractionSize.asyncScripts.gzipBytes} > ${MAX_FIRST_INTERACTION_TOTAL_GZIP_BYTES}\n${firstInteractionSize.summary}`,
			);
		}
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr preview resumed TSRX artifact counter click');
	},
);

type ScriptRequestLog = {
	readonly scripts: readonly string[];
};

type ExecutionSizeMap = Record<string, { readonly gzip: number; readonly chunk: string }>;

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







function assertRuntimeSizeBudget(report: RuntimeSizeReport): void {
	const largestRuntimeChunk = report.largestRuntimeChunk?.gzipBytes ?? 0;
	if (largestRuntimeChunk > MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES) {
		throw new Error(
			`SSR preloaded runtime chunk gzip budget exceeded: ${largestRuntimeChunk} > ${MAX_PRELOADED_RUNTIME_CHUNK_GZIP_BYTES}\n${report.summary}`,
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

function executedGzipReport(executed: readonly string[], sizes: ExecutionSizeMap): {
	readonly gzipBytes: number;
	readonly missing: readonly string[];
	readonly summary: string;
} {
	const counted = new Map<string, { readonly id: string; readonly entry: ExecutionSizeMap[string] }>();
	const missing: string[] = [];
	for (const id of executed) {
		if (isMeasurementOnlyExecution(id)) continue;
		const entry = executionSizeFor(id, sizes);
		if (!entry) {
			missing.push(id);
			continue;
		}
		counted.set(entry.chunk, { id, entry });
	}
	const rows = [...counted.values()].sort((a, b) => a.entry.chunk.localeCompare(b.entry.chunk));
	return {
		gzipBytes: rows.reduce((total, row) => total + row.entry.gzip, 0),
		missing,
		summary: rows.map((row) => `${row.id} ${row.entry.chunk} gzip=${row.entry.gzip}`).join('\n'),
	};
}

function executionSizeFor(id: string, sizes: ExecutionSizeMap): ExecutionSizeMap[string] | undefined {
	const normalizedIds = [
		id,
		id.replace(/^(runtime|serializer|web)\//, '$1:'),
		id.replace(/^core\/web\//, 'web:'),
	];
	for (const normalized of normalizedIds) {
		const entry = sizes[normalized];
		if (entry) return entry;
	}

	const chunk = id.replace(/^\.\//, '').replace(/^\/?build\//, '');
	const entries = Object.entries(sizes).filter(([, entry]) => entry.chunk === chunk);
	return entries.find(([key]) => key.startsWith('symbol:'))?.[1] ?? entries[0]?.[1];
}

function isMeasurementOnlyExecution(id: string): boolean {
	return (
		id === 'virtual:markless:dev-log' ||
		id === 'web/dev-log' ||
		id === 'web/execution-log-target' ||
		id.startsWith('virtual:markless:resume:')
	);
}

function executedFromHtml(html: string): string[] {
	const match = html.match(/data-markless-executed="([^"]*)"/);
	return match && match[1] ? match[1].split(' ').filter(Boolean).sort() : [];
}

function viewPayloadFromHtml(html: string): PayloadRecordInventory {
	const match = html.match(/<script type="markless\/view"[^>]*>([\s\S]*?)<\/script>/);
	if (!match) throw new Error('Expected markless/view payload in resumed page HTML.');
	return JSON.parse(match[1]) as PayloadRecordInventory;
}

function counterClickAction(view: PayloadRecordInventory): {
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly syncPolicy?: unknown;
	readonly executionLog?: boolean;
} {
	const clicks = (view.events ?? []).filter((event) => event.eventName === 'click');
	if (clicks.length !== 1) {
		throw new Error(`Expected exactly one click event record in the preview fixture, saw ${clicks.length}.`);
	}
	return { hostNodeId: clicks[0].hostNodeId, eventName: 'click', syncPolicy: clicks[0].syncPolicy, executionLog: true };
}
