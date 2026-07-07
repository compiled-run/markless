import type { PageProps } from '../../index.ts';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '../../route-manifest.ts';
import { renderToString, type ModulePreloadInput } from '@markless/web/render-to-string';

export interface ServerEntryOptions {
	readonly navigationEntryPath?: string;
	readonly resumeEntryPath?: string;
	readonly routeModulePreloads?: Record<string, readonly ModulePreloadInput[]>;
	readonly routeSsrModulePreloads?: Record<string, readonly ModulePreloadInput[]>;
	readonly documentModuleLoader: (() => Promise<unknown>) | undefined;
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly routeFileIds: readonly string[];
}

interface RenderOutput {
	readonly html: string;
	readonly state?: unknown;
	readonly view?: unknown;
}

type SsrRender = (props?: unknown) => RenderOutput | Promise<RenderOutput>;

interface SsrArtifact {
	readonly renderSsr?: SsrRender;
	readonly resumeModuleUrl?: string;
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

interface PageHtml {
	readonly bodyHtml: string;
	readonly headHtml: string;
}

const DOCUMENT_CHILDREN_PLACEHOLDER = '__markless_router_document_children__';

export function createServerEntry(options: ServerEntryOptions) {
	const manifest = buildRouteManifestFromFileIds(options.routeFileIds);

	async function fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (isNitroApiPathname(url.pathname)) {
			return new Response('Not found', { status: 404 });
		}

		const match = matchRouteManifest(url.pathname, manifest);
		if (!match) {
			return renderStatusPage(url, manifest.statusPages.notFound, 404, 'Not found');
		}

		try {
			return await renderPage(url, match.route.file, match.params, 200);
		} catch (error) {
			// Surface the stack: a silent 500 hid the async-renderSsr break.
			console.error('[markless-router] page render failed:', error);
			return renderStatusPage(url, manifest.statusPages.error, 500, 'Internal Server Error');
		}
	}

	async function renderStatusPage(
		url: URL,
		file: string | undefined,
		status: number,
		fallbackText: string,
	) {
		if (!file) {
			return new Response(fallbackText, { status });
		}

		return renderPage(url, file, {}, status);
	}

	async function renderPage(
		url: URL,
		file: string,
		params: Readonly<Record<string, string>>,
		status: number,
	) {
		const loadPageModule = options.pageModuleLoaders[file];
		if (!loadPageModule) {
			return new Response(`Page module not found: ${file}`, { status: 500 });
		}

		const pageModule = (await loadPageModule()) as PageModule;
		const pageProps: PageComponentProps = {
			params,
			url: {
				href: url.href,
				pathname: url.pathname,
				search: url.search,
			},
			status,
		};
		const pageOutput = await renderPageModule(
			pageModule,
			pageProps,
			file,
			manifest,
			options.resumeEntryPath,
			options.navigationEntryPath,
			options.routeModulePreloads,
			options.routeSsrModulePreloads,
		);
		const documentModule = options.documentModuleLoader
			? ((await options.documentModuleLoader()) as DocumentModule)
			: undefined;
		const html = await renderDocument(pageOutput, documentModule, pageProps);

		return new Response(html, {
			status,
			headers: { 'content-type': 'text/html;charset=utf-8' },
		});
	}

	return { fetch };
}

async function renderPageModule(
	pageModule: PageModule,
	props: PageComponentProps,
	file: string,
	manifest: ReturnType<typeof buildRouteManifestFromFileIds>,
	resumeEntryPath: string | undefined,
	navigationEntryPath: string | undefined,
	routeModulePreloads: Record<string, readonly ModulePreloadInput[]> | undefined,
	routeSsrModulePreloads: Record<string, readonly ModulePreloadInput[]> | undefined,
): Promise<PageHtml> {
	const baseArtifact = pageModule.default;
	const renderSsr = baseArtifact?.renderSsr ?? pageModule.marklessRenderSsr;
	if (!renderSsr) {
		return {
			bodyHtml: `Page module must export an Markless compiled artifact: ${escapeHtml(file)}`,
			headHtml: '',
		};
	}

	// Compiled marklessRenderSsr is async (initial render awaits demanded
	// async work); interpolating the un-awaited Promise served 500s.
	const output = await renderSsr(props);
	if (!output) return { bodyHtml: '', headHtml: '' };
	const routeScript = output.state || output.view ? renderRouteScript(file) : '';
	// ONE lazy bridge, structure-triggered: it imports the navigation runtime
	// only on Link/'#/' anchor interaction, or at load when a '#/' deep-link
	// hash is actually present. No eager imports, no modes.
	const linkBridge = navigationEntryPath ? renderLinkBridgeScript(navigationEntryPath) : '';
	const routedOutput =
		routeScript || linkBridge
			? { ...output, html: `${output.html}${routeScript}${linkBridge}` }
			: output;
	const modulePreloads = modulePreloadsForPage(
		file,
		output.html,
		props.url.href,
		manifest,
		routeModulePreloads,
		routeSsrModulePreloads,
	);
	const pageArtifact: SsrArtifact = {
		resumeModuleUrl: baseArtifact?.resumeModuleUrl,
		renderSsr() {
			return routedOutput;
		},
	};
	const rendered = await renderToString(pageArtifact as never, {
		modulePreloads,
		resumeModuleUrl: resumeEntryPath ?? baseArtifact?.resumeModuleUrl,
	});

	return splitLeadingModulePreloadLinks(rendered);
}

function modulePreloadsForPage(
	file: string,
	html: string,
	baseHref: string,
	manifest: ReturnType<typeof buildRouteManifestFromFileIds>,
	routeModulePreloads: Record<string, readonly ModulePreloadInput[]> | undefined,
	routeSsrModulePreloads: Record<string, readonly ModulePreloadInput[]> | undefined,
): readonly ModulePreloadInput[] | undefined {
	const preloads: ModulePreloadInput[] = [];
	const seen = new Set<string>();
	addModulePreloads(preloads, seen, routeSsrModulePreloads?.[file]);
	if (!routeModulePreloads || !html.includes('data-markless-router-link')) {
		return preloads.length > 0 ? preloads : undefined;
	}

	for (const href of routerLinkHrefs(html)) {
		const url = parseSameOriginUrl(href, baseHref);
		const match = url && matchRouteManifest(url.pathname, manifest);
		addModulePreloads(preloads, seen, match && routeModulePreloads[match.route.file]);
	}
	return preloads.length > 0 ? preloads : undefined;
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

function splitLeadingModulePreloadLinks(html: string): PageHtml {
	let bodyHtml = html;
	const links: string[] = [];
	while (bodyHtml.startsWith('<link ')) {
		const end = bodyHtml.indexOf('>');
		if (end === -1) break;
		const link = bodyHtml.slice(0, end + 1);
		if (!link.includes('rel="modulepreload"')) break;
		links.push(link);
		bodyHtml = bodyHtml.slice(end + 1);
	}
	return { bodyHtml, headHtml: links.join('') };
}

function routerLinkHrefs(html: string): string[] {
	return [
		...html.matchAll(
			/<a\b(?=[^>]*\bdata-markless-router-link(?:[\s=>]|$))(?=[^>]*\bhref="([^"]*)")[^>]*>/g,
		),
	].map((match) => unescapeHtmlAttribute(match[1] ?? ''));
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

async function renderDocument(
	pageHtml: PageHtml,
	documentModule: DocumentModule | undefined,
	pageProps: PageComponentProps,
): Promise<string> {
	const attributes = htmlAttributes(documentModule, pageProps);
	const children = pageHtml.bodyHtml;
	const documentHtml = await renderDocumentModule(documentModule, {
		...pageProps,
		children: DOCUMENT_CHILDREN_PLACEHOLDER,
	});
	if (documentHtml !== undefined) {
		const resolvedDocumentHtml = documentHtml.replace(DOCUMENT_CHILDREN_PLACEHOLDER, children);
		return [
			'<!doctype html>',
			`<html${renderAttributes(attributes)}>`,
			insertHeadHtml(resolvedDocumentHtml, pageHtml.headHtml),
			'</html>',
		].join('');
	}

	return [
		'<!doctype html>',
		`<html${renderAttributes(attributes)}>`,
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		pageHtml.headHtml,
		'</head>',
		'<body>',
		children,
		'</body>',
		'</html>',
	].join('');
}

async function renderDocumentModule(
	documentModule: DocumentModule | undefined,
	props: PageComponentProps & { readonly children: string },
): Promise<string | undefined> {
	const output = await documentModule?.default?.renderSsr?.(props);
	return output?.html;
}

function insertHeadHtml(documentHtml: string, headHtml: string): string {
	if (!headHtml) return documentHtml;
	const headEnd = documentHtml.indexOf('</head>');
	if (headEnd === -1) return `${headHtml}${documentHtml}`;
	return `${documentHtml.slice(0, headEnd)}${headHtml}${documentHtml.slice(headEnd)}`;
}

function renderRouteScript(file: string): string {
	return `<script type="@markless/core/route">${escapeScriptJson({ file })}</script>`;
}

function renderLinkBridgeScript(resumeEntryPath: string): string {
	return `<script data-markless-router-link-resumer>${escapeInlineScript(`(() => {
	const d = document;
	const s = d.currentScript;
	const r = s && s.closest('[data-async-container]');
	if (!r || r.__marklessRouterLinkResumerStarted) return;
	r.__marklessRouterLinkResumerStarted = true;
	const linkAttr = 'data-markless-router-link';
	const replaceAttr = 'data-markless-router-replace';
	const scrollAttr = 'data-markless-router-scroll';
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
	if (location.hash && location.hash.startsWith('#/')) {
		import(${JSON.stringify(resumeEntryPath)}).catch(() => {});
	}
	r.addEventListener('click', async (event) => {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
		const anchor = anchorFrom(event);
		const hashRouteAnchor = anchor && (anchor.getAttribute('href') || '').startsWith('#/');
		if (!anchor || (!anchor.hasAttribute(linkAttr) && !hashRouteAnchor) || anchor.hasAttribute('download')) return;
		const target = anchor.getAttribute('target');
		if (target && target !== '_self') return;
		if (anchor.relList && anchor.relList.contains('external')) return;
		const url = sameOrigin(anchor.href);
		if (!url) return;
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
	}, true);
})();`)}</script>`;
}

function htmlAttributes(documentModule: DocumentModule | undefined, pageProps: PageComponentProps) {
	const attributes = documentModule?.__marklessRouterHtmlAttributes?.(pageProps) ?? {
		lang: 'en',
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

function isNitroApiPathname(pathname: string) {
	return pathname === '/api' || pathname.startsWith('/api/');
}
