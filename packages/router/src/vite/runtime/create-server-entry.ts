import type { PageProps } from '../../index.ts';
import { buildRouteManifestFromFileIds, matchRouteManifest } from '../../route-manifest.ts';
import { renderToString, type ModulePreloadInput } from '@arcade/web/render-to-string';

export interface ServerEntryOptions {
	readonly resumeEntryPath?: string;
	readonly documentModuleLoader: (() => Promise<unknown>) | undefined;
	readonly pageModuleLoaders: Record<string, () => Promise<unknown>>;
	readonly routeFileIds: readonly string[];
}

interface RenderOutput {
	readonly html: string;
	readonly state?: unknown;
	readonly view?: unknown;
}

type SsrRender = (props?: unknown) => RenderOutput;

interface SsrArtifact {
	readonly modulePreloads?: ReadonlyArray<ModulePreloadInput>;
	readonly renderSsr?: SsrRender;
	readonly resumeModuleUrl?: string;
}

interface PageModule {
	readonly default?: SsrArtifact;
	readonly arcadeRenderSsr?: SsrRender;
}

interface DocumentModule {
	readonly default?: SsrArtifact;
	readonly __arcadeRouterHtmlAttributes?: (props: PageComponentProps) => Record<string, unknown>;
}

type PageComponentProps = PageProps & Record<string, unknown>;

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
		} catch {
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
		const pageOutput = renderPageModule(pageModule, pageProps, file, options.resumeEntryPath);
		const documentModule = options.documentModuleLoader
			? ((await options.documentModuleLoader()) as DocumentModule)
			: undefined;
		const html = renderDocument(pageOutput, documentModule, pageProps);

		return new Response(html, {
			status,
			headers: { 'content-type': 'text/html;charset=utf-8' },
		});
	}

	return { fetch };
}

function renderPageModule(
	pageModule: PageModule,
	props: PageComponentProps,
	file: string,
	resumeEntryPath: string | undefined,
): string {
	const baseArtifact = pageModule.default;
	const renderSsr = baseArtifact?.renderSsr ?? pageModule.arcadeRenderSsr;
	if (!renderSsr) {
		return `Page module must export an Arcade compiled artifact: ${escapeHtml(file)}`;
	}

	const pageArtifact: SsrArtifact = {
		modulePreloads: baseArtifact?.modulePreloads,
		resumeModuleUrl: baseArtifact?.resumeModuleUrl,
		renderSsr() {
			const output = renderSsr(props);
			return output && (output.state || output.view)
				? { ...output, html: `${output.html}${renderRouteScript(file)}` }
				: output;
		},
	};
	const rendered = renderToString(pageArtifact as never, {
		resumeModuleUrl: resumeEntryPath ?? baseArtifact?.resumeModuleUrl,
	});

	return rendered;
}

function renderDocument(
	pageHtml: string,
	documentModule: DocumentModule | undefined,
	pageProps: PageComponentProps,
): string {
	const attributes = htmlAttributes(documentModule, pageProps);
	const children = pageHtml;
	const documentHtml = renderDocumentModule(documentModule, {
		...pageProps,
		children,
	});
	if (documentHtml !== undefined) {
		return [
			'<!doctype html>',
			`<html${renderAttributes(attributes)}>`,
			documentHtml,
			'</html>',
		].join('');
	}

	return [
		'<!doctype html>',
		`<html${renderAttributes(attributes)}>`,
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		'</head>',
		'<body>',
		children,
		'</body>',
		'</html>',
	].join('');
}

function renderDocumentModule(
	documentModule: DocumentModule | undefined,
	props: PageComponentProps & { readonly children: string },
): string | undefined {
	const output = documentModule?.default?.renderSsr?.(props);
	return output?.html;
}

function renderRouteScript(file: string): string {
	return `<script type="arcade/route">${escapeScriptJson({ file })}</script>`;
}

function htmlAttributes(documentModule: DocumentModule | undefined, pageProps: PageComponentProps) {
	const attributes = documentModule?.__arcadeRouterHtmlAttributes?.(pageProps) ?? {
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

function isNitroApiPathname(pathname: string) {
	return pathname === '/api' || pathname.startsWith('/api/');
}
