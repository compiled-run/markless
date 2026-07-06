import { box } from '@async/witness';

const FIXTURE = 'fixtures/router';
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const EXECUTION_SIZES_REQUEST = '/build/execution-sizes.json';
const DOCS_LINK = 'a[data-markless-router-link]';
const HOME_COUNTER = '[data-home-counter]';
const HOME_INPUT = '[data-home-input]';
const HOME_INPUT_STATE = '[data-home-input-state]';
const HOME_BOOST = '[data-home-boost]';
const HOME_LINK = '[data-router-home]';
const MDX_COUNTER = '[data-mdx-counter]';
const MDX_INPUT = '[data-mdx-input]';
const MDX_INPUT_STATE = '[data-mdx-input-state]';
const MDX_BOOST = '[data-mdx-boost]';
const WAIT = { timeoutMs: 15_000 };
const SLOW_3G = {
	latencyMs: 500,
	downloadThroughputBytesPerSecond: (300 * 1024) / 8,
	uploadThroughputBytesPerSecond: (300 * 1024) / 8,
	connectionType: 'cellular3g' as const,
};

type Build = {
	readonly artifacts: readonly { readonly path: string }[];
};
type Preview = {
	request(path: string): Promise<string>;
};
type Request = {
	readonly method: string;
	readonly resourceType?: string;
	readonly url: string;
	readonly startTimeMs: number;
	readonly endTimeMs: number | null;
	readonly durationMs: number | null;
	readonly status: number | null;
};
type Page = {
	allowedLazyHrefs?: readonly string[];
	click(selector: string, wait?: typeof WAIT): Promise<void>;
	networkRequests(): Promise<Request[]>;
	clearNetworkEmulation(): Promise<void>;
};
type Receipt = {
	note(message: string): void;
};

export default box(
	{
		name: 'router preload strategy: exact modulepreloads avoid slow-network CSR waterfalls',
		tags: ['router', 'build', 'preview', 'browser', 'preload', 'network', 'waterfall'],
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
		const plan = await routeCandidatePlan(build as Build, preview as Preview);
		receipt.note(`expected startup modulepreloads: ${plan.expectedHrefs.join(', ')}`);
		receipt.note(`direct docs modulepreloads: ${plan.directDocsHrefs.join(', ')}`);
		receipt.note(`required docs route/nav chain: ${plan.requiredHrefs.join(', ')}`);
		receipt.note(`required home route/nav chain: ${plan.directDocsRequiredHrefs.join(', ')}`);
		receipt.note(
			`forbidden sibling route preloads: ${plan.forbiddenRouteHrefs.join(', ') || '(none)'}`,
		);
		try {
			const page = (await preview.browser.visit('/', {
				networkConditions: SLOW_3G,
			})) as Page;
			page.allowedLazyHrefs = plan.observabilityHrefs;
			await expect.page.text(page, 'h1', 'Markless Router', WAIT);
			const startedPreloads = await waitForExpectedPreloadRequests(page, plan.expectedHrefs);
			receipt.note(`pre-click modulepreloads:\n${timeline(startedPreloads)}`);
			const initialJs = jsBuildRequests(await page.networkRequests());
			const expectedPaths = new Set(plan.expectedHrefs.map((href) => pathOf(href)));
			const unexpectedInitialJs = initialJs.filter(
				(request) => !expectedPaths.has(pathOf(request.url)),
			);
			if (unexpectedInitialJs.length > 0) {
				throw new Error(
					`Expected startup JS to be only current route and visible Link modulepreloads, saw:\n${timeline(unexpectedInitialJs)}`,
				);
			}
			const forbiddenPaths = new Set(plan.forbiddenRouteHrefs.map((href) => pathOf(href)));
			const forbiddenPreloads = initialJs.filter((request) =>
				forbiddenPaths.has(pathOf(request.url)),
			);
			if (forbiddenPreloads.length > 0) {
				throw new Error(
					`Expected current route and docs Link preloads to exclude unrelated sibling route chunks, saw:\n${timeline(forbiddenPreloads)}`,
				);
			}
			await expectNoNewBuildJs(page, receipt, 'post-Link-click JS', async () => {
				await page.click(DOCS_LINK, WAIT);
				await expect.page.text(page, 'h1', 'Docs', WAIT);
				await expect.page.text(page, MDX_COUNTER, 'MDX Count 0', WAIT);
			});
			await expectNoNewBuildJs(page, receipt, 'post-MDX-counter JS', async () => {
				await page.click(MDX_COUNTER, WAIT);
				await expect.page.text(page, MDX_COUNTER, 'MDX Count 1', WAIT);
			});
			await expectNoNewBuildJs(page, receipt, 'post-MDX-input JS', async () => {
				await page.click(MDX_INPUT, WAIT);
				await expect.page.text(page, MDX_INPUT_STATE, 'MDX Input on', WAIT);
			});
			await expectNoNewBuildJs(page, receipt, 'post-MDX-boost JS', async () => {
				await page.click(MDX_BOOST, WAIT);
				await expect.page.text(page, MDX_BOOST, 'MDX Boost 1', WAIT);
			});
			const documentRequests = (await page.networkRequests()).filter(
				(request) => request.resourceType === 'Document',
			);
			if (documentRequests.length !== 1) {
				throw new Error(
					`Expected CSR Link navigation to avoid a server document round trip, saw:\n${timeline(documentRequests)}`,
				);
			}
			const graphRequests = bundleGraphRequests(await page.networkRequests());
			if (graphRequests.length > 0) {
				throw new Error(
					`Expected route preloads to avoid browser bundle graph fetches, saw:\n${timeline(graphRequests)}`,
				);
			}
			await page.clearNetworkEmulation();
			await waitForSettledNetwork(page);
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

			const directPage = (await preview.browser.visit('/docs/getting-started', {
				networkConditions: SLOW_3G,
			})) as Page;
			directPage.allowedLazyHrefs = plan.observabilityHrefs;
			await expect.page.text(directPage, 'h1', 'Docs', WAIT);
			await expect.page.text(directPage, MDX_COUNTER, 'MDX Count 0', WAIT);
			await expect.page.text(directPage, HOME_LINK, 'Home', WAIT);
			const directPreloads = await waitForExpectedPreloadRequests(
				directPage,
				plan.directDocsHrefs,
			);
			receipt.note(`direct docs preloads:\n${timeline(directPreloads)}`);
			const directInitialJs = jsBuildRequests(await directPage.networkRequests());
			const directExpectedPaths = new Set(plan.directDocsHrefs.map((href) => pathOf(href)));
			const unexpectedDirectJs = directInitialJs.filter(
				(request) => !directExpectedPaths.has(pathOf(request.url)),
			);
			if (unexpectedDirectJs.length > 0) {
				throw new Error(
					`Expected direct docs startup JS to be only current route and visible Link modulepreloads, saw:\n${timeline(unexpectedDirectJs)}`,
				);
			}
			await expectNoNewBuildJs(
				directPage,
				receipt,
				'direct docs post-counter JS',
				async () => {
					await directPage.click(MDX_COUNTER, WAIT);
					await expect.page.text(directPage, MDX_COUNTER, 'MDX Count 1', WAIT);
				},
			);
			await expectNoNewBuildJs(directPage, receipt, 'direct docs post-input JS', async () => {
				await directPage.click(MDX_INPUT, WAIT);
				await expect.page.text(directPage, MDX_INPUT_STATE, 'MDX Input on', WAIT);
			});
			await expectNoNewBuildJs(
				directPage,
				receipt,
				'direct docs-to-home Link JS',
				async () => {
					await directPage.click(HOME_LINK, WAIT);
					await expect.page.text(directPage, 'h1', 'Markless Router', WAIT);
					await expect.page.text(directPage, HOME_COUNTER, 'Button 0', WAIT);
				},
			);
			await expectNoNewBuildJs(
				directPage,
				receipt,
				'direct docs routed-home counter JS',
				async () => {
					await directPage.click(HOME_COUNTER, WAIT);
					await expect.page.text(directPage, HOME_COUNTER, 'Button 1', WAIT);
				},
			);
			await expectNoNewBuildJs(
				directPage,
				receipt,
				'direct docs routed-home input JS',
				async () => {
					await directPage.click(HOME_INPUT, WAIT);
					await expect.page.text(directPage, HOME_INPUT_STATE, 'Home Input on', WAIT);
				},
			);
			await expectNoNewBuildJs(
				directPage,
				receipt,
				'direct docs routed-home boost JS',
				async () => {
					await directPage.click(HOME_BOOST, WAIT);
					await expect.page.text(directPage, HOME_BOOST, 'Home Boost 1', WAIT);
				},
			);
			const directDocumentRequests = (await directPage.networkRequests()).filter(
				(request) => request.resourceType === 'Document',
			);
			if (directDocumentRequests.length !== 1) {
				throw new Error(
					`Expected MDX-to-TSRX Link navigation to avoid a server document round trip, saw:\n${timeline(directDocumentRequests)}`,
				);
			}
			const directGraphRequests = bundleGraphRequests(await directPage.networkRequests());
			if (directGraphRequests.length > 0) {
				throw new Error(
					`Expected direct MDX route to avoid browser bundle graph fetches, saw:\n${timeline(directGraphRequests)}`,
				);
			}
			await directPage.clearNetworkEmulation();
			await waitForSettledNetwork(directPage);
			await expect.page.outcome(directPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		} finally {
			await preview.close();
		}
		await receipt.capture('router preload strategy slow-network modulepreload QA');
	},
);

type RouteCandidatePlan = {
	readonly directDocsHrefs: readonly string[];
	readonly directDocsRequiredHrefs: readonly string[];
	readonly expectedHrefs: readonly string[];
	readonly observabilityHrefs: readonly string[];
	readonly requiredHrefs: readonly string[];
	readonly forbiddenRouteHrefs: readonly string[];
};

async function routeCandidatePlan(build: Build, preview: Preview): Promise<RouteCandidatePlan> {
	const chunks = new Map<string, string>();
	for (const artifact of build.artifacts) {
		const path = publicBuildPath(artifact.path);
		if (!path) continue;
		chunks.set(path, await preview.request(`/${path}`));
	}
	const navigation = [...chunks].find(([, code]) => isRouterNavigationChunk(code));
	if (!navigation) {
		throw new Error(
			`Expected router navigation chunk. Artifacts: ${[...chunks.keys()].join(', ')}`,
		);
	}
	const [navigationPath, navigationCode] = navigation;
	const routeImports = routeImportsFromNavigation(navigationCode);
	const routeImportPaths = new Set(routeImports.values());
	const indexRoutePath = routeImports.get('/pages/index.tsrx');
	if (!indexRoutePath) {
		throw new Error(
			`Expected index route chunk. Route imports: ${[...routeImports.entries()]
				.map(([file, path]) => `${file} -> ${path}`)
				.join(', ')}`,
		);
	}
	const docsRoutePath =
		routeImports.get('/pages/docs/[...slug].mdx') ??
		[...chunks].find(([, code]) => isDocsRouteChunk(code))?.[0];
	if (!docsRoutePath) {
		throw new Error(
			`Expected docs route chunk. Route imports: ${[...routeImports.entries()]
				.map(([file, path]) => `${file} -> ${path}`)
				.join(', ')}`,
		);
	}
	const matches = routeChunkMatches({
		chunks,
		navigationCode,
		navigationPath,
		routeImportPaths,
		routePath: docsRoutePath,
	});
	const homeMatches = routeChunkMatches({
		chunks,
		navigationCode,
		navigationPath,
		routeImportPaths,
		routePath: indexRoutePath,
	});
	assertEventRecord(chunks, matches, 'click', 'docs route');
	assertEventRecord(chunks, homeMatches, 'click', 'home route');
	if (matches.size === 0) {
		throw new Error(
			`Expected docs route/navigation JS candidates. Artifacts: ${[...chunks.keys()].join(', ')}`,
		);
	}
	const indexPreloads = modulePreloadPlacement(await preview.request('/'));
	if (indexPreloads.bodyCount > 0) {
		throw new Error(
			`Expected index modulepreloads in head, saw ${indexPreloads.bodyCount} in body.`,
		);
	}
	const directDocsPreloads = modulePreloadPlacement(
		await preview.request('/docs/getting-started'),
	);
	if (directDocsPreloads.hrefs.length === 0) {
		throw new Error('Expected direct docs route to emit modulepreloads.');
	}
	if (directDocsPreloads.bodyCount > 0) {
		throw new Error(
			`Expected direct docs modulepreloads in head, saw ${directDocsPreloads.bodyCount} in body.`,
		);
	}
	const expectedHrefs = indexPreloads.hrefs;
	const observabilityHrefs = await observabilityChunkHrefs(chunks, preview);
	const requiredHrefs = [...matches].sort().map((path) => `/${path}`);
	const directDocsRequiredHrefs = [...homeMatches].sort().map((path) => `/${path}`);
	const expectedPaths = new Set(expectedHrefs.map((href) => pathOf(href)));
	const missingRequired = requiredHrefs.filter((href) => !expectedPaths.has(pathOf(href)));
	if (missingRequired.length > 0) {
		throw new Error(
			`Expected SSR modulepreloads to include docs route plan, missing: ${missingRequired.join(', ')}`,
		);
	}
	const directDocsPaths = new Set(directDocsPreloads.hrefs.map((href) => pathOf(href)));
	const missingDirectDocsRequired = directDocsRequiredHrefs.filter(
		(href) => !directDocsPaths.has(pathOf(href)),
	);
	if (missingDirectDocsRequired.length > 0) {
		throw new Error(
			`Expected direct docs modulepreloads to include visible home route plan, missing: ${missingDirectDocsRequired.join(', ')}`,
		);
	}
	return {
		directDocsHrefs: directDocsPreloads.hrefs,
		directDocsRequiredHrefs,
		expectedHrefs,
		observabilityHrefs,
		requiredHrefs,
		forbiddenRouteHrefs: [...routeImportPaths]
			.filter((path) => path !== docsRoutePath && path !== indexRoutePath)
			.sort()
			.map((path) => `/${path}`),
	};
}

function publicBuildPath(path: string): string | undefined {
	const index = path.indexOf('build/');
	return index === -1 || !path.endsWith('.js') ? undefined : path.slice(index);
}

async function observabilityChunkHrefs(chunks: ReadonlyMap<string, string>, preview: Preview): Promise<string[]> {
	const hrefs = new Set<string>();
	for (const [moduleId, entry] of Object.entries(await executionSizes(preview))) {
		if (typeof entry?.chunk === 'string' && isObservabilityChunk(chunks, moduleId, entry.chunk)) {
			hrefs.add(`/${entry.chunk}`);
		}
	}
	for (const [path, code] of chunks) {
		if (
			code.includes('virtual:markless:dev-log') ||
			code.includes('__mxLogInteraction') ||
			// Minified builds preserve the virtual module's export names even when
			// the specifier string is gone.
			code.includes('markless_dev_log')
		) {
			hrefs.add(`/${path}`);
		}
	}
	return [...hrefs].sort();
}

async function executionSizes(preview: Preview): Promise<Record<string, { readonly chunk?: string }>> {
	try {
		return JSON.parse(await preview.request(EXECUTION_SIZES_REQUEST)) as Record<string, { readonly chunk?: string }>;
	} catch {
		return {};
	}
}

function isObservabilityChunk(chunks: ReadonlyMap<string, string>, moduleId: string, path: string): boolean {
	const code = chunks.get(path) ?? '';
	return (
		moduleId === 'web:dev-log' ||
		moduleId === 'web:execution-log-target' ||
		code.includes('virtual:markless:dev-log')
	);
}

function isRouterNavigationChunk(code: string): boolean {
	return code.includes('navigateMarklessRouterLink') || code.includes('__marklessRouterLink');
}

function isDocsRouteChunk(code: string): boolean {
	return code.includes('data-mdx-counter') || code.includes('<h1>Docs</h1>');
}

function isHomeRouteChunk(code: string): boolean {
	return code.includes('data-home-counter') || code.includes('<h1>Markless Router</h1>');
}

function assertEventRecord(
	chunks: ReadonlyMap<string, string>,
	paths: ReadonlySet<string>,
	eventName: string,
	label: string,
): void {
	const found = [...paths].some((path) => {
		const code = chunks.get(path) ?? '';
		return (
			code.includes(`eventName:\`${eventName}\``) ||
			code.includes(`"eventName":"${eventName}"`)
		);
	});
	if (!found) {
		throw new Error(`Expected ${label} preload graph to include ${eventName} event records.`);
	}
}

function modulePreloadHrefs(html: string): string[] {
	return [
		...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")(?=[^>]*\bhref="([^"]*)")[^>]*>/g),
	].map((match) => unescapeHtmlAttribute(match[1] ?? ''));
}

function modulePreloadPlacement(html: string): {
	readonly bodyCount: number;
	readonly hrefs: readonly string[];
} {
	const headEnd = html.indexOf('</head>');
	const bodyStart = html.indexOf('<body');
	return {
		bodyCount:
			bodyStart === -1
				? 0
				: (html.slice(bodyStart).match(/rel="modulepreload"/g) ?? []).length,
		hrefs: headEnd === -1 ? [] : modulePreloadHrefs(html.slice(0, headEnd)),
	};
}

function routeImportsFromNavigation(code: string): Map<string, string> {
	const imports = new Map<string, string>();
	for (const match of code.matchAll(
		/"(\/pages\/[^"]+\.(?:tsrx|mdx))":\(\)=>import\([`"']\.\/([^`"']+)[`"']\)/g,
	)) {
		imports.set(match[1] ?? '', `build/${match[2]}`);
	}
	return imports;
}

function routeChunkMatches(input: {
	chunks: ReadonlyMap<string, string>;
	navigationCode: string;
	navigationPath: string;
	routeImportPaths: ReadonlySet<string>;
	routePath: string;
}): Set<string> {
	const matches = new Set<string>();
	matches.add(input.navigationPath);
	addStaticImports(matches, input.navigationCode);
	addDynamicImports(matches, input.navigationCode, (path) => !input.routeImportPaths.has(path));
	matches.add(input.routePath);
	const routeCode = input.chunks.get(input.routePath);
	if (routeCode) {
		addStaticImports(matches, routeCode);
		addDynamicImports(matches, routeCode, () => true);
	}
	addTransitiveImports(input.chunks, matches, input.routePath);
	return matches;
}

function addTransitiveImports(
	chunks: ReadonlyMap<string, string>,
	matches: Set<string>,
	routePath: string,
): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (const path of [...matches]) {
			const code = chunks.get(path);
			if (!code) continue;
			changed = addStaticImports(matches, code) || changed;
			if (path === routePath || isDocsRouteChunk(code) || isHomeRouteChunk(code)) {
				changed = addDynamicImports(matches, code, () => true) || changed;
			}
		}
	}
}

function addStaticImports(matches: Set<string>, code: string): boolean {
	return addPaths(
		matches,
		[...code.matchAll(/import[^(`]*from[`"']\.\/(chunk-[^`"']+\.js)[`"']/g)].map(
			(match) => `build/${match[1]}`,
		),
	);
}

function addDynamicImports(
	matches: Set<string>,
	code: string,
	include: (path: string) => boolean,
): boolean {
	const paths: string[] = [];
	for (const match of code.matchAll(/import\([`"']\.\/(chunk-[^`"']+\.js)[`"']\)/g)) {
		const path = `build/${match[1]}`;
		if (include(path)) paths.push(path);
	}
	return addPaths(matches, paths);
}

function addPaths(matches: Set<string>, paths: readonly string[]): boolean {
	let changed = false;
	for (const path of paths) {
		if (matches.has(path)) continue;
		matches.add(path);
		changed = true;
	}
	return changed;
}

function jsBuildRequests(requests: readonly Request[]): Request[] {
	return requests.filter(
		(request) =>
			request.method === 'GET' &&
			pathOf(request.url).startsWith('/build/') &&
			pathOf(request.url).endsWith('.js'),
	);
}

function bundleGraphRequests(requests: readonly Request[]): Request[] {
	return requests.filter((request) => pathOf(request.url) === BUNDLE_GRAPH_REQUEST);
}

async function expectNoNewBuildJs(
	page: Page,
	receipt: Receipt,
	label: string,
	action: () => Promise<void>,
): Promise<void> {
	const before = await page.networkRequests();
	await action();
	const allowedLazyPaths = new Set((page.allowedLazyHrefs ?? []).map((href) => pathOf(href)));
	// The dev execution log wakes from runtime predicates, so preloading it would
	// overstate the route plan. Keep the post-click exactness check for app chunks.
	const requests = jsBuildRequests((await page.networkRequests()).slice(before.length)).filter(
		(request) => !allowedLazyPaths.has(pathOf(request.url)),
	);
	receipt.note(`${label}:\n${timeline(requests)}`);
	if (requests.length > 0) {
		throw new Error(`Expected preloaded JS to avoid ${label}, saw:\n${timeline(requests)}`);
	}
}

function pathOf(url: string): string {
	return new URL(url, 'http://fixture.local').pathname;
}

function unescapeHtmlAttribute(value: string): string {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&gt;', '>')
		.replaceAll('&lt;', '<')
		.replaceAll('&amp;', '&');
}

async function waitForExpectedPreloadRequests(
	page: Page,
	expectedHrefs: readonly string[],
): Promise<readonly Request[]> {
	const expectedPaths = expectedHrefs.map((href) => pathOf(href));
	const start = Date.now();
	let latest: readonly Request[] = [];
	while (Date.now() - start < WAIT.timeoutMs) {
		latest = jsBuildRequests(await page.networkRequests()).filter((request) =>
			expectedPaths.includes(pathOf(request.url)),
		);
		const paths = new Set(latest.map((request) => pathOf(request.url)));
		if (expectedPaths.every((path) => paths.has(path))) return latest;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Expected route modulepreloads, saw:\n${timeline(latest)}`);
}

async function waitForSettledNetwork(page: Page): Promise<void> {
	const quietMs = 300;
	const start = Date.now();
	let quietSince = 0;
	let previousCount = -1;
	while (Date.now() - start < WAIT.timeoutMs) {
		const requests = await page.networkRequests();
		const pending = requests.some((request) => request.endTimeMs === null);
		if (!pending && requests.length === previousCount) {
			quietSince ||= Date.now();
			if (Date.now() - quietSince >= quietMs) return;
		} else {
			quietSince = 0;
			previousCount = requests.length;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}

function timeline(requests: readonly Request[]): string {
	if (requests.length === 0) return '(none)';
	const first = Math.min(...requests.map((request) => request.startTimeMs));
	return [...requests]
		.sort((left, right) => left.startTimeMs - right.startTimeMs)
		.map((request) => {
			const start = Math.round(request.startTimeMs - first);
			const end = request.endTimeMs === null ? '?' : Math.round(request.endTimeMs - first);
			const duration = request.durationMs === null ? '?' : Math.round(request.durationMs);
			return `${pathOf(request.url)} ${request.status ?? '?'} start=${start}ms end=${end}ms duration=${duration}ms`;
		})
		.join('\n');
}
