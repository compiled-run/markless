import { box } from '@async/witness';
import { planModulePreloadUrls } from '../../bundler/src/build/preload-plan.ts';
import type { ArcadeBundleGraph } from '../../bundler/src/types.ts';

const FIXTURE = '../../fixtures/router';
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const COUNTER = 'button';
const DOCS_LINK = 'a[data-arcade-router-link]';
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
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});

		const preview = await pipeline.preview(build, {
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
			}),
		});
		try {
			const expectedPreloadHrefs = expectedInteractionPreloadHrefs(
				JSON.parse(await preview.request(BUNDLE_GRAPH_REQUEST)) as ArcadeBundleGraph,
			);
			const indexHtml = await preview.request('/');
			await expect.html.contains(indexHtml, '<h1>Arcade Router</h1>');
			await expect.html.contains(indexHtml, 'Button 0');
			await expect.html.contains(indexHtml, 'data-arcade-router-link');
			await expect.html.contains(indexHtml, 'data-async-resumer');
			if (indexHtml.includes('<script type="module"')) {
				throw new Error(
					'Router preview HTML must not wake a module script on SSR startup.',
				);
			}

			const page = await preview.browser.visit('/');

			await expect.page.text(page, 'h1', 'Arcade Router', WAIT);
			await expect.page.text(page, COUNTER, 'Button 0', WAIT);
			await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
			await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
			const preloaded = await waitForExpectedPreloadRequests(
				page,
				expectedPreloadHrefs,
				0,
			);
			receipt.note(`router target interaction modulepreloads: ${formatRequests(preloaded)}`);
			const beforeDocsLink = await page.networkRequests();
			await page.click(DOCS_LINK, WAIT);
			await expect.page.text(page, 'h1', 'Docs', WAIT);
			await expect.page.text(page, MDX_COUNTER, 'MDX Count 0', WAIT);
			const beforeMdxCounter = await page.networkRequests();
			await page.click(MDX_COUNTER, WAIT);
			await expect.page.text(page, MDX_COUNTER, 'MDX Count 1', WAIT);
			const afterMdxCounter = await page.networkRequests();
			const postClickJs = jsBuildRequests(afterMdxCounter.slice(beforeMdxCounter.length));
			if (postClickJs.length > 0) {
				throw new Error(
					`Expected preloaded MDX interaction to avoid new JS after click, saw: ${formatRequests(postClickJs)}`,
				);
			}
			await expect.page.text(page, BACK_BUTTON, 'Back', WAIT);
			await page.click(BACK_BUTTON, WAIT);
			await expect.page.text(page, 'h1', 'Arcade Router', WAIT);
			await expect.page.text(page, DOCS_LINK, 'Docs', WAIT);
			await expect.page.attribute(page, DOCS_LINK, 'href', '/docs/getting-started', WAIT);
			await expect.page.text(page, COUNTER, 'Button 0', WAIT);
			await page.click(COUNTER, WAIT);
			await expect.page.text(page, COUNTER, 'Button 1', WAIT);
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
			receipt.note('vite preview served SSR HTML and SPA-navigated router fixture routes');
		} finally {
			await preview.close();
		}
		await receipt.capture(
			'router vite preview SPA-navigated built fixture counters without startup module',
		);
	},
);

type BrowserNetworkRequest = {
	readonly method: string;
	readonly url: string;
};

type NetworkRequestPage = {
	networkRequests(): Promise<readonly BrowserNetworkRequest[]>;
};

function expectedInteractionPreloadHrefs(bundleGraph: ArcadeBundleGraph): readonly string[] {
	const roots = bundleGraph
		.filter((item): item is string => typeof item === 'string' && item.startsWith('symbol:'))
		.map((name) => ({ name, priority: 'high' as const }));
	return planModulePreloadUrls({ base: '/build/', bundleGraph, roots });
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
