import { gzipSync } from 'node:zlib';
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
const PREVIOUS_COUNTER_CLICK_EXECUTED_GZIP_BYTES = 4_300;
const MAX_COUNTER_CLICK_EXECUTED_GZIP_BYTES = 4_150; // measured SHIPPED 4,092 incl. shared-closure accounting (2026-07-06); tighten-only — next cuts: scalar-core-plan 1,785gz + payload-records 1,112gz
const MAX_FIRST_INTERACTION_TOTAL_GZIP_BYTES = 40_900; // shipped-byte pin; test instrumentation is measured separately and must not set this cap.

export default box(
	{
		name: 'ssr preview: built TSRX artifact resumes counter click',
		tags: ['ssr', 'build', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const instrumentedBuild = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
				plugins: [...(config.plugins ?? []), executedModulesPlugin()],
			}),
		});

		await expect.build.environment(instrumentedBuild, 'client');
		await expect.build.environment(instrumentedBuild, 'ssr');
		await expect.build.artifact(instrumentedBuild, INDEX);

		const instrumentedPreview = await pipeline.preview(instrumentedBuild, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const html = await instrumentedPreview.request('/');
		await expect.html.contains(html, 'data-counter');
		await expect.html.contains(html, 'type="markless/state"');
		await expect.html.contains(html, 'type="markless/view"');
		await expect.html.contains(html, 'data-async-resumer');
		assertHtmlHasPreloadsWithoutExternalScripts(html);
		const preloadHrefs = modulePreloadHrefs(html);
		receipt.note(`SSR instrumented preview modulepreload hrefs: ${preloadHrefs.join(', ')}`);

		const page = await instrumentedPreview.browser.visit('/');

		await expect.page.text(page, COUNTER, '0', WAIT);
		const loadExecuted = executedFromHtml(await page.content());
		if (loadExecuted.length > 0) {
			throw new Error(
				`Expected SSR preview load to execute zero runtime modules, but saw: ${loadExecuted.join(', ')}`,
			);
		}
		const instrumentedBeforeInteraction = await readScriptRequests(instrumentedPreview);
		receipt.note(`SSR instrumented startup script requests: ${formatRequests(instrumentedBeforeInteraction)}`);
		assertStartupPreloadsFetched(instrumentedBeforeInteraction, preloadHrefs);

		await page.click(COUNTER, WAIT);
		await expect.page.text(page, COUNTER, '1', WAIT);
		const clickedHtml = await page.content();
		const executed = executedFromHtml(clickedHtml);
		const view = viewPayloadFromHtml(clickedHtml);
		const action = counterClickAction(view);
		// The demand map ships as a build asset (payload-module exports are
		// tree-shaken from built pages by design).
		const demandByModule = JSON.parse(
			await instrumentedPreview.request('/build/execution-demand.json'),
		) as Record<string, unknown>;
		const runtimeDemandMap = Object.values(demandByModule)[0];
		const allowed = deriveAllowedModules(
			view,
			runtimeDemandMap as Parameters<typeof deriveAllowedModules>[1],
			{ ...action, executionLog: true },
		);
		const forbidden = forbiddenExecutedModules(executed, allowed);
		if (forbidden.length > 0) {
			throw new Error(
				`Expected SSR preview counter click to execute only allowed runtime modules, but saw forbidden modules: ${forbidden.join(', ')}`,
			);
		}
		for (const expected of ['web/fns/write-scalar', 'web/fns/update-text']) {
			if (!executed.includes(expected)) throw new Error(`Expected ${expected}. Saw: ${executed.join(', ')}`);
		}
		for (const excluded of ['web/dom-journal', 'web/event-only-graph', 'web/event-only-resume', 'web/event-only-lean/row', 'web/event-only-lean/scalar-resume', 'web/payload', 'web/payload-document']) {
			if (executed.includes(excluded)) throw new Error(`Unexpected ${excluded}. Saw: ${executed.join(', ')}`);
		}
		const instrumentedAfterInteraction = await readScriptRequests(instrumentedPreview);
		receipt.note(`SSR instrumented interaction script requests: ${formatRequests(instrumentedAfterInteraction)}`);
		receipt.note(
			`SSR instrumented post-click JS fetches: ${formatRequests({
				scripts: instrumentedAfterInteraction.scripts.slice(instrumentedBeforeInteraction.scripts.length),
			})}`,
		);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await instrumentedPreview.close();

		const shippedBuild = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'ssr',
			}),
		});
		await expect.build.environment(shippedBuild, 'client');
		await expect.build.environment(shippedBuild, 'ssr');
		await expect.build.artifact(shippedBuild, INDEX);
		const shippedPreview = await pipeline.preview(shippedBuild, {
			config: (config) => ({
				...config,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		const shippedHtml = await shippedPreview.request('/');
		assertHtmlHasPreloadsWithoutExternalScripts(shippedHtml);
		assertNoExecutionMirror(shippedHtml);
		const shippedPreloadHrefs = modulePreloadHrefs(shippedHtml);
		receipt.note(`SSR shipped modulepreload hrefs: ${shippedPreloadHrefs.join(', ')}`);
		const shippedPage = await shippedPreview.browser.visit('/');
		await expect.page.text(shippedPage, COUNTER, '0', WAIT);
		assertNoExecutionMirror(await shippedPage.content());
		const shippedBeforeInteraction = await readScriptRequests(shippedPreview);
		receipt.note(`SSR shipped startup script requests: ${formatRequests(shippedBeforeInteraction)}`);
		const shippedPreloadedScripts = assertStartupPreloadsFetched(shippedBeforeInteraction, shippedPreloadHrefs);
		const shippedPreloadedRuntimeSize = await runtimeSizeReport({
			dist: DIST,
			scripts: shippedPreloadedScripts,
		});
		receipt.note(`SSR shipped preloaded runtime size:\n${shippedPreloadedRuntimeSize.summary}`);
		assertRuntimeSizeBudget(shippedPreloadedRuntimeSize);

		await shippedPage.click(COUNTER, WAIT);
		await expect.page.text(shippedPage, COUNTER, '1', WAIT);
		assertNoExecutionMirror(await shippedPage.content());
		const executionSizes = JSON.parse(await shippedPreview.request('/build/execution-sizes.json')) as ExecutionSizeMap;
		const counterClickGzip = await executedGzipReportWithClosure(executed, executionSizes, (path) =>
			shippedPreview.request(path),
		);
		receipt.note(`SSR shipped counter click executed gzip: before=${PREVIOUS_COUNTER_CLICK_EXECUTED_GZIP_BYTES} after=${counterClickGzip.gzipBytes} budget=${MAX_COUNTER_CLICK_EXECUTED_GZIP_BYTES}\n${counterClickGzip.summary}`);
		if (counterClickGzip.missing.length > 0 || counterClickGzip.gzipBytes > MAX_COUNTER_CLICK_EXECUTED_GZIP_BYTES) {
			throw new Error(`SSR counter click executed gzip budget failed. total=${counterClickGzip.gzipBytes} missing=[${counterClickGzip.missing.join(', ')}]\n${counterClickGzip.summary}`);
		}
		const shippedAfterInteraction = await readScriptRequests(shippedPreview);
		receipt.note(`SSR shipped interaction script requests: ${formatRequests(shippedAfterInteraction)}`);
		receipt.note(
			`SSR shipped post-click JS fetches: ${formatRequests({
				scripts: shippedAfterInteraction.scripts.slice(shippedBeforeInteraction.scripts.length),
			})}`,
		);
		const firstInteractionSize = await runtimeSizeReport({
			dist: DIST,
			scripts: [...new Set(shippedAfterInteraction.scripts)],
		});
		receipt.note(`SSR shipped first-interaction total size:\n${firstInteractionSize.summary}`);
		if (firstInteractionSize.asyncScripts.gzipBytes > MAX_FIRST_INTERACTION_TOTAL_GZIP_BYTES) {
			throw new Error(
				`SSR first-interaction total gzip budget exceeded: ${firstInteractionSize.asyncScripts.gzipBytes} > ${MAX_FIRST_INTERACTION_TOTAL_GZIP_BYTES}\n${firstInteractionSize.summary}`,
			);
		}
		await expect.page.outcome(shippedPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await shippedPreview.close();
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

function assertNoExecutionMirror(html: string): void {
	if (html.includes('data-markless-executed')) throw new Error('Expected shipped SSR output to omit the test execution DOM mirror.');
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

async function executedGzipReportWithClosure(
	executed: readonly string[],
	sizes: ExecutionSizeMap,
	request: (path: string) => Promise<string>,
): Promise<ReturnType<typeof executedGzipReport>> {
	const base = executedGzipReport(executed, sizes);
	// Anonymous shared chunks execute too but carry no stable markless id, so their
	// instrumented-build names cannot map across builds. Charge them honestly by
	// expanding the SHIPPED static import closure of the counted chunks.
	const seen = new Set(base.summary.split('\n').map((row) => row.split(' ')[1]).filter(Boolean));
	const queue = [...seen];
	let closureGzip = 0;
	const closureRows: string[] = [];
	while (queue.length > 0) {
		const chunk = queue.pop()!;
		let code = '';
		try { code = await request(`/build/${chunk}`); } catch { continue; }
		for (const match of code.matchAll(/from\s*["'`]\.\/([^"'`]+)["'`]/g)) {
			const dep = match[1];
			if (seen.has(dep)) continue;
			seen.add(dep);
			queue.push(dep);
			try {
				const depCode = await request(`/build/${dep}`);
				const gz = gzipSync(Buffer.from(depCode)).length;
				closureGzip += gz;
				closureRows.push(`(shared) ${dep} gzip=${gz}`);
			} catch { /* asset not servable; skip */ }
		}
	}
	return {
		gzipBytes: base.gzipBytes + closureGzip,
		missing: base.missing.filter((id) => !id.startsWith('./chunk-')),
		summary: [base.summary, ...closureRows].join('\n'),
	};
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
		id.startsWith('virtual:markless:payload:') ||
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
