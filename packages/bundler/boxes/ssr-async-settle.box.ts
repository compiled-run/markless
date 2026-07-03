import { box } from '@async/witness';

// Product truth: an SSR-rendered async @try boundary must serve the RESOLVED
// arm — v1 initial render awaits demanded async work (spec 03-state-graph:181)
// — so the HTML between the async boundary comment anchors carries the settled
// content and the payload carries a fulfilled snapshot. The browser resumes
// that arm without executing app code before interaction, and a click that
// writes the async computed's dependency revalidates the boundary in place.
const FIXTURE = 'fixtures/vite-ssr-async';
const INDEX = `${FIXTURE}/dist/index.html`;
const REVALIDATE = '[data-revalidate]';
const DONE_ARM = 'section > p.done';
const BOUNDARY_START = '<!--markless:async:boundary:0-->';
const BOUNDARY_END = '<!--/markless:async:boundary:0-->';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'ssr async settle: built @try boundary serves resolved arm and revalidates on click',
		tags: ['ssr', 'build', 'preview', 'browser', 'async'],
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

		// Server truth: initial render awaited the async computed, so the HTML
		// between the async boundary anchors is the RESOLVED @try arm — never the
		// @pending arm — plus the resumable payload scripts.
		const html = await preview.request('/');
		await expect.html.contains(html, 'type="markless/state"');
		await expect.html.contains(html, 'type="markless/view"');
		await expect.html.contains(html, 'data-async-resumer');
		assertResolvedArmBetweenAnchors(html, 'Hello Ada', 'SSR HTML');
		if (html.includes('Loading')) {
			throw new Error(
				'Expected SSR HTML to serve the resolved @try arm, but found the @pending arm text "Loading".',
			);
		}
		assertStateScriptCarriesFulfilledSnapshot(html);
		const preloadPaths = modulePreloadPaths(html);
		receipt.note(`SSR async modulepreload hrefs: ${formatPaths(preloadPaths)}`);

		const page = await preview.browser.visit('/');

		// Resume truth: the resolved arm comes from the payload snapshot, not a
		// re-run of the async computed. Startup fetches stay inside the rendered
		// modulepreload set; no app-code symbol loads before interaction.
		await expect.page.text(page, DONE_ARM, 'Hello Ada', WAIT);
		await expect.page.bodyText(page, { notContains: 'Loading' }, WAIT);
		assertResolvedArmBetweenAnchors(await page.content(), 'Hello Ada', 'resumed DOM');
		const startupScripts = await jsBuildRequestPaths(page);
		receipt.note(`SSR async startup JS: ${formatPaths(startupScripts)}`);
		assertStartupStaysInsidePreloads(startupScripts, preloadPaths);

		// Revalidation truth: the click writes `query`, invalidating the async
		// computed; the boundary revalidates and settles on the new value. Any
		// handler/async-run symbol may load lazily only after this interaction.
		await page.click(REVALIDATE, WAIT);
		await expect.page.text(page, DONE_ARM, 'Hello Grace', WAIT);
		assertResolvedArmBetweenAnchors(await page.content(), 'Hello Grace', 'revalidated DOM');
		const afterClickScripts = await jsBuildRequestPaths(page);
		const lazyChunks = afterClickScripts.filter((path) => !startupScripts.includes(path));
		receipt.note(`SSR async post-click lazy JS: ${formatPaths(lazyChunks)}`);

		await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		await preview.close();
		await receipt.capture('ssr async boundary served resolved arm and revalidated on click');
	},
);

function assertResolvedArmBetweenAnchors(html: string, text: string, label: string): void {
	const start = html.indexOf(BOUNDARY_START);
	const end = html.indexOf(BOUNDARY_END);
	if (start === -1 || end === -1 || end < start) {
		throw new Error(
			`Expected ${label} to keep both async boundary comment anchors: ${BOUNDARY_START} … ${BOUNDARY_END}`,
		);
	}
	const range = html.slice(start + BOUNDARY_START.length, end);
	if (!range.includes('class="done"') || !range.includes(text)) {
		throw new Error(
			`Expected ${label} async boundary range to contain the resolved arm <p class="done">${text}</p>, got: ${range.trim()}`,
		);
	}
	if (range.includes('class="pending"') || range.includes('class="broken"')) {
		throw new Error(
			`Expected ${label} async boundary range to carry only the resolved arm, got: ${range.trim()}`,
		);
	}
}

// The payload must record the async computed as settled server-side; a missing
// or pending snapshot would force the browser to re-run app code on resume.
function assertStateScriptCarriesFulfilledSnapshot(html: string): void {
	const match = html.match(/<script type="markless\/state"[^>]*>([\s\S]*?)<\/script>/);
	if (!match) {
		throw new Error('Expected SSR HTML to include a markless/state payload script.');
	}
	const state = match[1];
	if (!state.includes('fulfilled')) {
		throw new Error(
			`Expected the markless/state payload to carry a fulfilled async snapshot, got: ${state.trim()}`,
		);
	}
	if (!state.includes('Hello Ada')) {
		throw new Error(
			`Expected the fulfilled snapshot value to include "Hello Ada", got: ${state.trim()}`,
		);
	}
}

function modulePreloadPaths(html: string): readonly string[] {
	return [...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")[^>]*\bhref="([^"]+)"/g)].map(
		(match) => new URL(match[1], 'http://fixture.local').pathname,
	);
}

type NetworkRequestPage = {
	networkRequests(): Promise<ReadonlyArray<{ readonly url: string; readonly method: string }>>;
};

async function jsBuildRequestPaths(page: NetworkRequestPage): Promise<readonly string[]> {
	const requests = await page.networkRequests();
	return requests
		.filter((request) => request.method === 'GET')
		.map((request) => new URL(request.url).pathname)
		.filter((pathname) => pathname.startsWith('/build/') && pathname.endsWith('.js'));
}

function assertStartupStaysInsidePreloads(
	startupScripts: readonly string[],
	preloadPaths: readonly string[],
): void {
	const preloaded = new Set(preloadPaths);
	const unexpected = [...new Set(startupScripts.filter((path) => !preloaded.has(path)))];
	if (unexpected.length > 0) {
		throw new Error(
			`Expected SSR async startup to fetch only rendered modulepreload chunks (no app symbol before interaction), but saw: ${unexpected.join(', ')}`,
		);
	}
}

function formatPaths(paths: readonly string[]): string {
	return paths.length === 0 ? '(none)' : paths.join(', ');
}
