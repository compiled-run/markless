import { gzipSync } from 'node:zlib';
import { box } from '@async/witness';
import { planModulePreloadUrls } from '../../bundler/src/build/preload-plan.ts';
import type { MarklessBundleGraph } from '../../bundler/src/types.ts';
import { EVENT_ONLY_RESUMER_TARGET_BYTES } from '../../../poc/fixtures/proofs/resumer-script/src/resumer-source.mjs';
import { evaluateRouterPreloadWindow, evaluateRouterRequests } from './analyzer-gate.ts';
import { routerAnalyzerPolicy } from './analyzer/policy.ts';
import { invalidateRouterAnalyzerReceipt, writeRouterAnalyzerReceipt } from './analyzer-receipt.ts';

const FIXTURE = 'fixtures/router';
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-preview';
const NITRO_OUTPUT_DIR = '.output-router-preview';
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const COUNTER = 'button';
const DOCS_LINK = 'a[data-markless-router-link]';
const BACK_BUTTON = '[data-router-back]';
const MDX_COUNTER = '[data-mdx-counter]';
const WAIT = { timeoutMs: 10_000 };

export default box(
	{
		name: 'router preview: built fixture resumes counters without eager router runtime',
		tags: ['router', 'build', 'preview', 'browser'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		await invalidateRouterAnalyzerReceipt();
		let analyzerResults: Parameters<typeof writeRouterAnalyzerReceipt>[0] | undefined;
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				nitro: isolatedNitroOutput(),
			}),
		});
		try {
			const indexHtml = await preview.request('/');
			const inlineResumerGzip = assertInlineResumerBudget(indexHtml);
			const expectedPreloadHrefs = expectedInteractionPreloadHrefs(
				JSON.parse(await preview.request(BUNDLE_GRAPH_REQUEST)) as MarklessBundleGraph,
				indexHtml,
			);
			await expect.html.contains(indexHtml, '<h1>Markless Router</h1>');
			await expect.html.contains(indexHtml, 'Button 0');
			await expect.html.contains(indexHtml, 'data-markless-router-link');
			await expect.html.contains(indexHtml, 'data-async-resumer');
			await expect.html.contains(indexHtml, 'rel="icon" href="data:,"');
			receipt.note(
				`router production inline resumer gzip: ${inlineResumerGzip} / ${EVENT_ONLY_RESUMER_TARGET_BYTES} bytes`,
			);
			if (indexHtml.includes('<script type="module"')) {
				throw new Error(
					'Router preview HTML must not wake a module script on SSR startup.',
				);
			}

			const page = await preview.browser.visit('/');

			await expect.page.text(page, 'h1', 'Markless Router', WAIT);
			await expect.page.text(page, COUNTER, 'Button 0', WAIT);
			await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
			await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
			const preloaded = await waitForExpectedPreloadRequests(page, expectedPreloadHrefs, 0);
			receipt.note(`router target interaction modulepreloads: ${formatRequests(preloaded)}`);
			const beforeNavigation = (await page.networkRequests()).length;
			await page.click(DOCS_LINK, WAIT);
			await expect.page.text(page, 'h1', 'Docs', WAIT);
			await expect.page.text(page, MDX_COUNTER, 'MDX Count 0', WAIT);
			// The settlement count is captured the moment the destination proves
			// settled; any module request observed after it (through the MDX
			// interaction below) is post-settlement and must fail MLA-S1.
			const settledAfterRequestCount =
				(await page.networkRequests()).length - beforeNavigation;
			const beforeMdxCounter = await page.networkRequests();
			await page.click(MDX_COUNTER, WAIT);
			await expect.page.text(page, MDX_COUNTER, 'MDX Count 1', WAIT);
			const afterMdxCounter = await page.networkRequests();
			const preload = evaluateRouterPreloadWindow({
				baseUrl: page.url,
				actionKind: 'navigation',
				expectedDestination: { settledAfterRequestCount },
				declaredPreloads: expectedPreloadHrefs,
				observedRequests: afterMdxCounter.slice(beforeNavigation).map((request) => ({
					phase: 'action' as const,
					actionId: 'docs-link',
					url: request.url,
					resourceType: request.resourceType,
				})),
			}).invariant;
			const postClickJs = jsBuildRequests(afterMdxCounter.slice(beforeMdxCounter.length));
			if (postClickJs.length > 0) {
				throw new Error(
					`Expected preloaded MDX interaction to avoid new JS after click, saw: ${formatRequests(postClickJs)}`,
				);
			}
			await expect.page.text(page, BACK_BUTTON, 'Back', WAIT);
			await page.click(BACK_BUTTON, WAIT);
			await expect.page.text(page, 'h1', 'Markless Router', WAIT);
			await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
			await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
			await expect.page.text(page, COUNTER, 'Button 0', WAIT);
			await page.click(COUNTER, WAIT);
			await expect.page.text(page, COUNTER, 'Button 1', WAIT);
			await page.click(COUNTER, WAIT);
			await expect.page.text(page, COUNTER, 'Button 2', WAIT);
			const documentRequests = (await page.networkRequests()).filter(
				(request) => request.resourceType === 'Document',
			);
			if (documentRequests.length !== 1) {
				throw new Error(
					`Expected Link and back traversal to avoid document navigation, saw document requests:\n${documentRequests
						.map((request) => `${request.method} ${request.url}`)
						.join('\n')}`,
				);
			}
			await expect.page.outcome(
				page,
				{ consoleErrors: 0, failedRequests: 0, navigations: 2 },
				WAIT,
			);
			const requests = await page.networkRequests();
			const network = evaluateRouterRequests({
				pageOrigin: new URL(page.url).origin,
				rules: routerAnalyzerPolicy.network.router,
				requests,
			});
			for (const result of [preload, network]) {
				if (result.status === 'fail') throw new Error(result.details.join('\n'));
			}
			analyzerResults = [
				preload,
				network,
				{ id: 'MLA-EXT-WITNESS', status: 'pass', details: [] },
			];
			receipt.note('vite preview served SSR HTML and SPA-navigated router fixture routes');
		} finally {
			await preview.close();
		}
		await receipt.capture(
			'router vite preview SPA-navigated built fixture counters without startup module',
		);
		if (!analyzerResults) throw new Error('Router analyzer results were not produced.');
		await writeRouterAnalyzerReceipt(analyzerResults);
	},
);

function isolatedNitroOutput() {
	return {
		buildDir: NITRO_BUILD_DIR,
		output: {
			dir: NITRO_OUTPUT_DIR,
			publicDir: `${NITRO_OUTPUT_DIR}/public`,
			serverDir: `${NITRO_OUTPUT_DIR}/server`,
		},
	};
}

function assertInlineResumerBudget(html: string): number {
	const source = /<script\b(?=[^>]*\bdata-async-resumer\b)[^>]*>([\s\S]*?)<\/script>/.exec(
		html,
	)?.[1];
	if (!source) throw new Error('Expected router preview HTML to contain an inline resumer.');
	if (source.includes('runInlineResumer') || source.includes('__MARKLESS_INLINE_')) {
		throw new Error('Expected router preview HTML to contain Rolldown/OXC output.');
	}
	const gzipBytes = gzipSync(Buffer.from(source), { level: 9 }).length;
	if (gzipBytes > EVENT_ONLY_RESUMER_TARGET_BYTES) {
		throw new Error(
			`Router inline resumer gzip budget exceeded: ${gzipBytes} > ${EVENT_ONLY_RESUMER_TARGET_BYTES}`,
		);
	}
	return gzipBytes;
}

type BrowserNetworkRequest = {
	readonly method: string;
	readonly url: string;
	readonly resourceType?: string | null;
	readonly status: number | null;
	readonly failedReason?: string | null;
};

type NetworkRequestPage = {
	networkRequests(): Promise<readonly BrowserNetworkRequest[]>;
};

// The bundle graph carries EVERY page's symbols (the fixture grew a second
// interactive page for the streaming box); the index page only preloads its
// own plan, so expected hrefs intersect with the modulepreload links the
// served page actually emitted.
function expectedInteractionPreloadHrefs(
	bundleGraph: MarklessBundleGraph,
	pageHtml: string,
): readonly string[] {
	const roots = bundleGraph
		.filter((item): item is string => typeof item === 'string' && item.startsWith('symbol:'))
		.map((name) => ({ name, priority: 'high' as const }));
	const served = new Set(
		[...pageHtml.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map((match) => match[1]),
	);
	const expected = planModulePreloadUrls({ base: '/build/', bundleGraph, roots }).filter((href) =>
		served.has(href),
	);
	if (expected.length === 0) {
		throw new Error('Index page served no planned symbol modulepreloads to observe.');
	}
	return expected;
}

async function waitForExpectedPreloadRequests(
	page: NetworkRequestPage,
	expectedHrefs: readonly string[],
	startIndex: number,
): Promise<readonly BrowserNetworkRequest[]> {
	const expectedPaths = expectedHrefs.map(
		(href) => new URL(href, 'http://fixture.local').pathname,
	);
	const start = Date.now();
	let latest: readonly BrowserNetworkRequest[] = [];
	while (Date.now() - start < WAIT.timeoutMs) {
		latest = jsBuildRequests((await page.networkRequests()).slice(startIndex)).filter(
			(request) => expectedPaths.includes(new URL(request.url).pathname),
		);
		const paths = new Set(latest.map((request) => new URL(request.url).pathname));
		if (expectedPaths.every((path) => paths.has(path))) return latest;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Expected router interaction modulepreloads, saw: ${formatRequests(latest)}`);
}

function jsBuildRequests(
	requests: readonly BrowserNetworkRequest[],
): readonly BrowserNetworkRequest[] {
	return requests.filter((request) => {
		const path = new URL(request.url).pathname;
		return request.method === 'GET' && path.startsWith('/build/') && path.endsWith('.js');
	});
}

function formatRequests(requests: readonly BrowserNetworkRequest[]): string {
	return requests.length
		? requests.map((request) => new URL(request.url).pathname).join(', ')
		: '(none)';
}
