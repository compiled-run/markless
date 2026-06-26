import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToString, type SsrRenderable } from 'arcade';
import { planSsrModulePreloads, type ArcadeBundleGraph } from 'arcade/preload';
import {
	createFetchableDevEnvironment,
	createServerHotChannel,
	createServerModuleRunner,
	type EnvironmentOptions,
	type FetchableDevEnvironment,
	type Plugin,
} from 'vite';

type CreateEnvironment = NonNullable<NonNullable<EnvironmentOptions['dev']>['createEnvironment']>;
type SsrRunner = ReturnType<typeof createServerModuleRunner>;

type SsrEntry = {
	default: SsrRenderable & {
		readonly payloadView?: {
			readonly events?: ReadonlyArray<{
				readonly symbolIds?: ReadonlyArray<string>;
			}>;
			readonly domUpdates?: ReadonlyArray<{
				readonly symbolId?: string;
			}>;
		};
	};
};

type DevRequest = {
	url?: string;
	method?: string;
	headers: Record<string, string | string[] | undefined>;
};

type DevResponse = {
	statusCode: number;
	statusMessage: string;
	setHeader(name: string, value: string): void;
	end(body?: Uint8Array): void;
};

const DEV_STYLESHEET = '/src/styles.css';

export function musicPlayerSsrHost(): Plugin {
	return {
		name: 'music-player:ssr-host',
		config() {
			return {
				environments: {
					ssr: {
						dev: {
							createEnvironment: ((name, config) => {
								let runner: SsrRunner | undefined;
								const environment = createFetchableDevEnvironment(name, config, {
									hot: true,
									transport: createServerHotChannel(),
									handleRequest(request) {
										runner ??= createServerModuleRunner(environment);
										return renderDevRequest(runner, request);
									},
								});
								const close = environment.close.bind(environment);
								environment.close = async () => {
									await runner?.close();
									await close();
								};
								return environment;
							}) satisfies CreateEnvironment,
						},
					},
				},
			};
		},
		configureServer(server) {
			server.middlewares.use(async (incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as DevRequest;
				if (!shouldRenderHtml(request)) {
					next();
					return;
				}

				try {
					const environment = server.environments.ssr as FetchableDevEnvironment;
					const response = await environment.dispatchFetch(toFetchRequest(request));
					await sendResponse(outgoingResponse as DevResponse, response);
				} catch (error) {
					server.ssrFixStacktrace(error as Error);
					next(error);
				}
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use(async (incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as DevRequest;
				if (!shouldRenderHtml(request)) {
					next();
					return;
				}

				try {
					const response = await renderPreviewRequest(
						server.config.root,
						server.config.build.outDir,
					);
					await sendResponse(outgoingResponse as DevResponse, response);
				} catch (error) {
					next(error);
				}
			});
		},
	};
}

async function renderDevRequest(runner: SsrRunner, request: Request): Promise<Response> {
	const url = new URL(request.url);
	if (!isHtmlRoute(url.pathname)) {
		return new Response('Not found', { status: 404 });
	}

	const entry = (await runner.import('/src/App.tsrx')) as SsrEntry;
	return new Response(
		renderDocument(renderToString(entry.default, { containerId: 'music-player-ssr' }), {
			stylesheetHref: DEV_STYLESHEET,
		}),
		{
			headers: { 'Content-Type': 'text/html;charset=utf-8' },
		},
	);
}

async function renderPreviewRequest(root: string, outDir: string): Promise<Response> {
	const dist = resolve(root, outDir);
	const resumeModuleUrl = await readClientResumeModuleUrl(dist);
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server/App.js')).href}?preview=${Date.now()}`
	)) as SsrEntry;
	const modulePreloads = planSsrModulePreloads({
		artifact: entry.default,
		base: '/build/',
		bundleGraph: await readBundleGraph(dist),
		resumeModuleUrl,
	});
	return new Response(
		renderDocument(
			renderToString(entry.default, {
				containerId: 'music-player-ssr',
				modulePreloads,
				resumeModuleUrl,
			}),
			{
				stylesheetHref: await readStylesheetUrl(dist),
			},
		),
		{
			headers: { 'Content-Type': 'text/html;charset=utf-8' },
		},
	);
}

async function readClientResumeModuleUrl(dist: string): Promise<string> {
	const buildDir = resolve(dist, 'build');
	for (const fileName of await readdir(buildDir)) {
		if (!fileName.endsWith('.js')) continue;

		const source = await readFile(resolve(buildDir, fileName), 'utf8');
		if (source.includes('resumeContainerEvent')) {
			return `/build/${fileName}`;
		}
	}
	throw new Error('Expected built client resume module exporting resumeContainerEvent.');
}

async function readStylesheetUrl(dist: string): Promise<string> {
	const assetsDir = resolve(dist, 'assets');
	for (const fileName of await readdir(assetsDir)) {
		if (fileName.endsWith('.css')) return `/assets/${fileName}`;
	}
	return '';
}

async function readBundleGraph(dist: string): Promise<ArcadeBundleGraph | undefined> {
	return JSON.parse(
		await readFile(resolve(dist, 'build/bundle-graph.json'), 'utf8'),
	) as ArcadeBundleGraph;
}

function renderDocument(app: string, options: { readonly stylesheetHref?: string } = {}): string {
	return [
		'<!doctype html>',
		'<html lang="en">',
		'<head>',
		'<meta charset="UTF-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1.0">',
		'<title>Arcade Music Player SSR</title>',
		options.stylesheetHref
			? `<link rel="stylesheet" href="${escapeAttribute(options.stylesheetHref)}">`
			: '',
		'</head>',
		'<body>',
		app,
		'</body>',
		'</html>',
	].join('');
}

function escapeAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function shouldRenderHtml(request: DevRequest): boolean {
	if (!request.url || request.method !== 'GET') return false;
	const pathname = new URL(request.url, requestOrigin(request)).pathname;
	if (!isHtmlRoute(pathname)) return false;

	const accept = request.headers.accept;
	return typeof accept !== 'string' || accept.includes('text/html') || accept.includes('*/*');
}

function isHtmlRoute(pathname: string): boolean {
	return pathname === '/' || pathname === '/index.html';
}

function toFetchRequest(request: DevRequest): Request {
	return new Request(new URL(request.url ?? '/', requestOrigin(request)), {
		headers: toFetchHeaders(request.headers),
		method: request.method,
	});
}

function toFetchHeaders(headers: DevRequest['headers']): Headers {
	const next = new Headers();
	for (const [name, value] of Object.entries(headers)) {
		if (Array.isArray(value)) {
			for (const item of value) next.append(name, item);
		} else if (value) {
			next.set(name, value);
		}
	}
	return next;
}

function requestOrigin(request: DevRequest): string {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return `http://${host}`;
}

async function sendResponse(response: DevResponse, rendered: Response): Promise<void> {
	response.statusCode = rendered.status;
	response.statusMessage = rendered.statusText;
	for (const [name, value] of rendered.headers) {
		response.setHeader(name, value);
	}
	response.end(new Uint8Array(await rendered.arrayBuffer()));
}
