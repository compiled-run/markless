import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { box } from '@async/witness';
import type { Plugin } from 'vite';
import { NAVIGATION_POLYFILL_MODULE } from '../src/navigation-polyfill.ts';
import { readClientAssetsManifest } from '../src/vite/client-assets-manifest.ts';
import {
	MARKLESS_CHUNK_SPECIFIER_PREFIX,
	marklessImportMapPath,
} from '@markless/bundler/rolldown';

const FIXTURE = 'fixtures/router';
const NITRO_BUILD_DIR = 'node_modules/.nitro-router-preload-strategy';
// Nitro previews import the server entry in-process, so each box needs its own entry path.
const NITRO_OUTPUT_DIR = '.output/router-preload-strategy';
const BUNDLE_GRAPH_REQUEST = '/build/bundle-graph.json';
const EXECUTION_SIZES_REQUEST = '/build/execution-sizes.json';
const INDEX_ROUTE = 'pages/index.tsrx';
const DOCS_ROUTE = 'pages/docs/[...slug].mdx';
const DOCS_PATH = '/docs/getting-started';
const HOME_PATH = '/';
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
// The idle tier only downloads on a connection the browser reports as 4g.
const FAST_4G = {
	latencyMs: 20,
	downloadThroughputBytesPerSecond: (20 * 1024 * 1024) / 8,
	uploadThroughputBytesPerSecond: (20 * 1024 * 1024) / 8,
	connectionType: 'cellular4g' as const,
};

type Build = {
	readonly artifacts: readonly { readonly path: string }[];
};
type Preview = {
	request(path: string): Promise<string>;
};
type Request = {
	readonly method: string;
	readonly resourceType?: string | null;
	readonly url: string;
	readonly startTimeMs: number;
	readonly endTimeMs: number | null;
	readonly durationMs: number | null;
	readonly status: number | null;
};
type Page = {
	allowedLazyHrefs?: readonly string[];
	demandHrefs?: readonly string[];
	settledRequests?: readonly Request[];
	click(selector: string, wait?: typeof WAIT): Promise<void>;
	networkRequests(): Promise<Request[]>;
	clearNetworkEmulation(): Promise<void>;
};
type Receipt = {
	note(message: string): void;
};

export default box(
	{
		name: 'router preload strategy: landing preloads and one-round fragment navigation',
		tags: ['router', 'build', 'preview', 'browser', 'preload', 'network', 'waterfall'],
		modes: ['build', 'preview'],
	},
	async ({ pipeline, expect, receipt }) => {
		const polyfill = navigationPolyfillChunkRecorder();
		const build = await pipeline.build({
			config: (config) => ({
				...config,
				root: `${config.root}/${FIXTURE}`,
				configFile: `${config.root}/${FIXTURE}/vite.config.ts`,
				mode: 'execution-measurement',
				nitro: isolatedNitroOutput(),
				plugins: [...(config.plugins ?? []), polyfill.plugin],
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
		const plan = await deliveryPlan(build as Build, preview as Preview, polyfill.chunkPaths());
		receipt.note(`index landing preloads: ${plan.index.landing.join(', ')}`);
		receipt.note(`docs landing preloads: ${plan.docs.landing.join(', ')}`);
		receipt.note(`index -> docs intent round: ${DOCS_PATH}, ${plan.docsRound.join(', ')}`);
		receipt.note(`docs -> home intent round: ${HOME_PATH}, ${plan.homeRound.join(', ')}`);
		receipt.note(`navigation polyfill chunks kept out: ${plan.polyfillHrefs.join(', ')}`);
		try {
			// Slow network: the landing round and the intent round are separable on the timeline.
			const page = (await preview.browser.visit('/', {
				networkConditions: SLOW_3G,
			})) as Page;
			page.allowedLazyHrefs = plan.observabilityHrefs;
			await expect.page.text(page, 'h1', 'Markless Router', WAIT);
			const landing = await expectLandingRound(page, plan, plan.index, receipt, 'index');
			const intent = await expectIntentRound(page, plan, receipt, {
				label: 'index -> docs',
				path: DOCS_PATH,
				round: plan.docsRound,
				landing,
				navigate: async () => {
					await page.click(DOCS_LINK, WAIT);
					await expect.page.text(page, 'h1', 'Docs', WAIT);
					await expect.page.text(page, MDX_COUNTER, 'MDX Count 0', WAIT);
				},
			});
			receipt.note(`slow 3G docs round fired ${intent}`);
			page.demandHrefs = plan.docs.demand;
			await expectRouteDemandJs(page, receipt, 'post-MDX-counter JS', async () => {
				await page.click(MDX_COUNTER, WAIT);
				await expect.page.text(page, MDX_COUNTER, 'MDX Count 1', WAIT);
			});
			await expectRouteDemandJs(page, receipt, 'post-MDX-input JS', async () => {
				await page.click(MDX_INPUT, WAIT);
				await expect.page.text(page, MDX_INPUT_STATE, 'MDX Input on', WAIT);
			});
			await expectRouteDemandJs(page, receipt, 'post-MDX-boost JS', async () => {
				await page.click(MDX_BOOST, WAIT);
				await expect.page.text(page, MDX_BOOST, 'MDX Boost 1', WAIT);
			});
			await expectNothingWasted(page, plan, 'index -> docs');
			await page.clearNetworkEmulation();
			await waitForSettledNetwork(page);
			await expect.page.outcome(page, { consoleErrors: 0, failedRequests: 0 }, WAIT);

			// Fast network: the idle tier fetches the visible link's round, so the click itself fetches nothing.
			const idlePage = (await preview.browser.visit('/', {
				networkConditions: FAST_4G,
			})) as Page;
			idlePage.allowedLazyHrefs = plan.observabilityHrefs;
			await expect.page.text(idlePage, 'h1', 'Markless Router', WAIT);
			const idleLanding = await waitForRequests(idlePage, plan.index.landing);
			const idleRound = await waitForRequests(idlePage, [...plan.docsRound, DOCS_PATH]);
			receipt.note(`idle-tier docs round:\n${timeline(idleRound)}`);
			expectOneRound(idleRound, 'idle-tier docs round');
			await waitForSettledNetwork(idlePage);
			const idleBefore = await idlePage.networkRequests();
			const idleExtra = appRequests(idleBefore, plan).filter(
				(request) =>
					!idleLanding.some(same(request)) &&
					!idleRound.some(same(request)) &&
					!plan.observabilityPaths.has(pathOf(request.url)),
			);
			if (idleExtra.length > 0)
				throw new Error(
					`Expected the idle tier to fetch only the docs fragment and its landing code, saw:\n${timeline(idleExtra)}`,
				);
			await idlePage.click(DOCS_LINK, WAIT);
			await expect.page.text(idlePage, 'h1', 'Docs', WAIT);
			await expect.page.text(idlePage, MDX_COUNTER, 'MDX Count 0', WAIT);
			await waitForSettledNetwork(idlePage);
			const clickRequests = appRequests(
				(await idlePage.networkRequests()).slice(idleBefore.length),
				plan,
			).filter((request) => !plan.observabilityPaths.has(pathOf(request.url)));
			receipt.note(`idle-tier click requests:\n${timeline(clickRequests)}`);
			// The destination's own idle tier may fetch fragments for the links it shows; code and the docs fragment may not come again.
			const clickFetched = clickRequests.filter(
				(request) =>
					jsBuildRequests([request]).length > 0 || pathOf(request.url) === DOCS_PATH,
			);
			if (clickFetched.length > 0)
				throw new Error(
					`Expected a click after the idle round to fetch nothing, saw:\n${timeline(clickFetched)}`,
				);
			await expectNothingWasted(idlePage, plan, 'idle-tier index -> docs');
			await idlePage.clearNetworkEmulation();
			await waitForSettledNetwork(idlePage);
			await expect.page.outcome(idlePage, { consoleErrors: 0, failedRequests: 0 }, WAIT);

			const directPage = (await preview.browser.visit(DOCS_PATH, {
				networkConditions: SLOW_3G,
			})) as Page;
			directPage.allowedLazyHrefs = plan.observabilityHrefs;
			await expect.page.text(directPage, 'h1', 'Docs', WAIT);
			await expect.page.text(directPage, MDX_COUNTER, 'MDX Count 0', WAIT);
			await expect.page.text(directPage, HOME_LINK, 'Home', WAIT);
			const directLanding = await expectLandingRound(
				directPage,
				plan,
				plan.docs,
				receipt,
				'direct docs',
			);
			directPage.demandHrefs = plan.docs.demand;
			await expectRouteDemandJs(
				directPage,
				receipt,
				'direct docs post-counter JS',
				async () => {
					await directPage.click(MDX_COUNTER, WAIT);
					await expect.page.text(directPage, MDX_COUNTER, 'MDX Count 1', WAIT);
				},
			);
			await expectRouteDemandJs(
				directPage,
				receipt,
				'direct docs post-input JS',
				async () => {
					await directPage.click(MDX_INPUT, WAIT);
					await expect.page.text(directPage, MDX_INPUT_STATE, 'MDX Input on', WAIT);
				},
			);
			const homeIntent = await expectIntentRound(directPage, plan, receipt, {
				label: 'docs -> home',
				path: HOME_PATH,
				round: plan.homeRound,
				landing: directLanding,
				navigate: async () => {
					await directPage.click(HOME_LINK, WAIT);
					await expect.page.text(directPage, 'h1', 'Markless Router', WAIT);
					await expect.page.text(directPage, HOME_COUNTER, 'Button 0', WAIT);
				},
			});
			receipt.note(`slow 3G home round fired ${homeIntent}`);
			directPage.demandHrefs = plan.index.demand;
			await expectRouteDemandJs(
				directPage,
				receipt,
				'direct docs routed-home counter JS',
				async () => {
					await directPage.click(HOME_COUNTER, WAIT);
					await expect.page.text(directPage, HOME_COUNTER, 'Button 1', WAIT);
				},
			);
			await expectRouteDemandJs(
				directPage,
				receipt,
				'direct docs routed-home input JS',
				async () => {
					await directPage.click(HOME_INPUT, WAIT);
					await expect.page.text(directPage, HOME_INPUT_STATE, 'Home Input on', WAIT);
				},
			);
			await expectRouteDemandJs(
				directPage,
				receipt,
				'direct docs routed-home boost JS',
				async () => {
					await directPage.click(HOME_BOOST, WAIT);
					await expect.page.text(directPage, HOME_BOOST, 'Home Boost 1', WAIT);
				},
			);
			await expectNothingWasted(directPage, plan, 'docs -> home');
			await directPage.clearNetworkEmulation();
			await waitForSettledNetwork(directPage);
			await expect.page.outcome(directPage, { consoleErrors: 0, failedRequests: 0 }, WAIT);
		} finally {
			await preview.close();
		}
		await receipt.capture('router preload strategy slow-network fragment navigation QA');
	},
);

type RoutePlan = {
	readonly path: string;
	// The route's SSR landing code: exactly what its document head preloads.
	readonly landing: readonly string[];
	// Landing code plus the chunks its interactions may import on demand.
	readonly demand: readonly string[];
	// Client code no other page's landing needs before intent: other routes' SSR and client-render code.
	readonly foreign: readonly string[];
};

type DeliveryPlan = {
	readonly index: RoutePlan;
	readonly docs: RoutePlan;
	readonly docsRound: readonly string[];
	readonly homeRound: readonly string[];
	readonly observabilityHrefs: readonly string[];
	readonly observabilityPaths: ReadonlySet<string>;
	readonly polyfillHrefs: readonly string[];
};

async function deliveryPlan(
	build: Build,
	preview: Preview,
	polyfillPaths: ReadonlySet<string>,
): Promise<DeliveryPlan> {
	const manifest = await readClientAssetsManifest(`${FIXTURE}/${NITRO_OUTPUT_DIR}/public`, '/');
	const fragmentEntry = manifest.entries.fragment;
	if (!fragmentEntry) throw new Error('Expected the build to emit a fragment navigation entry.');
	const indexLanding = manifest.routes.ssr[INDEX_ROUTE];
	const docsLanding = manifest.routes.ssr[DOCS_ROUTE];
	if (!indexLanding?.length || !docsLanding?.length)
		throw new Error('Missing fixture route SSR landing plans.');
	const chunks = new Map<string, string>();
	const importMap = await builtImportMap();
	for (const artifact of build.artifacts) {
		const path = publicBuildPath(artifact.path);
		if (!path) continue;
		chunks.set(path, withRelativeChunkSpecifiers(await preview.request(`/${path}`), importMap));
	}
	const missingPolyfill = [...polyfillPaths].filter((path) => !chunks.has(path));
	if (polyfillPaths.size === 0 || missingPolyfill.length > 0) {
		throw new Error(
			`Expected the build to emit the navigation polyfill as its own chunk, saw: ${[...polyfillPaths].join(', ') || '(none)'}`,
		);
	}
	const navigationPath = pathOf(manifest.entries.navigation).slice(1);
	const navigationCode = chunks.get(navigationPath);
	if (!navigationCode)
		throw new Error(`Expected the navigation entry ${navigationPath} among build artifacts.`);
	const routeImportPaths = new Set(routeImportsFromNavigation(navigationCode).values());
	if (routeImportPaths.size === 0)
		throw new Error('Expected the navigation entry to import the route modules lazily.');
	const clientRenderCode = new Set(
		[
			manifest.entries.navigation,
			...Object.values(manifest.routes.navigation).flat(),
			...[...routeImportPaths].map((path) => `/${path}`),
		].map(pathOf),
	);
	const routePlan = (route: string, path: string): RoutePlan => {
		const landing = manifest.routes.ssr[route] ?? [];
		const own = new Set(landing.map(pathOf));
		const otherLanding = Object.entries(manifest.routes.ssr)
			.filter(([other]) => other !== route)
			.flatMap(([, hrefs]) => hrefs.map(pathOf));
		return {
			path,
			landing,
			demand: demandClosure(chunks, landing, routeImportPaths),
			foreign: [...new Set([...clientRenderCode, ...otherLanding, pathOf(fragmentEntry)])]
				.filter((href) => !own.has(href))
				.sort(),
		};
	};
	const index = routePlan(INDEX_ROUTE, HOME_PATH);
	const docs = routePlan(DOCS_ROUTE, DOCS_PATH);
	await expectHeadLanding(preview, index);
	await expectHeadLanding(preview, docs);
	const polyfillHrefs = [...polyfillPaths].sort().map((path) => `/${path}`);
	const polyfillInLanding = [...index.landing, ...docs.landing].filter((href) =>
		polyfillPaths.has(pathOf(href).slice(1)),
	);
	if (polyfillInLanding.length > 0) {
		throw new Error(
			`Expected landing preloads to leave out the navigation polyfill, saw: ${polyfillInLanding.join(', ')}`,
		);
	}
	const observabilityHrefs = await observabilityChunkHrefs(chunks, preview);
	return {
		index,
		docs,
		docsRound: intentRound(fragmentEntry, index.landing, docs.landing),
		homeRound: intentRound(fragmentEntry, docs.landing, index.landing),
		observabilityHrefs,
		observabilityPaths: new Set(observabilityHrefs.map(pathOf)),
		polyfillHrefs,
	};
}

// The swap module plus the destination landing code the current document has not already preloaded.
function intentRound(
	fragmentEntry: string,
	current: readonly string[],
	destination: readonly string[],
): string[] {
	const present = new Set(current.map(pathOf));
	return [...new Set([fragmentEntry, ...destination].map(pathOf))]
		.filter((href) => !present.has(href))
		.sort();
}

async function expectHeadLanding(preview: Preview, route: RoutePlan): Promise<void> {
	const placement = modulePreloadPlacement(await preview.request(route.path));
	if (placement.bodyCount > 0)
		throw new Error(
			`Expected ${route.path} modulepreloads as head <link> elements only, saw ${placement.bodyCount} in body.`,
		);
	const head = [...placement.hrefs].map(pathOf).sort();
	const landing = [...route.landing].map(pathOf).sort();
	if (head.length !== new Set(head).size || head.join('\n') !== landing.join('\n'))
		throw new Error(
			`Expected ${route.path} head to preload exactly its landing code.\nexpected: ${landing.join(', ')}\nsaw: ${head.join(', ')}`,
		);
}

function demandClosure(
	chunks: ReadonlyMap<string, string>,
	landing: readonly string[],
	routeImportPaths: ReadonlySet<string>,
): string[] {
	const paths = new Set(landing.map((href) => pathOf(href).slice(1)));
	for (const path of paths) {
		const code = chunks.get(path);
		if (!code) continue;
		addStaticImports(paths, code);
		addDynamicImports(paths, code, (candidate) => !routeImportPaths.has(candidate));
	}
	return [...paths].map((path) => '/' + path);
}

async function expectLandingRound(
	page: Page,
	plan: DeliveryPlan,
	route: RoutePlan,
	receipt: Receipt,
	label: string,
): Promise<readonly Request[]> {
	const landing = await waitForRequests(page, route.landing);
	receipt.note(`${label} landing round:\n${timeline(landing)}`);
	expectOneRound(landing, `${label} landing round`);
	const startup = jsBuildRequests(await page.networkRequests()).filter(
		(request) =>
			!landing.some(same(request)) && !plan.observabilityPaths.has(pathOf(request.url)),
	);
	const foreign = new Set(route.foreign);
	const wasted = startup.filter((request) => foreign.has(pathOf(request.url)));
	if (wasted.length > 0)
		throw new Error(
			`Expected ${label} startup to leave other routes' code for intent, saw:\n${timeline(wasted)}`,
		);
	if (startup.length > 0)
		throw new Error(
			`Expected ${label} startup JS to be only its landing preloads, saw:\n${timeline(startup)}`,
		);
	return landing;
}

// Press intent and the click arrive in one gesture on a slow page, and the idle tier may run first on a
// fast one: either way the destination fragment and its landing code form one round and nothing follows.
async function expectIntentRound(
	page: Page,
	plan: DeliveryPlan,
	receipt: Receipt,
	input: {
		readonly label: string;
		readonly path: string;
		readonly round: readonly string[];
		readonly landing: readonly Request[];
		readonly navigate: () => Promise<void>;
	},
): Promise<'before the click' | 'with the click'> {
	await waitForSettledNetwork(page);
	const before = await page.networkRequests();
	const preClick = appRequests(before, plan).filter(
		(request) =>
			!input.landing.some(same(request)) && !plan.observabilityPaths.has(pathOf(request.url)),
	);
	const preClickSettled = page.settledRequests
		? preClick.filter((request) => !page.settledRequests!.some(same(request)))
		: preClick;
	await input.navigate();
	await waitForSettledNetwork(page);
	const after = await page.networkRequests();
	const clickRequests = appRequests(after.slice(before.length), plan).filter(
		(request) => !plan.observabilityPaths.has(pathOf(request.url)),
	);
	const round = [...preClickSettled, ...clickRequests];
	receipt.note(`${input.label} intent round:\n${timeline(round)}`);
	const expected = [...input.round, input.path].sort();
	const seen = round.map((request) => pathOf(request.url)).sort();
	if (seen.join('\n') !== expected.join('\n'))
		throw new Error(
			`Expected ${input.label} to fetch its fragment and landing code once each, nothing more.\nexpected: ${expected.join(', ')}\nsaw:\n${timeline(round)}`,
		);
	const fragment = round.find((request) => pathOf(request.url) === input.path)!;
	if (fragment.resourceType === 'Document')
		throw new Error(`Expected ${input.label} to fetch a fragment, not a document.`);
	expectOneRound(round, `${input.label} intent round`);
	if (preClickSettled.length > 0 && clickRequests.length > 0)
		throw new Error(
			`Expected the click after the ${input.label} idle round to fetch nothing, saw:\n${timeline(clickRequests)}`,
		);
	page.settledRequests = after;
	return preClickSettled.length > 0 ? 'before the click' : 'with the click';
}

async function expectNothingWasted(page: Page, plan: DeliveryPlan, label: string): Promise<void> {
	const requests = await page.networkRequests();
	const documents = requests.filter((request) => request.resourceType === 'Document');
	if (documents.length !== 1)
		throw new Error(
			`Expected ${label} fragment navigation to avoid a server document round trip, saw:\n${timeline(documents)}`,
		);
	const graph = requests.filter((request) => pathOf(request.url) === BUNDLE_GRAPH_REQUEST);
	if (graph.length > 0)
		throw new Error(
			`Expected ${label} to avoid browser bundle graph fetches, saw:\n${timeline(graph)}`,
		);
	const polyfill = new Set(plan.polyfillHrefs);
	const polyfillRequests = jsBuildRequests(requests).filter((request) =>
		polyfill.has(pathOf(request.url)),
	);
	if (polyfillRequests.length > 0)
		throw new Error(
			`Expected ${label} to leave the navigation polyfill unloaded where the Navigation API exists, saw:\n${timeline(polyfillRequests)}`,
		);
	const seen = new Set<string>();
	const repeated = appRequests(requests, plan).filter((request) => {
		const path = pathOf(request.url);
		if (!seen.has(path)) return void seen.add(path);
		return true;
	});
	if (repeated.length > 0)
		throw new Error(`Expected ${label} to fetch each file once, saw:\n${timeline(repeated)}`);
}

function expectOneRound(requests: readonly Request[], label: string): void {
	const firstEnd = Math.min(
		...requests.map((request) => request.endTimeMs ?? Number.POSITIVE_INFINITY),
	);
	const late = requests.filter((request) => request.startTimeMs >= firstEnd);
	if (late.length > 0)
		throw new Error(
			`Expected ${label} to start in one round, saw requests start after another finished:\n${timeline(requests)}`,
		);
}

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

function navigationPolyfillChunkRecorder(): {
	readonly plugin: Plugin;
	chunkPaths(): ReadonlySet<string>;
} {
	const polyfillIds = new Set<string>();
	const chunkPaths = new Set<string>();
	return {
		plugin: {
			name: 'box:navigation-polyfill-chunks',
			enforce: 'pre',
			async resolveId(source, importer, options) {
				if (source !== NAVIGATION_POLYFILL_MODULE) return null;
				const resolved = await this.resolve(source, importer, {
					...options,
					skipSelf: true,
				});
				if (resolved) polyfillIds.add(resolved.id);
				return null;
			},
			// Final names: Markless renames chunks to content hashes in its post-order generateBundle.
			writeBundle(_options, bundle) {
				if (this.environment?.name !== 'client') return;
				for (const output of Object.values(bundle)) {
					if (
						output.type === 'chunk' &&
						output.facadeModuleId &&
						polyfillIds.has(output.facadeModuleId)
					)
						chunkPaths.add(publicBuildPath(output.fileName) ?? output.fileName);
				}
			},
		},
		chunkPaths: () => chunkPaths,
	};
}

function publicBuildPath(path: string): string | undefined {
	const index = path.indexOf('build/');
	return index === -1 || !path.endsWith('.js') ? undefined : path.slice(index);
}

async function observabilityChunkHrefs(
	chunks: ReadonlyMap<string, string>,
	preview: Preview,
): Promise<string[]> {
	const hrefs = new Set<string>();
	for (const [moduleId, entry] of Object.entries(await executionSizes(preview))) {
		if (
			typeof entry?.chunk === 'string' &&
			isObservabilityChunk(chunks, moduleId, entry.chunk)
		) {
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

async function executionSizes(
	preview: Preview,
): Promise<Record<string, { readonly chunk?: string }>> {
	try {
		return JSON.parse(await preview.request(EXECUTION_SIZES_REQUEST)) as Record<
			string,
			{ readonly chunk?: string }
		>;
	} catch {
		return {};
	}
}

function isObservabilityChunk(
	chunks: ReadonlyMap<string, string>,
	moduleId: string,
	path: string,
): boolean {
	const code = chunks.get(path) ?? '';
	return (
		moduleId === 'web:dev-log' ||
		moduleId === 'web:execution-log-target' ||
		code.includes('virtual:markless:dev-log')
	);
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
		// Link elements only: the inline link bridge spells the selector `link[rel="modulepreload"]` in its source.
		bodyCount: bodyStart === -1 ? 0 : modulePreloadHrefs(html.slice(bodyStart)).length,
		hrefs: headEnd === -1 ? [] : modulePreloadHrefs(html.slice(0, headEnd)),
	};
}

async function builtImportMap(): Promise<Record<string, string>> {
	const file = marklessImportMapPath(`${FIXTURE}/${NITRO_OUTPUT_DIR}/public`);
	if (!existsSync(file)) return {};
	const parsed = JSON.parse(await readFile(file, 'utf8')) as {
		readonly imports?: Record<string, string>;
	};
	return parsed.imports ?? {};
}

// Packed chunks import each other through import-map specifiers; spell them as the sibling files they name.
function withRelativeChunkSpecifiers(
	code: string,
	imports: Readonly<Record<string, string>>,
): string {
	return code.replace(
		new RegExp(`([\`"'])(${MARKLESS_CHUNK_SPECIFIER_PREFIX}[^\`"']+)\\1`, 'g'),
		(whole, quote: string, specifier: string) => {
			const target = imports[specifier];
			return target?.startsWith('/build/')
				? `${quote}./${target.slice('/build/'.length)}${quote}`
				: whole;
		},
	);
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

function addStaticImports(matches: Set<string>, code: string): boolean {
	return addPaths(
		matches,
		[...code.matchAll(/(?:import|export)[^;]*?from[`"']\.\/(chunk-[^`"']+\.js)[`"']/g)].map(
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

// Build JS plus same-origin page fetches: everything a navigation can pull, minus the landing document.
function appRequests(requests: readonly Request[], plan: DeliveryPlan): Request[] {
	const pages = new Set([plan.index.path, plan.docs.path]);
	return requests.filter(
		(request) =>
			jsBuildRequests([request]).length > 0 ||
			(request.resourceType !== 'Document' && pages.has(pathOf(request.url))),
	);
}

async function expectRouteDemandJs(
	page: Page,
	receipt: Receipt,
	label: string,
	action: () => Promise<void>,
): Promise<void> {
	await waitForSettledNetwork(page);
	const before = await page.networkRequests();
	const observability = new Set((page.allowedLazyHrefs ?? []).map(pathOf));
	if (page.settledRequests) {
		const previous = new Set(page.settledRequests.map((request) => request.url));
		const background = jsBuildRequests(before).filter(
			(request) => !previous.has(request.url) && !observability.has(pathOf(request.url)),
		);
		if (background.length)
			throw new Error(
				`Unexpected application requests between actions:\n${timeline(background)}`,
			);
	}
	await action();
	await waitForSettledNetwork(page);
	const after = await page.networkRequests();
	const allowed = new Set(
		[...(page.demandHrefs ?? []), ...(page.allowedLazyHrefs ?? [])].map(pathOf),
	);
	const requests = jsBuildRequests(after.slice(before.length));
	receipt.note(`${label} demand phase:\n${timeline(requests)}`);
	const unexpected = requests.filter((request) => !allowed.has(pathOf(request.url)));
	if (unexpected.length)
		throw new Error(
			`Expected only the route's landing code dependency closure or observability requests during ${label}:\n${timeline(unexpected)}`,
		);
	page.settledRequests = after;
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

async function waitForRequests(
	page: Page,
	expectedHrefs: readonly string[],
): Promise<readonly Request[]> {
	const expectedPaths = expectedHrefs.map((href) => pathOf(href));
	const start = Date.now();
	let latest: readonly Request[] = [];
	while (Date.now() - start < WAIT.timeoutMs) {
		latest = (await page.networkRequests()).filter(
			(request) =>
				request.resourceType !== 'Document' && expectedPaths.includes(pathOf(request.url)),
		);
		const paths = new Set(latest.map((request) => pathOf(request.url)));
		if (expectedPaths.every((path) => paths.has(path))) return latest;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	throw new Error(`Expected requests for ${expectedPaths.join(', ')}, saw:\n${timeline(latest)}`);
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
			return `${request.resourceType ?? '?'} ${pathOf(request.url)} ${request.status ?? '?'} start=${start}ms end=${end}ms duration=${duration}ms`;
		})
		.join('\n');
}

function same(request: Request): (other: Request) => boolean {
	return (other) => other.url === request.url && other.startTimeMs === request.startTimeMs;
}
