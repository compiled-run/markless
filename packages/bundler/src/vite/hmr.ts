import { joinURL, parsePath } from 'ufo';
import type { DevEnvironment, EnvironmentModuleNode, HotUpdateOptions, ViteDevServer } from 'vite';
import type { MarklessEnvironment } from '../types.ts';
import { fetchableDevEnvironment, marklessEnvironment } from './environment.ts';

const SOURCE_FILE_EXTENSION = /\.tsrx(?:[?#].*)?$/;

interface ViteHmrOptions {
	base: string;
	clientEnvironment: string;
	enabled: boolean;
	invalidateGeneratedModules?: (parent: string, environment?: MarklessEnvironment) => string[];
}

export function createViteHmr(options: ViteHmrOptions) {
	let server: ViteDevServer | undefined;

	return {
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
			if (options.enabled) {
				installFetchViteClient(nextServer, options);
			}
		},
		transformIndexHtml() {
			return undefined;
		},
		resolveId(_id: string) {
			return null;
		},
		load(_id: string) {
			return null;
		},
		hotUpdate(environment: DevEnvironment | undefined, ctx: HotUpdateOptions) {
			if (!environment) {
				return undefined;
			}

			const env = marklessEnvironment(environment);
			if (env === 'lib') {
				return undefined;
			}

			const hot =
				env === 'server'
					? server?.environments?.[options.clientEnvironment]?.hot
					: environment.hot;
			if (!hot?.send) {
				return undefined;
			}

			if (!options.enabled) {
				hot.send({ type: 'full-reload' });
				return [];
			}

			const files = changedFiles(ctx.modules ?? []);
			const root = server?.config?.root;
			if (ctx.file && SOURCE_FILE_EXTENSION.test(ctx.file)) {
				const prefix = root && `${root}/`;
				files.add(
					prefix && ctx.file.startsWith(prefix)
						? `/${ctx.file.slice(prefix.length)}`
						: ctx.file,
				);
			}
			if (!files.size) {
				return undefined;
			}

			const invalidationEnvironments = moduleGraphEnvironments(
				environment,
				env === 'server' ? server?.environments?.[options.clientEnvironment] : undefined,
			);
			for (const file of files) {
				for (const candidate of hmrCandidates(file, ctx.file)) {
					for (const id of options.invalidateGeneratedModules?.(candidate, env) ?? []) {
						for (const targetEnvironment of invalidationEnvironments) {
							const module = targetEnvironment.moduleGraph?.getModuleById?.(id);
							if (!module) continue;

							targetEnvironment.moduleGraph?.invalidateModule?.(
								module,
								new Set<EnvironmentModuleNode>(),
								ctx.timestamp,
								true,
							);
						}
					}
				}
			}

			hot.send({
				type: 'full-reload',
				path: firstChangedFile(files),
				triggeredBy: ctx.file,
			});

			return [];
		},
	};
}

function installFetchViteClient(server: ViteDevServer, options: ViteHmrOptions) {
	for (const environment of Object.values(server.environments)) {
		const fetchEnv = fetchableDevEnvironment(environment);
		if (!fetchEnv) continue;

		const dispatchFetch = fetchEnv.dispatchFetch.bind(fetchEnv);
		fetchEnv.dispatchFetch = async (request) => {
			const response = await dispatchFetch(request);
			if (!response.headers.get('content-type')?.includes('text/html')) return response;

			const html = await response.text();
			const nextHtml = injectViteClient(html, options.base);
			const headers = new Headers(response.headers);
			if (nextHtml !== html) headers.delete('content-length');
			return new Response(nextHtml, {
				headers,
				status: response.status,
				statusText: response.statusText,
			});
		};
	}
}

function injectViteClient(html: string, base: string) {
	if (!html || html.includes('/@vite/client')) return html;

	const tag = `<script type="module" src="${joinURL(base, '/@vite/client')}"></script>`;
	if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`);
	if (html.includes('<head>')) return html.replace('<head>', `<head>${tag}`);
	return `${tag}${html}`;
}

function changedFiles(modules: EnvironmentModuleNode[]) {
	const files = new Set<string>();
	for (const module of modules) {
		for (const item of [module, ...(module.importers ?? [])]) {
			const url = sourceUrl(item);
			if (url) files.add(url);
		}
	}

	return files;
}

function sourceUrl(module: EnvironmentModuleNode) {
	const url = parsePath(module.url).pathname;
	if (module.type === 'js' && SOURCE_FILE_EXTENSION.test(url)) {
		return url;
	}

	return null;
}

function hmrCandidates(file: string, absoluteFile: string | undefined) {
	const candidates = new Set<string>([file]);
	if (absoluteFile) candidates.add(absoluteFile);
	return candidates;
}

function moduleGraphEnvironments(
	environment: DevEnvironment,
	clientEnvironment: DevEnvironment | undefined,
) {
	if (!clientEnvironment || clientEnvironment === environment) {
		return [environment];
	}

	return [environment, clientEnvironment];
}

function firstChangedFile(files: Set<string>) {
	for (const file of files) {
		return file;
	}

	return undefined;
}
