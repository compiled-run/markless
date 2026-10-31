import type { PageProps } from '../../index.ts';
import {
	LINK_ATTRIBUTE,
	PREFETCH_ATTRIBUTE,
	REPLACE_ATTRIBUTE,
	SCROLL_ATTRIBUTE,
} from '../../link-attributes.ts';
import {
	HTML_ATTRIBUTES_SLOT,
	ROUTE_SCRIPT_TYPE,
	SERVED_BODY_ATTRIBUTES_PROPERTY,
	SERVED_HTML_ATTRIBUTES_PROPERTY,
	servedHtmlAttributesScript,
} from '../../route-dom.ts';
import {
	buildRouteManifestFromFileIds,
	matchRouteManifest,
	normalizeRouteFileId,
} from '../../route-manifest.ts';
import {
	renderToString,
	type ModulePreloadInput,
	type RenderHeadInjection,
	type SsrRenderArtifact,
} from '@markless/web/render-to-string';
import {
	renderToStream,
	STREAM_ARM_EXECUTOR_GLOBAL,
	STREAMED_ARM_SELECTOR,
} from '@markless/web/render-to-stream';
import { CONTAINER_RETIRE_PROPERTY } from '@markless/web/render-to-string';
import {
	CONTAINER_ATTRIBUTE,
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
	PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
	PROTOCOL_STREAM_OPEN_PROPERTY,
} from '@markless/web/fns/container-region';
import {
	installKeepParts,
	PROTOCOL_KEEP_ATTRIBUTE,
	PROTOCOL_OWN_ATTRIBUTE,
} from '@markless/web/fns/keep-parts';
import {
	normalizeMarklessDevError,
	renderMarklessDevErrorDocument,
} from '@markless/bundler/dev-error';
import { __marklessDebugBootstrapSource } from '../../../../web/src/debug-channel.ts';
import { appendModulePreloads, listenForLinkIntent } from '../link-intent.ts';
import {
	LINK_BRIDGE_SCRIPT_ATTRIBUTE,
	LINK_TABLE_SCRIPT_ATTRIBUTE,
	linkBridgeModulePath,
} from './link-bridge-module.ts';
import { documentHandlersMessage } from './document-handlers.ts';
import { createPageHttp } from './page-http.ts';
import { MARKLESS_NAV_SETTLE_DEADLINE_MS } from '../../navigation-timing.ts';
import { fragmentPage, placePage, splitPageHtml, type PageHtml } from './page-region.ts';
import {
	FRAGMENT_APPEND_END,
	FRAGMENT_HOVER_DWELL_MS,
	FRAGMENT_IDLE_BYTES_PER_SECOND,
	FRAGMENT_IDLE_FRAGMENTS,
	FRAGMENT_IDLE_MEASURED_BYTES,
	FRAGMENT_IDLE_FRAGMENT_BYTES,
	FRAGMENT_IDLE_WITHOUT_CONNECTION_INFO,
	FRAGMENT_PREFETCH_TTL_MS,
	FRAGMENT_PREFETCH_CONNECTIONS,
	FRAGMENT_REGION_END,
	FRAGMENT_PATH_PREFIX,
	fragmentPageUrl,
	runFragmentNavigation,
	startFragmentNavigation,
	type FragmentNavigationConfig,
} from '../fragment-navigation.ts';
import type { FragmentPreload } from '../entries/fragment-entry.ts';

export interface ServerEntryOptions {
	readonly dev?: boolean;
	// The app's public base path; the shared link bridge module sits under it.
	readonly base?: string;
	readonly navigationEntryPath?: string;
	// false: nothing is downloaded before a click (no intent or idle prefetch); links still navigate.
	readonly prefetch?: boolean;
	readonly resumeEntryPath?: string;
	readonly prerenderWakeEntryPath?: string;
	readonly routeModulePreloads?: Record<string, readonly ModulePreloadInput[]>;
	readonly routeSsrModulePreloads?: Record<string, readonly ModulePreloadInput[]>;
	// Per route: the built chunk holding its resume module and the export that evaluates it; the route script carries it.
	readonly routeResumeModules?: Readonly<Record<string, readonly string[]>>;
	readonly routeStylesheets?: Record<string, readonly string[]>;
	// The document shell's scoped CSS, linked on every route ahead of the route's own.
	readonly documentStylesheets?: readonly string[];
	// `<script type="importmap">` resolving the chunk specifiers built chunks import each other by.
	readonly importMap?: string;
	readonly documentModuleLoader: (() => Promise<unknown>) | undefined;
	// 'document' when document.tsrx renders from the request URL: Links then load a fresh document.
	readonly documentNavigation?: 'client' | 'document';
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly routeFileIds: readonly string[];
	// Out-of-order streaming IS the default (owner ruling 2026-07-07): pages
	// flush with @pending arms in place and settled arms append on the same
	// open response. 'blocking' opts a host out — the document awaits every
	// boundary before the first byte (the pre-T107 behavior).
	readonly render?: 'streaming' | 'blocking';
	// Route changes swap in the destination's server-rendered region and resume it ('fragment', the default); 'render' renders it client-side.
	readonly navigation?: 'fragment' | 'render';
	// The fragment swap module; without it route changes render client-side.
	readonly fragmentEntryPath?: string;
	// The files the fragment entry statically imports, preloaded beside it.
	readonly fragmentEntryImports?: readonly string[];
	// The inline half of fragment navigation, minified by the build (the source form serves otherwise).
	readonly fragmentNavigationSource?: string;
	// The half of fragment navigation the bridge loads on the first link intent or at idle, minified the same way.
	readonly fragmentNavigationRunSource?: string;
	// The link bridge files the build wrote into the client output; without them the entry derives the paths itself.
	readonly linkBridgePaths?: readonly [withoutHashLinks: string, withHashLinks: string];
}

interface RenderOutput {
	readonly html: string;
	readonly state?: unknown;
	readonly view?: unknown;
}

type SsrRender = (props?: unknown, renderContext?: unknown) => RenderOutput | Promise<RenderOutput>;

interface SsrArtifact {
	readonly renderSsr?: SsrRender;
	readonly resumeModuleUrl?: string;
	readonly prerenderWakeModuleUrl?: string;
	readonly inlineResumerSources?: SsrRenderArtifact['inlineResumerSources'];
	readonly headInjections?: ReadonlyArray<RenderHeadInjection>;
	readonly storageSeeds?: SsrRenderArtifact['storageSeeds'];
}

interface PageModule {
	readonly default?: SsrArtifact;
	readonly marklessRenderSsr?: SsrRender;
}

interface DocumentModule {
	readonly default?: SsrArtifact;
	readonly __marklessRouterHtmlAttributes?: (
		props: PageComponentProps,
	) => Record<string, unknown>;
}

type PageComponentProps = PageProps & Record<string, unknown>;

const DOCUMENT_CHILDREN_PLACEHOLDER = '__markless_router_document_children__';

export type LinkBridgeOptions = Pick<
	ServerEntryOptions,
	| 'base'
	| 'navigationEntryPath'
	| 'prefetch'
	| 'documentNavigation'
	| 'navigation'
	| 'fragmentEntryPath'
	| 'fragmentEntryImports'
	| 'fragmentNavigationSource'
	| 'fragmentNavigationRunSource'
	| 'routeFileIds'
> & {
	// The build computes the bridge outside the bundle, where markless()'s debug define does not reach.
	readonly debug?: boolean;
};

function fragmentBridgeFor(
	options: LinkBridgeOptions,
	manifest: ReturnType<typeof buildRouteManifestFromFileIds>,
): FragmentBridge | undefined {
	return options.fragmentEntryPath !== undefined && options.navigation !== 'render'
		? {
				entry: options.fragmentEntryPath,
				entryImports: options.fragmentEntryImports ?? [],
				source: options.fragmentNavigationSource ?? startFragmentNavigation.toString(),
				runSource: options.fragmentNavigationRunSource ?? runFragmentNavigation.toString(),
				prefetch: options.prefetch !== false,
				pages: manifest.routes.map((route) => route.pathname.replace(/:[^/]+/g, ':')),
			}
		: undefined;
}

/** The link bridge modules a built app's pages import; the build writes them as static client files. */
export function routerLinkBridgeModules(
	options: LinkBridgeOptions,
	manifest = buildRouteManifestFromFileIds(options.routeFileIds),
): LinkBridgeFiles | undefined {
	if (!options.navigationEntryPath) return undefined;
	const fragmentBridge = fragmentBridgeFor(options, manifest);
	return linkBridgeModules(
		options.base ?? '/',
		options.navigationEntryPath,
		fragmentBridge !== undefined || options.prefetch !== false,
		options.documentNavigation === 'document',
		fragmentBridge,
		options.debug,
	);
}

export function createServerEntry(options: ServerEntryOptions) {
	installKeepParts();
	const manifest = buildRouteManifestFromFileIds(options.routeFileIds);
	assertCurrentRouteAssets(options);
	const fragmentBridge = fragmentBridgeFor(options, manifest);
	const fragmentNavigation = fragmentBridge !== undefined;
	const linkBridgeModules =
		options.dev || options.linkBridgePaths
			? undefined
			: routerLinkBridgeModules(options, manifest);
	const linkBridges: readonly [string, string] | undefined = options.dev
		? undefined
		: (options.linkBridgePaths ??
			(linkBridgeModules && [linkBridgeModules[0].path, linkBridgeModules[1].path]));

	// A press preloads the stylesheets a destination adds beside its page: its route's, and those its document writes for its URL.
	const documentHeads = new Map<string, Promise<readonly string[]>>();
	function pageStylesheetsAt(
		url: URL,
		match: NonNullable<ReturnType<typeof matchRouteManifest>>,
		documentModule: DocumentModule | undefined,
		request: Request,
	): Promise<readonly string[]> {
		const own = pageStylesheets(options, match.route.file) ?? [];
		if (options.documentNavigation !== 'document' || !documentModule)
			return Promise.resolve(own);
		const key = url.pathname + url.search;
		let head = documentHeads.get(key);
		if (!head) {
			if (documentHeads.size >= 1000)
				documentHeads.delete(documentHeads.keys().next().value!);
			const props: PageComponentProps = {
				http: createPageHttp(request, url).context,
				params: match.params,
				url: { href: url.href, pathname: url.pathname, search: url.search },
				status: 200,
			};
			head = renderDocumentShell(documentModule, props, '').then(stylesheetHrefs, () => []);
			documentHeads.set(key, head);
		}
		return head.then((hrefs) => [...new Set([...own, ...hrefs])]);
	}

	async function fetch(request: Request): Promise<Response> {
		const requestUrl = new URL(request.url);
		const fragmentUrl = fragmentNavigation ? fragmentPageUrl(requestUrl) : undefined;
		const fragment = fragmentUrl !== undefined;
		const url = fragmentUrl ?? requestUrl;
		const match = matchRouteManifest(url.pathname, manifest);
		// Under the endpoint prefix only a page file in pages/api/ answers; a root catch-all never does.
		if (
			isNitroApiPathname(url.pathname) &&
			!(match && isNitroApiPathname(match.route.pathname))
		) {
			return new Response('Not found', createPageHttp(request, url).commit(404, {}));
		}
		if (!match) {
			return renderStatusPage(
				url,
				manifest.statusPages.notFound,
				404,
				'Not found',
				fragment,
				request,
			);
		}

		try {
			return await renderPage(url, match.route.file, match.params, 200, fragment, request);
		} catch (error) {
			// Surface the stack: a silent 500 hid the async-renderSsr break.
			console.error('[markless-router] page render failed:', error);
			if (options.dev) {
				return renderDevelopmentError(url, error);
			}
			try {
				return await renderStatusPage(
					url,
					manifest.statusPages.error,
					500,
					'Internal Server Error',
					fragment,
					request,
				);
			} catch (errorPageError) {
				console.error('[markless-router] error page render failed:', errorPageError);
				return new Response('Internal Server Error', {
					status: 500,
					headers: { 'content-type': 'text/plain;charset=utf-8' },
				});
			}
		}
	}

	function renderDevelopmentError(url: URL, error: unknown): Response {
		const headers = {
			'cache-control': 'no-store',
			'content-type': 'text/html;charset=utf-8',
		};
		try {
			const payload = normalizeMarklessDevError(error, {
				id: `navigation:${url.pathname}`,
			});
			return new Response(renderMarklessDevErrorDocument(payload), {
				status: 500,
				headers,
			});
		} catch {
			return new Response(escapeHtml(flattenError(error)), {
				status: 500,
				headers: {
					...headers,
					'content-type': 'text/plain;charset=utf-8',
				},
			});
		}
	}

	async function renderStatusPage(
		url: URL,
		file: string | undefined,
		status: number,
		fallbackText: string,
		fragment: boolean,
		request: Request,
	) {
		if (!file) {
			return new Response(fallbackText, createPageHttp(request, url).commit(status, {}));
		}

		return renderPage(url, file, {}, status, fragment, request);
	}

	async function renderPage(
		url: URL,
		file: string,
		params: Readonly<Record<string, string>>,
		status: number,
		fragment: boolean,
		request: Request,
	) {
		const loadPageModule = options.pageModuleLoaders[file];
		if (!loadPageModule) {
			return new Response(`Page module not found: ${file}`, { status: 500 });
		}

		const cookie = request.headers.get('cookie');
		const pageModule = (await loadPageModule()) as PageModule;
		const http = createPageHttp(request, url);
		const pageProps: PageComponentProps = {
			http: http.context,
			params,
			url: {
				href: url.href,
				pathname: url.pathname,
				search: url.search,
			},
			status,
		};
		const documentModule = options.documentModuleLoader
			? ((await options.documentModuleLoader()) as DocumentModule)
			: undefined;
		const headers: Record<string, string> = { 'content-type': 'text/html;charset=utf-8' };

		const baseArtifact = pageModule.default;
		const renderSsr = baseArtifact?.renderSsr ?? pageModule.marklessRenderSsr;
		if (!renderSsr) {
			const shell = await renderDocumentShell(documentModule, pageProps, '');
			const message = `Page module must export a Markless compiled artifact: ${escapeHtml(file)}`;
			return new Response(fillDocumentChildren(shell, message), http.commit(status, headers));
		}
		const documentLoads = options.documentNavigation === 'document';
		const linkIntent = fragmentNavigation || options.prefetch !== false;
		// A document load or a fragment swap runs the destination's landing plan, not its client-navigation modules.
		const destinationPreloads =
			documentLoads || fragmentNavigation
				? options.routeSsrModulePreloads
				: options.routeModulePreloads;
		const pageArtifact = routedPageArtifact(
			renderSsr,
			baseArtifact,
			pageProps,
			{
				file,
				...(options.routeResumeModules?.[file]
					? { resume: options.routeResumeModules[file] }
					: {}),
			},
			options.navigationEntryPath,
			pageStylesheets(options, file),
			documentModule?.default?.headInjections ?? [],
			linkIntent
				? (html: string) =>
						linkIntentPreloads(
							html,
							pageProps.url.href,
							manifest,
							destinationPreloads,
							fragmentNavigation,
							fragmentNavigation
								? (destination, match) =>
										pageStylesheetsAt(
											destination,
											match,
											documentModule,
											request,
										)
								: undefined,
						)
				: undefined,
			documentLoads,
			fragmentBridge,
			linkBridges,
		);
		let rendersStorage = false;
		const routedArtifact = {
			...pageArtifact,
			...(options.prerenderWakeEntryPath
				? { prerenderWakeModuleUrl: options.prerenderWakeEntryPath }
				: {}),
			async renderSsr(renderProps?: unknown, renderContext?: unknown) {
				const output = await pageArtifact.renderSsr(renderProps, renderContext);
				if (documentStorageRecords(output.state).length > 0) rendersStorage = true;
				return output;
			},
		};
		// A page that renders storage() depends on the visitor's cookies, with or without one: no shared cache may reuse it.
		const privateToVisitor = () => {
			if (!rendersStorage) return;
			headers['cache-control'] = 'private';
			headers.vary = headers.vary ? `${headers.vary}, cookie` : 'cookie';
		};
		const renderOptions = {
			cookie,
			props: pageProps,
			resumeModuleUrl: options.resumeEntryPath ?? baseArtifact?.resumeModuleUrl,
			modulePreloads: (html: string, resumes: boolean) =>
				landingModulePreloads(
					resumes ? options.routeSsrModulePreloads?.[file] : undefined,
					linkBridges?.[html.includes('href="#/') ? 1 : 0],
				),
		};

		// A landing the router swaps away from needs its served <html> and <body> attributes: scripts may change them before it runs.
		// A navigation lands in a document whose import map already resolves every chunk, and a later map could not change it.
		const headStart =
			(fragmentNavigation && !fragment ? servedHtmlAttributesScript() : '') +
			(fragment ? '' : (options.importMap ?? ''));

		// Blocking opt-out: the pre-T107 whole-page await.
		if (options.render === 'blocking') {
			const pageHtml = splitPageHtml(
				await renderToString(routedArtifact as never, renderOptions),
			);
			privateToVisitor();
			const shell = await renderDocumentShell(
				documentModule,
				pageProps,
				pageHtml.headHtml,
				headStart,
			);
			return new Response(
				wholeDocument(shell, pageHtml, fragment, documentLoads),
				http.commit(status, headers),
			);
		}

		// Streaming default (owner ruling 2026-07-07): out-of-order streaming is
		// the point of @try — boundaries whose data beats the first-flush
		// deadline render inline; the rest flush @pending and settle on the
		// same open response.
		const stream = await renderToStream(routedArtifact as never, renderOptions);
		privateToVisitor();
		const pageHtml = splitPageHtml(stream.shell);
		const shell = await renderDocumentShell(
			documentModule,
			pageProps,
			pageHtml.headHtml,
			headStart,
		);
		if (stream.pendingArmCount === 0) {
			return new Response(
				wholeDocument(shell, pageHtml, fragment, documentLoads),
				http.commit(status, headers),
			);
		}
		const placed = placePage(shell, DOCUMENT_CHILDREN_PLACEHOLDER, pageHtml);
		// A fragment is a whole region document first; each settled arm then follows on its own, delimited.
		const prefix = fragment
			? fragmentDocument(shell, pageHtml, documentLoads) + FRAGMENT_REGION_END
			: placed.prefix;
		const suffix = fragment ? '' : placed.suffix;
		const appendEnd = fragment ? FRAGMENT_APPEND_END : '';
		const encoder = new TextEncoder();
		const sent = http.commit(status, headers);
		let cancelled = false;
		let completed = false;
		const body = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(encoder.encode(prefix));
				try {
					for await (const chunk of stream.appends()) {
						if (cancelled) return;
						controller.enqueue(encoder.encode(chunk + appendEnd));
					}
				} catch (error) {
					if (cancelled) return;
					// Headers already flushed: fail the stream loudly instead of
					// serving a document that silently never settles.
					console.error('[markless-router] streaming settle failed:', error);
					controller.error(error);
					completed = true;
					return;
				}
				if (cancelled) return;
				if (suffix) controller.enqueue(encoder.encode(suffix));
				controller.close();
				completed = true;
			},
			cancel(reason) {
				if (completed) return;
				cancelled = true;
				stream.cancel(reason);
			},
		});
		return new Response(body, sent);
	}

	return { fetch, linkBridgeModules };
}

function flattenError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (
		typeof error === 'object' &&
		error !== null &&
		'message' in error &&
		typeof error.message === 'string'
	) {
		return error.message;
	}
	return String(error);
}

function assertCurrentRouteAssets(options: ServerEntryOptions): void {
	// routeStylesheets is the persisted client-manifest signal. Existing manual
	// adapters may provide only module preloads, while dev leaves this undefined.
	if (options.routeStylesheets === undefined) return;
	const routeMaps = [
		['navigation', options.routeModulePreloads ?? {}],
		['SSR', options.routeSsrModulePreloads ?? {}],
		['style', options.routeStylesheets],
	] as const;
	const expected = [...new Set(options.routeFileIds.map(normalizeRouteFileId))]
		.filter((file) => /^pages\/.+\.(?:tsrx|mdx)$/.test(file))
		.toSorted();
	for (const [label, routes] of routeMaps) {
		const actual = Object.keys(routes).toSorted();
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(
				`Markless Router ${label} client-asset routes are stale; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}. Rebuild the client environment before the server environment.`,
			);
		}
	}
}

// Wraps the compiled page renderSsr with the route script, the lazy Link
// bridge, and the serialized page-prop cell, FORWARDING the render context
// so streaming reaches the page's async boundaries (T107).
function dedupeHeadLinks(
	injections: ReadonlyArray<RenderHeadInjection>,
): ReadonlyArray<RenderHeadInjection> {
	const seen = new Set<string>();
	return injections.filter((injection) => {
		const href = injection.tag === 'link' ? injection.attributes?.href : undefined;
		if (typeof href !== 'string') return true;
		if (seen.has(href)) return false;
		seen.add(href);
		return true;
	});
}

function pageStylesheets(options: ServerEntryOptions, file: string): readonly string[] | undefined {
	const documentHrefs = options.documentStylesheets ?? [];
	const routeHrefs = options.routeStylesheets?.[file];
	if (documentHrefs.length === 0) return routeHrefs;
	return [...new Set([...documentHrefs, ...(routeHrefs ?? [])])];
}

function routedPageArtifact(
	renderSsr: SsrRender,
	baseArtifact: SsrArtifact | undefined,
	pageProps: PageComponentProps,
	route: RouteScript,
	navigationEntryPath: string | undefined,
	stylesheetHrefs: readonly string[] | undefined,
	documentHeadInjections: ReadonlyArray<RenderHeadInjection> = [],
	intentPreloads?: (html: string) => Promise<Record<string, readonly FragmentPreload[]>>,
	documentLoads = false,
	fragment?: FragmentBridge,
	linkBridgePaths?: readonly [string, string],
) {
	// The document's own injections (dev links its scoped-style closure there) come first: the shell's CSS precedes the page's.
	const headInjections = dedupeHeadLinks([
		...documentHeadInjections,
		...(baseArtifact?.headInjections ?? []),
		...(stylesheetHrefs ?? []).map((href): RenderHeadInjection => ({
			tag: 'link',
			location: 'head',
			attributes: { rel: 'stylesheet', href },
		})),
	]);
	return {
		resumeModuleUrl: baseArtifact?.resumeModuleUrl,
		inlineResumerSources: baseArtifact?.inlineResumerSources,
		storageSeeds: baseArtifact?.storageSeeds,
		...(headInjections.length > 0 ? { headInjections } : {}),
		async renderSsr(renderProps?: unknown, renderContext?: unknown): Promise<RenderOutput> {
			// Compiled marklessRenderSsr is async (initial render awaits demanded
			// async work); interpolating the un-awaited Promise served 500s.
			const output = await renderSsr(renderProps ?? pageProps, renderContext);
			if (!output) return { html: '' };
			const routeScript = output.state || output.view ? renderRouteScript(route) : '';
			// ONE lazy bridge, structure-triggered: it imports the navigation
			// runtime only on Link/'#/' anchor interaction, or at load when a
			// '#/' deep-link hash is actually present. No eager imports, no modes.
			const linkBridge = navigationEntryPath
				? renderLinkBridgeScript(
						navigationEntryPath,
						await intentPreloads?.(output.html),
						documentLoads,
						fragment,
						output.html.includes('href="#/'),
						linkBridgePaths,
					)
				: '';
			const stateWithProps = withPagePropsCell(output.state, pageProps);
			return routeScript || linkBridge || stateWithProps !== output.state
				? {
						...output,
						state: stateWithProps,
						html: `${output.html}${routeScript}${linkBridge}`,
					}
				: output;
		},
	};
}

// Symbol modules and props+state computeds re-running on a resumed page read
// page props through the graph's `prop:props` cell (need 14, SSR side). The
// live props ride the payload as a directValue cell; renderToString
// envelope-encodes it before the payload script is served. Pages that already
// seeded the cell, and pages without a resumability payload, are untouched.
function withPagePropsCell(state: unknown, props: PageComponentProps): unknown {
	if (!state || typeof state !== 'object') return state;
	const { http: _serverOnly, ...browserProps } = props;
	const cells = (state as { readonly cells?: ReadonlyArray<{ readonly graphNodeId?: unknown }> })
		.cells;
	if (!Array.isArray(cells) || cells.some((cell) => cell?.graphNodeId === 'prop:props')) {
		return state;
	}
	return {
		...state,
		cells: [
			...cells,
			{
				graphNodeId: 'prop:props',
				name: 'props',
				valueKind: 'object',
				directValue: browserProps,
			},
		],
	};
}

function landingModulePreloads(
	routePreloads: readonly ModulePreloadInput[] | undefined,
	linkBridgePath?: string,
): readonly ModulePreloadInput[] | undefined {
	const preloads: ModulePreloadInput[] = [];
	addModulePreloads(preloads, new Set(), routePreloads);
	// Low: Chromium sends a high-priority script ahead of first paint, and Lighthouse counts every one finished before it as render-blocking.
	const landing = preloads.map(lowFetchPriority);
	if (linkBridgePath) landing.push({ href: linkBridgePath, fetchPriority: 'low' });
	return landing.length > 0 ? landing : undefined;
}

function lowFetchPriority(preload: ModulePreloadInput): ModulePreloadInput {
	if (typeof preload === 'string') return { href: preload, fetchPriority: 'low' };
	return preload.fetchPriority ? preload : { ...preload, fetchPriority: 'low' };
}

function routerLinkHrefs(html: string): string[] {
	return [
		...html.matchAll(
			/<a\b(?=[^>]*\bdata-markless-router-link(?:[\s=>]|$))(?=[^>]*\bhref="([^"]*)")[^>]*>/g,
		),
	].map((match) => unescapeHtmlAttribute(match[1] ?? ''));
}

function anchorHrefs(html: string): string[] {
	return [...html.matchAll(/<a\b(?=[^>]*\bhref="([^"]*)")[^>]*>/g)].map((match) =>
		unescapeHtmlAttribute(match[1] ?? ''),
	);
}

type StylesheetsOf = (
	url: URL,
	match: NonNullable<ReturnType<typeof matchRouteManifest>>,
) => Promise<readonly string[]>;

async function linkIntentPreloads(
	html: string,
	baseHref: string,
	manifest: ReturnType<typeof buildRouteManifestFromFileIds>,
	routes: ServerEntryOptions['routeModulePreloads'],
	plainAnchors = false,
	stylesheetsOf?: StylesheetsOf,
): Promise<Record<string, readonly FragmentPreload[]>> {
	const destinations: Record<string, readonly FragmentPreload[]> = Object.create(null);
	const here = new URL(baseHref);
	const herePage = stylesheetsOf && matchRouteManifest(here.pathname, manifest);
	const have = new Set(herePage ? await stylesheetsOf(here, herePage) : []);
	for (const href of plainAnchors ? anchorHrefs(html) : routerLinkHrefs(html)) {
		const url = parseSameOriginUrl(href, baseHref);
		const match = url && matchRouteManifest(url.pathname, manifest);
		const preloads = match && routes?.[match.route.file];
		// A fragment destination with nothing to preload is still listed, so the idle tier fetches its page.
		if (
			!url ||
			!preloads ||
			(preloads.length === 0 && !plainAnchors) ||
			url.pathname in destinations
		)
			continue;
		const styles = stylesheetsOf
			? (await stylesheetsOf(url, match)).filter((href) => !have.has(href))
			: [];
		destinations[url.pathname] = styles.length
			? [...preloads, ...styles.map((href) => ({ href, as: 'style' as const }))]
			: preloads;
	}
	return destinations;
}

const STYLESHEET_LINK =
	/<link\b(?=[^>]*\brel="(?:[^"]*\s)?stylesheet(?:\s[^"]*)?")(?=[^>]*\bhref="([^"]*)")[^>]*>/g;

function stylesheetHrefs(html: string): string[] {
	return [...html.matchAll(STYLESHEET_LINK)].map((match) => unescapeHtmlAttribute(match[1]!));
}

function indexedPreloads(intentPreloads: Record<string, readonly FragmentPreload[]>): {
	readonly preloads: FragmentPreload[];
	readonly destinations: Record<string, number[]>;
} {
	const preloads: ModulePreloadInput[] = [];
	const indexes = new Map<string, number>();
	const destinations: Record<string, number[]> = Object.create(null);
	for (const [pathname, list] of Object.entries(intentPreloads))
		destinations[pathname] = list.map((preload) => {
			const key = JSON.stringify(preload);
			let index = indexes.get(key);
			if (index === undefined) {
				index = preloads.push(preload) - 1;
				indexes.set(key, index);
			}
			return index;
		});
	return { preloads, destinations };
}

function parseSameOriginUrl(href: string, base: string): URL | undefined {
	try {
		const current = new URL(base);
		const url = new URL(href, current);
		return url.origin === current.origin ? url : undefined;
	} catch {
		return undefined;
	}
}

function unescapeHtmlAttribute(value: string): string {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&gt;', '>')
		.replaceAll('&lt;', '<')
		.replaceAll('&amp;', '&');
}

function addModulePreloads(
	preloads: ModulePreloadInput[],
	seen: Set<string>,
	items: readonly ModulePreloadInput[] | undefined,
): void {
	for (const preload of items ?? []) {
		const preloadHref = typeof preload === 'string' ? preload : preload.href;
		if (!preloadHref || seen.has(preloadHref)) continue;
		seen.add(preloadHref);
		preloads.push(preload);
	}
}

// The document with the children placeholder INTACT: blocking responses fill
// it in one piece; streaming responses split at it so everything after the
// page (and the closing tags) flushes only when the last boundary settled.
async function renderDocumentShell(
	documentModule: DocumentModule | undefined,
	pageProps: PageComponentProps,
	headHtml: string,
	importMap = '',
): Promise<string> {
	const written: Record<string, unknown> = {};
	const documentHtml = await renderDocumentModule(
		documentModule,
		{ ...pageProps, children: DOCUMENT_CHILDREN_PLACEHOLDER },
		written,
	);
	const attributes = htmlAttributes(documentModule, pageProps, written);
	if (documentHtml !== undefined) {
		const { html, preloads } = takeHeadModulePreloads(insertHeadHtml(documentHtml, headHtml));
		return [
			'<!doctype html>',
			`<html${renderAttributes(attributes)}>`,
			insertHeadModulePreloads(insertImportMap(html, importMap), importMap, preloads),
			'</html>',
		].join('');
	}

	return [
		'<!doctype html>',
		`<html${renderAttributes(attributes)}>`,
		'<head>',
		'<meta charset="utf-8">',
		importMap,
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		headHtml,
		'</head>',
		'<body>',
		DOCUMENT_CHILDREN_PLACEHOLDER,
		'</body>',
		'</html>',
	].join('');
}

// indexOf/slice instead of String.replace: page html routinely contains '$'
// sequences that replace() would interpret as substitution patterns.
function fillDocumentChildren(documentShell: string, children: string): string {
	const at = documentShell.indexOf(DOCUMENT_CHILDREN_PLACEHOLDER);
	if (at === -1) return documentShell;
	return (
		documentShell.slice(0, at) +
		children +
		documentShell.slice(at + DOCUMENT_CHILDREN_PLACEHOLDER.length)
	);
}

function fragmentDocument(shell: string, page: PageHtml, documentLoads: boolean): string {
	if (!documentLoads) return fragmentPage(shell, DOCUMENT_CHILDREN_PLACEHOLDER, page);
	const placed = placePage(shell, DOCUMENT_CHILDREN_PLACEHOLDER, page);
	return placed.prefix + placed.suffix;
}

function wholeDocument(
	shell: string,
	page: PageHtml,
	fragment: boolean,
	documentLoads: boolean,
): string {
	if (fragment) return fragmentDocument(shell, page, documentLoads) + FRAGMENT_REGION_END;
	const placed = placePage(shell, DOCUMENT_CHILDREN_PLACEHOLDER, page);
	return placed.prefix + placed.suffix;
}

async function renderDocumentModule(
	documentModule: DocumentModule | undefined,
	props: PageComponentProps & { readonly children: string },
	htmlAttributes: Record<string, unknown>,
): Promise<string | undefined> {
	const output = await documentModule?.default?.renderSsr?.(props, {
		[HTML_ATTRIBUTES_SLOT]: htmlAttributes,
	});
	assertDocumentStorageFree(output);
	assertDocumentHandlerFree(output);
	return output?.html;
}

// A component the document renders can carry handlers its file never shows, and they would be dropped with the payload.
function assertDocumentHandlerFree(output: RenderOutput | undefined): void {
	const view = output?.view as
		| { readonly events?: ReadonlyArray<{ readonly eventName?: string }> }
		| undefined;
	const names = [...new Set((view?.events ?? []).map((event) => event.eventName))];
	if (names.length === 0) return;
	throw new Error(documentHandlersMessage(`the document renders ${names.join(', ')} handlers`));
}

// The shell takes the document's html and nothing else: its state payload is
// never served, so a storage() cell there resumes on no page. Fail loudly
// instead of serving a control that silently does nothing.
function assertDocumentStorageFree(output: RenderOutput | undefined): void {
	const storage = documentStorageRecords(output?.state);
	if (storage.length === 0) return;
	const keys = storage.map((record) => record.key).join(', ');
	throw new Error(
		`MARKLESS_ROUTER_DOCUMENT_STORAGE_UNSUPPORTED: the document declares storage cells (${keys}), but the router serves only the document's HTML, so their state payload never reaches the browser and they can never resume. Declare storage() at module scope in a component the page renders instead.`,
	);
}

function documentStorageRecords(state: unknown): ReadonlyArray<{ readonly key: string }> {
	if (!state || typeof state !== 'object') return [];
	const storage = (state as { readonly storage?: unknown }).storage;
	return Array.isArray(storage) ? (storage as ReadonlyArray<{ readonly key: string }>) : [];
}

// A modulepreload tag, or text a preload scan must step over whole: a comment or the content of a raw-text element.
const HEAD_SCAN =
	/<!--[\s\S]*?-->|<(script|style|template|noscript|textarea|title|xmp)\b[^>]*>[\s\S]*?<\/\1\s*>|(<link\b[^>]*\brel=["']?modulepreload\b[^>]*>)/gi;

// Firefox and Safari fetch a modulepreload only once the parser reaches it: the head's modulepreloads, the document's own included, are gathered and placed together.
function takeHeadModulePreloads(html: string): {
	readonly html: string;
	readonly preloads: string;
} {
	const headEnd = html.search(/<\/head>/i);
	if (headEnd === -1) return { html, preloads: '' };
	let preloads = '';
	const head = html.slice(0, headEnd).replace(HEAD_SCAN, (match, _raw, preload) => {
		if (!preload) return match;
		preloads += preload;
		return '';
	});
	return { html: head + html.slice(headEnd), preloads };
}

// Steps over comments and raw-text elements whole; captures a script's attributes, a template open or close, and a link tag.
const HEAD_ORDER_SCAN =
	/<!--[\s\S]*?-->|<script\b((?:[^"'>]|"[^"]*"|'[^']*')*)>[\s\S]*?<\/script\s*>|<(style|noscript|textarea|title|xmp)\b[^>]*>[\s\S]*?<\/\2\s*>|<(\/?)template\b[^>]*>|(<link\b(?:[^"'>]|"[^"]*"|'[^']*')*>)/gi;
const JAVASCRIPT_TYPE =
	/^(?:(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/;

// WebKit holds first paint for modulepreloads above a stylesheet, yet a classic head script waits for every stylesheet above it:
// the preloads go after the stylesheets that come before the first such script.
function insertHeadModulePreloads(html: string, importMap: string, preloads: string): string {
	if (!preloads) return html;
	const start = importMap ? html.indexOf(importMap) + importMap.length : headContentStart(html);
	const headEnd = html.slice(start).search(/<\/head\s*>/i);
	const head = headEnd === -1 ? html.slice(start) : html.slice(start, start + headEnd);
	let at = 0;
	let templates = 0;
	for (const match of head.matchAll(HEAD_ORDER_SCAN)) {
		if (match[3] !== undefined) templates = Math.max(0, templates + (match[3] ? -1 : 1));
		if (templates > 0) continue;
		if (match[1] !== undefined && isParserBlockingScript(match[1])) break;
		if (match[4] && /\brel=["']?(?:[^"'>]*\s)?stylesheet\b/i.test(match[4]))
			at = match.index + match[0].length;
	}
	return html.slice(0, start + at) + preloads + html.slice(start + at);
}

function isParserBlockingScript(attributes: string): boolean {
	const type = /(?:^|\s)type=["']?([^"'\s>]*)/i.exec(attributes)?.[1]?.toLowerCase() ?? '';
	if (type && !JAVASCRIPT_TYPE.test(type)) return false;
	return !(/(?:^|\s)src=/i.test(attributes) && /(?:^|\s)(?:async|defer)(?=[\s=/]|$)/i.test(attributes));
}

function insertHeadHtml(documentHtml: string, headHtml: string): string {
	if (!headHtml) return documentHtml;
	const headEnd = documentHtml.indexOf('</head>');
	if (headEnd === -1) return `${headHtml}${documentHtml}`;
	return `${documentHtml.slice(0, headEnd)}${headHtml}${documentHtml.slice(headEnd)}`;
}

interface RouteScript {
	readonly file: string;
	readonly resume?: readonly string[];
}

function renderRouteScript(route: RouteScript): string {
	return `<script type="${ROUTE_SCRIPT_TYPE}">${escapeScriptJson(route)}</script>`;
}

// Per page: the destinations this page links, and whether it links a '#/' route.
interface LinkBridgePage {
	readonly intentPreloads?: Record<string, readonly FragmentPreload[]>;
	readonly hashLinks: boolean;
}

// The same body serves inline (dev) or as a cached module whose default export takes the page's part.
function linkBridgeBody(
	resumeEntryPath: string,
	linkIntent: boolean,
	documentLoads: boolean,
	fragment: FragmentBridge | undefined,
	page:
		| LinkBridgePage
		| { readonly module: true; readonly hashLinks: boolean; readonly runPath?: string },
	debug = debugDefined(),
): string {
	const inline = !('module' in page);
	const fragmentNavigation = fragment !== undefined;
	const fragmentSource = fragment
		? `
(${fragment.source})(d,()=>${JSON.stringify(LINK_ATTRIBUTE)},${JSON.stringify(LINK_TABLE_SCRIPT_ATTRIBUTE)},(href)=>import(href),${'runPath' in page && page.runPath ? `()=>import(${JSON.stringify(page.runPath)}).then((m)=>m.default)` : `()=>Promise.resolve(${boundFragmentRun(fragment, documentLoads)})`},()=>(${fragment.prefetch ? escapeScriptJson({ code: [fragment.entry, ...fragment.entryImports], hoverDwellMs: FRAGMENT_HOVER_DWELL_MS, requestPrefix: FRAGMENT_PATH_PREFIX, prefetchAttribute: PREFETCH_ATTRIBUTE, idleBytesPerSecond: FRAGMENT_IDLE_BYTES_PER_SECOND, idleMeasuredBytes: FRAGMENT_IDLE_MEASURED_BYTES }) : 'null'}));`
		: '';
	const indexed =
		!fragmentNavigation && linkIntent
			? inline
				? (page as LinkBridgePage).intentPreloads &&
					indexedPreloads((page as LinkBridgePage).intentPreloads!)
				: { preloads: 'preloads', destinations: 'destinations' }
			: undefined;
	// Routes share most of their packs, so each is written once and routes list indexes into it.
	const intentSource = indexed
		? `
	const preloads = ${inline ? escapeScriptJson(indexed.preloads) : 'p'};
	const destinations = ${inline ? escapeScriptJson(indexed.destinations) : 'q'};
	const destination = (url) => destinations[url.pathname]?.map((index) => preloads[index]);
	const append = (${appendModulePreloads.toString()});
	(${listenForLinkIntent.toString()})(d, linkAttr, (url) => {
		append(d, destination(url));
	}, prefetchAttr);`
		: '';
	// Hash routes ('#/…') still render client-side; a fragment page carries that click path only when it links one.
	const hashClickSource =
		fragment && !page.hashLinks
			? ''
			: `
	if (d.__marklessRouterHashClickStarted) return;
	d.__marklessRouterHashClickStarted = true;
	const anchorFrom = (event) => {
		const target = event.composedPath && event.composedPath()[0] || event.target;
		return target && target.closest ? target.closest('a[href]') : target && target.parentElement && target.parentElement.closest ? target.parentElement.closest('a[href]') : null;
	};
	const sameOrigin = (href) => {
		try {
			const url = new URL(href, location.href);
			return url.origin === location.origin ? url : null;
		} catch {
			return null;
		}
	};
	d.addEventListener('click', async (event) => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
		const anchor = anchorFrom(event);
		if (!anchor || !anchor.hasAttribute(linkAttr) || anchor.hasAttribute('download')) return;
		const target = anchor.getAttribute('target');
		if (target && target !== '_self') return;
		if (anchor.relList && anchor.relList.contains('external')) return;
		const url = sameOrigin(anchor.href);
		if (!url${documentLoads || fragmentNavigation ? " || !url.hash.startsWith('#/')" : ''}) return;
		event.preventDefault();
		try {
			const mod = await import(${JSON.stringify(resumeEntryPath)});
			const navigate = mod.navigateMarklessRouterLink;
			if (typeof navigate === 'function') {
				await navigate({
					href: url.href,
					replace: anchor.hasAttribute(replaceAttr),
					scroll: anchor.getAttribute(scrollAttr) === 'manual' ? 'manual' : undefined,
				});
			} else {
				location.assign(url.href);
			}
		} catch (error) {
			setTimeout(() => { throw error; });
			location.assign(url.href);
		}
	}, true);`;
	const debugRegistration = debug
		? `
	try {
		const key = Symbol.for('markless.debug.channel.v1.bootstrap');
		const md = globalThis[key];
		if (md) { md.router('ssr-link-bridge'); md.activate(); }
	} catch {}`
		: '';
	return `${fragmentSource}${
		fragment && !hashClickSource
			? ''
			: `
if(d.__marklessRouterLinkResumerStarted${fragment ? '&&d.__marklessRouterHashClickStarted' : ''})return;d.__marklessRouterLinkResumerStarted=true;`
	}${
		intentSource || hashClickSource
			? `
	const linkAttr = ${JSON.stringify(LINK_ATTRIBUTE)};`
			: ''
	}${
		intentSource
			? `
	const prefetchAttr = ${JSON.stringify(PREFETCH_ATTRIBUTE)};`
			: ''
	}${
		hashClickSource
			? `
	const replaceAttr = ${JSON.stringify(REPLACE_ATTRIBUTE)};
	const scrollAttr = ${JSON.stringify(SCROLL_ATTRIBUTE)};`
			: ''
	}${intentSource}
if(location.hash&&location.hash.startsWith('#/'))import(${JSON.stringify(resumeEntryPath)}).catch(()=>{});${hashClickSource}${debugRegistration}`;
}

function debugDefined(): boolean {
	return typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__;
}

export interface LinkBridgeModule {
	readonly path: string;
	readonly source: string;
}

// Static client files, never inlined: pages share an immutable copy the browser caches, one per '#/' variant.
function linkBridgeModules(
	base: string,
	resumeEntryPath: string,
	linkIntent: boolean,
	documentLoads: boolean,
	fragment: FragmentBridge | undefined,
	debug: boolean | undefined,
): LinkBridgeFiles {
	const runSource = fragment && `export default ${boundFragmentRun(fragment, documentLoads)};`;
	const run: LinkBridgeModule | undefined = runSource
		? { path: linkBridgeModulePath(base, contentHash(runSource)), source: runSource }
		: undefined;
	const variant = (hashLinks: boolean): LinkBridgeModule => {
		const source = `export default(r,p,q)=>{const d=document;${linkBridgeBody(resumeEntryPath, linkIntent, documentLoads, fragment, { module: true, hashLinks, runPath: run?.path }, debug)}\n};`;
		return {
			path: linkBridgeModulePath(base, contentHash(source)),
			source,
		};
	};
	const withoutHashLinks = variant(false);
	const pages = [withoutHashLinks, fragment ? variant(true) : withoutHashLinks] as const;
	return run ? [...pages, run] : pages;
}

/** The two page-imported bridges (without and with '#/' links), then any file they load later. */
export type LinkBridgeFiles = readonly [
	withoutHashLinks: LinkBridgeModule,
	withHashLinks: LinkBridgeModule,
	...later: LinkBridgeModule[],
];

function contentHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let at = 0; at < text.length; at++)
		hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193);
	return (hash >>> 0).toString(36);
}

function renderLinkBridgeScript(
	resumeEntryPath: string,
	intentPreloads?: Record<string, readonly FragmentPreload[]>,
	documentLoads = false,
	fragment?: FragmentBridge,
	hashLinks = false,
	modulePaths?: readonly [string, string],
): string {
	const debugBootstrap =
		typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? `<script data-markless-router-debug-bootstrap>${escapeInlineScript(`(() => {
	const d = document;
	const s = d.currentScript;
	const r = s && s.closest('[data-async-container]');
	if (!r) return;
	try { globalThis[Symbol.for('markless.debug.channel.v1.bootstrap')] = ${__marklessDebugBootstrapSource()}(r, 'ssr-inline', false); } catch {}
})();`)}</script>`
			: '';
	// Inert JSON, each preload once: parsed at idle or on the first link intent, never evaluated at load.
	const table =
		fragment && intentPreloads && Object.keys(intentPreloads).length
			? (({ preloads, destinations }) =>
					`<script type="application/json" ${LINK_TABLE_SCRIPT_ATTRIBUTE}>${escapeScriptJson([preloads, destinations])}</script>`)(
					indexedPreloads(intentPreloads),
				)
			: '';
	const modulePath = modulePaths?.[hashLinks ? 1 : 0];
	if (modulePath) {
		const indexed = !fragment && intentPreloads ? indexedPreloads(intentPreloads) : undefined;
		const args = indexed
			? ['0', escapeScriptJson(indexed.preloads), escapeScriptJson(indexed.destinations)]
			: [];
		// Async: a module script waits for every one before it, so the document's own scripts would wait on this low-priority download.
		return `${debugBootstrap}${table}<script type="module" async ${LINK_BRIDGE_SCRIPT_ATTRIBUTE}>${escapeInlineScript(`import b from${JSON.stringify(modulePath)};b(${args.join(',')})`)}</script>`;
	}
	const body = linkBridgeBody(
		resumeEntryPath,
		intentPreloads !== undefined,
		documentLoads,
		fragment,
		{
			intentPreloads,
			hashLinks,
		},
	);
	return `${debugBootstrap}${table}<script ${LINK_BRIDGE_SCRIPT_ATTRIBUTE}>${escapeInlineScript(`(()=>{const d=document,s=d.currentScript,r=s&&s.closest('[data-async-container]');if(!r)return;${body}
})();`)}</script>`;
}

interface FragmentBridge {
	readonly entry: string;
	readonly source: string;
	readonly runSource: string;
	readonly entryImports: readonly string[];
	readonly prefetch: boolean;
	readonly pages: readonly string[];
}

// The run half with the app's config bound in, so the page bridge never carries the config.
function boundFragmentRun(fragment: FragmentBridge, documentLoads: boolean): string {
	return `(d,...a)=>(${fragment.runSource})(d,${escapeScriptJson(fragmentConfig(fragment, documentLoads))},...a)`;
}

function fragmentConfig(
	fragment: FragmentBridge,
	documentLoads: boolean,
): FragmentNavigationConfig {
	return {
		entry: fragment.entry,
		entryImports: fragment.entryImports,
		linkAttribute: LINK_ATTRIBUTE,
		prefetchAttribute: PREFETCH_ATTRIBUTE,
		replaceAttribute: REPLACE_ATTRIBUTE,
		scrollAttribute: SCROLL_ATTRIBUTE,
		routeScriptType: ROUTE_SCRIPT_TYPE,
		servedHtmlAttributesProperty: SERVED_HTML_ATTRIBUTES_PROPERTY,
		servedBodyAttributesProperty: SERVED_BODY_ATTRIBUTES_PROPERTY,
		retireProperty: CONTAINER_RETIRE_PROPERTY,
		streamExecutorGlobal: STREAM_ARM_EXECUTOR_GLOBAL,
		streamedArmSelector: STREAMED_ARM_SELECTOR,
		streamOpenProperty: PROTOCOL_STREAM_OPEN_PROPERTY,
		pendingDeadlineMs: MARKLESS_NAV_SETTLE_DEADLINE_MS,
		requestPrefix: FRAGMENT_PATH_PREFIX,
		regionEndMarker: FRAGMENT_REGION_END,
		appendMarker: FRAGMENT_APPEND_END,
		pageEndComment: PROTOCOL_CONTAINER_END_COMMENT,
		pageStartComment: PROTOCOL_CONTAINER_START_COMMENT,
		containerAttributes: [CONTAINER_ATTRIBUTE, PROTOCOL_LOCATOR_PATHS_ATTRIBUTE],
		keepAttributes: [PROTOCOL_KEEP_ATTRIBUTE, PROTOCOL_OWN_ATTRIBUTE],
		documentLoads,
		hoverDwellMs: FRAGMENT_HOVER_DWELL_MS,
		prefetchTtlMs: FRAGMENT_PREFETCH_TTL_MS,
		prefetchConnections: FRAGMENT_PREFETCH_CONNECTIONS,
		endpointPrefixes: [API_PATHNAME_PREFIX],
		idleFragments: FRAGMENT_IDLE_FRAGMENTS,
		idleFragmentBytes: FRAGMENT_IDLE_FRAGMENT_BYTES,
		idleWithoutConnectionInfo: FRAGMENT_IDLE_WITHOUT_CONNECTION_INFO,
		prefetch: fragment.prefetch,
		pages: fragment.pages,
	};
}

function htmlAttributes(
	documentModule: DocumentModule | undefined,
	pageProps: PageComponentProps,
	written: Readonly<Record<string, unknown>>,
) {
	const attributes = documentModule?.__marklessRouterHtmlAttributes?.(pageProps) ?? {
		lang: 'en',
		...written,
	};
	const normalized: Record<string, string> = {};

	for (const [name, value] of Object.entries(attributes)) {
		if (value === false || value === null || value === undefined) {
			continue;
		}

		normalized[name] = String(value);
	}

	return normalized;
}

function renderAttributes(attributes: Readonly<Record<string, string>>): string {
	return Object.entries(attributes)
		.map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
		.join('');
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

function escapeScriptJson(value: unknown): string {
	return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function escapeInlineScript(value: string): string {
	return value.replace(/<\/script/gi, '<\\/script');
}

// Nitro answers these with endpoints; the page renderer never does.
const API_PATHNAME_PREFIX = '/api';

function isNitroApiPathname(pathname: string) {
	return pathname === API_PATHNAME_PREFIX || pathname.startsWith(`${API_PATHNAME_PREFIX}/`);
}

// Ahead of every module script and modulepreload, after <meta charset> so the charset stays in the first 1024 bytes.
function insertImportMap(html: string, importMap: string): string {
	if (!importMap) return html;
	const at = headContentStart(html);
	return `${html.slice(0, at)}${importMap}${html.slice(at)}`;
}

function headContentStart(html: string): number {
	const head = /<head(?:\s[^>]*)?>/i.exec(html);
	if (!head) return 0;
	const afterHead = head.index + head[0].length;
	const headEnd = html.indexOf('</head>', afterHead);
	const charset = /<meta\s[^>]*charset[^>]*>(?:<\/meta>)?/i.exec(html.slice(afterHead));
	return charset && (headEnd === -1 || afterHead + charset.index < headEnd)
		? afterHead + charset.index + charset[0].length
		: afterHead;
}
