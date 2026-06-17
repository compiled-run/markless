import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
	render: (clientEntry?: string) => string | Promise<string>;
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

const CLIENT_RESUME_MODULE = '/src/entry-client.ts';
const REQUEST_LOG_PATH = '/__arcade-fixture-requests';

// Fixture-only SSR host. Real apps should provide this from a runtime adapter
// or meta-framework; the arcade bundler only needs SSR artifacts.
export function fixtureSsrHost(): Plugin {
	return {
		name: 'fixture:arcade-ssr-host',
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
			const scriptRequests = createScriptRequestLog();
			server.middlewares.use(async (incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as DevRequest;
				if (scriptRequests.handle(request, outgoingResponse as DevResponse)) {
					return;
				}
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
			const scriptRequests = createScriptRequestLog();
			server.middlewares.use(async (incomingRequest, outgoingResponse, next) => {
				const request = incomingRequest as DevRequest;
				if (scriptRequests.handle(request, outgoingResponse as DevResponse)) {
					return;
				}
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

function createScriptRequestLog() {
	const scripts: string[] = [];

	return {
		handle(request: DevRequest, response: DevResponse): boolean {
			if (!request.url || request.method !== 'GET') return false;

			const pathname = new URL(request.url, requestOrigin(request)).pathname;
			if (pathname === REQUEST_LOG_PATH) {
				sendJsonResponse(response, { scripts });
				return true;
			}
			if (isScriptRequest(request, pathname)) {
				scripts.push(pathname);
			}
			return false;
		},
	};
}

async function renderDevRequest(runner: SsrRunner, request: Request) {
	const url = new URL(request.url);
	if (url.pathname !== '/' && url.pathname !== '/index.html') {
		return new Response('Not found', { status: 404 });
	}

	const entry = (await runner.import('/src/entry-server.ts')) as SsrEntry;
	return new Response(await entry.render(CLIENT_RESUME_MODULE), {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
}

async function renderPreviewRequest(root: string, outDir: string) {
	const dist = resolve(root, outDir);
	const resumeModuleUrl = await readClientResumeModuleUrl(dist);
	const entry = (await import(
		`${pathToFileURL(resolve(dist, 'server/entry-server.js')).href}?preview=${Date.now()}`
	)) as SsrEntry;

	return new Response(await entry.render(resumeModuleUrl), {
		headers: { 'Content-Type': 'text/html;charset=utf-8' },
	});
}

async function readClientResumeModuleUrl(dist: string) {
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

function isScriptRequest(request: DevRequest, pathname: string): boolean {
	const destination = request.headers['sec-fetch-dest'];
	return (
		destination === 'script' ||
		pathname.endsWith('.js') ||
		pathname.endsWith('.mjs') ||
		pathname.endsWith('.ts') ||
		pathname.endsWith('.tsrx')
	);
}

function shouldRenderHtml(request: DevRequest) {
	if (!request.url || request.method !== 'GET') {
		return false;
	}

	const pathname = new URL(request.url, requestOrigin(request)).pathname;
	if (pathname !== '/' && pathname !== '/index.html') {
		return false;
	}

	const accept = request.headers.accept;
	return typeof accept !== 'string' || accept.includes('text/html') || accept.includes('*/*');
}

function toFetchRequest(request: DevRequest) {
	return new Request(new URL(request.url ?? '/', requestOrigin(request)), {
		headers: toFetchHeaders(request.headers),
		method: request.method,
	});
}

function toFetchHeaders(headers: DevRequest['headers']) {
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

function requestOrigin(request: DevRequest) {
	const host = typeof request.headers.host === 'string' ? request.headers.host : 'localhost';
	return `http://${host}`;
}

function sendJsonResponse(response: DevResponse, value: unknown) {
	response.statusCode = 200;
	response.statusMessage = 'OK';
	response.setHeader('Content-Type', 'application/json;charset=utf-8');
	response.end(new TextEncoder().encode(JSON.stringify(value)));
}

async function sendResponse(response: DevResponse, rendered: Response) {
	response.statusCode = rendered.status;
	response.statusMessage = rendered.statusText;
	for (const [name, value] of rendered.headers) {
		response.setHeader(name, value);
	}
	response.end(new Uint8Array(await rendered.arrayBuffer()));
}
