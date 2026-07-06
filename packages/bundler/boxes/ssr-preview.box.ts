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
		const loadExecuted = await readExecutedModules(page);
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
		const { view, action, executed } = await readCounterExecution(page);
		const allowed = deriveAllowedModules(view, action);
		const forbidden = forbiddenExecutedModules(executed, allowed);
		if (forbidden.length > 0) {
			throw new Error(
				`Expected SSR preview counter click to execute only allowed runtime modules, but saw forbidden modules: ${forbidden.join(', ')}`,
			);
		}
		const afterInteraction = await readScriptRequests(preview);
		receipt.note(`SSR interaction script requests: ${formatRequests(afterInteraction)}`);
		receipt.note(
			`SSR post-click JS fetches: ${formatRequests({
				scripts: afterInteraction.scripts.slice(beforeInteraction.scripts.length),
			})}`,
		);
		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

		await preview.close();
		await receipt.capture('ssr preview resumed TSRX artifact counter click');
	},
);

type ScriptRequestLog = {
	readonly scripts: readonly string[];
};

type Requestable = {
	request(path: string): Promise<string>;
};

type BrowserPage = {
	evaluate<T>(callback: () => T | Promise<T>): Promise<T>;
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

async function readExecutedModules(page: BrowserPage): Promise<string[]> {
	return page.evaluate(() => {
		const runtimeGlobal = globalThis as typeof globalThis & {
			__marklessExecutedModules?: Set<string>;
		};
		return [...(runtimeGlobal.__marklessExecutedModules ?? new Set())].sort();
	});
}

async function readCounterExecution(page: BrowserPage): Promise<{
	readonly view: PayloadRecordInventory;
	readonly action: { readonly hostNodeId: string; readonly eventName: string; readonly syncPolicy?: unknown };
	readonly executed: readonly string[];
}> {
	return page.evaluate(() => {
		const root = document.querySelector<HTMLElement>('[data-async-container]');
		const counter = document.querySelector<HTMLElement>('[data-counter]');
		const script = root?.querySelector<HTMLScriptElement>('script[type="markless/view"]');
		if (!root || !counter || !script) {
			throw new Error('Expected resumed counter root, button, and view payload.');
		}
		const runtimeGlobal = globalThis as typeof globalThis & {
			__marklessExecutedModules?: Set<string>;
		};
		const view = JSON.parse(script.textContent ?? 'null') as PayloadRecordInventory;
		const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
		const index = elements.indexOf(counter);
		const hostNodeId = view.locators?.find((locator) => locator.index === index)?.hostNodeId;
		const record = view.events?.find(
			(event) => event.hostNodeId === hostNodeId && event.eventName === 'click',
		);
		if (!hostNodeId || !record) throw new Error(`Expected counter click record at DOM index ${index}.`);
		return {
			view,
			action: { hostNodeId, eventName: 'click', syncPolicy: record.syncPolicy },
			executed: [...(runtimeGlobal.__marklessExecutedModules ?? new Set())].sort(),
		};
	});
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
