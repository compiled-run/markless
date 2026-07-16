import { readFile } from 'node:fs/promises';
import { joinURL, parsePath } from 'ufo';
import type { DevEnvironment, EnvironmentModuleNode, HotUpdateOptions, ViteDevServer } from 'vite';
import type { MarklessEnvironment } from '../types.ts';
import { preflightTsrxModuleDiagnostics } from '../transform.ts';
import { createDevErrorClientAsset } from '../dev-error/client-asset.ts';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
	normalizeMarklessDevError,
} from '../dev-error/index.ts';
import { fetchableDevEnvironment, marklessEnvironment } from './environment.ts';

const SOURCE_FILE_EXTENSION = /\.tsrx(?:[?#].*)?$/;
const RESOLVED_DEV_ERROR_CLIENT_ID = `\0${MARKLESS_DEV_ERROR_CLIENT_ID}`;

interface ViteHmrOptions {
	base: string;
	clientEnvironment: string;
	enabled: boolean;
	invalidateGeneratedModules?: (parent: string, environment?: MarklessEnvironment) => string[];
	invalidSourceRecheckMs?: number;
}

export function createViteHmr(options: ViteHmrOptions) {
	let server: ViteDevServer | undefined;
	const invalidSources = new Set<string>();
	let invalidSourceRecheck: ReturnType<typeof setInterval> | undefined;
	let recheckingInvalidSources = false;

	function startInvalidSourceRecheck() {
		if (invalidSourceRecheck || invalidSources.size === 0) return;
		invalidSourceRecheck = setInterval(() => {
			void recheckInvalidSources();
		}, options.invalidSourceRecheckMs ?? 300);
		invalidSourceRecheck.unref?.();
	}

	function stopInvalidSourceRecheckIfIdle() {
		if (!invalidSourceRecheck || invalidSources.size !== 0) return;
		clearInterval(invalidSourceRecheck);
		invalidSourceRecheck = undefined;
	}

	function addInvalidSource(id: string) {
		invalidSources.add(id);
		startInvalidSourceRecheck();
	}

	function deleteInvalidSource(id: string) {
		const deleted = invalidSources.delete(id);
		stopInvalidSourceRecheckIfIdle();
		return deleted;
	}

	async function recheckInvalidSources() {
		if (recheckingInvalidSources) return;
		recheckingInvalidSources = true;
		try {
			for (const id of invalidSources) {
				let source: string;
				try {
					source = await readFile(id, 'utf8');
				} catch {
					continue;
				}

				try {
					await preflightTsrxModuleDiagnostics({ filename: id, source });
				} catch {
					continue;
				}

				if (!deleteInvalidSource(id)) continue;
				const hot = server?.environments?.[options.clientEnvironment]?.hot;
				hot?.send?.({
					type: 'custom',
					event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
					data: { id },
				});
				hot?.send?.({ type: 'full-reload' });
			}
		} finally {
			recheckingInvalidSources = false;
			stopInvalidSourceRecheckIfIdle();
		}
	}

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
		resolveId(id: string) {
			return id === MARKLESS_DEV_ERROR_CLIENT_ID ? RESOLVED_DEV_ERROR_CLIENT_ID : null;
		},
		load(id: string) {
			return id === RESOLVED_DEV_ERROR_CLIENT_ID
				? createDevErrorClientAsset(joinURL(options.base, '/@vite/client'))
				: null;
		},
		reportError(environment: DevEnvironment | undefined, error: unknown) {
			const hot = clientHot(server, options, environment);
			if (!hot?.send) return;
			const payload = normalizeMarklessDevError(error);
			addInvalidSource(payload.id);
			hot.send({ type: 'custom', event: MARKLESS_DEV_ERROR_EVENT, data: payload });
		},
		async hotUpdate(environment: DevEnvironment | undefined, ctx: HotUpdateOptions) {
			if (!environment) {
				return undefined;
			}

			const env = marklessEnvironment(environment);
			if (env === 'lib') {
				return undefined;
			}

			const hot = clientHot(server, options, environment);
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

			if (ctx.file && SOURCE_FILE_EXTENSION.test(ctx.file) && ctx.read) {
				const sourceId = parsePath(ctx.file).pathname;
				let editedSource: string | undefined;
				try {
					editedSource = await ctx.read();
				} catch {
					// A synthetic/query-suffixed watcher path may not be readable. Let the
					// existing invalidation path handle it instead of reporting a fake compile error.
				}
				if (editedSource !== undefined) {
					try {
						await preflightTsrxModuleDiagnostics({
							filename: sourceId,
							source: editedSource,
						});
					} catch (error) {
						const payload = normalizeMarklessDevError(error, { id: sourceId });
						addInvalidSource(payload.id);
						hot.send({
							type: 'custom',
							event: MARKLESS_DEV_ERROR_EVENT,
							data: payload,
						});
						return [];
					}
				}
				if (editedSource !== undefined && deleteInvalidSource(sourceId)) {
					hot.send({
						type: 'custom',
						event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
						data: { id: sourceId },
					});
				}
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
			const nextHtml = injectDevClients(html, options.base);
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

function injectDevClients(html: string, base: string) {
	if (!html) return html;
	const tags = [
		...(html.includes('/@vite/client')
			? []
			: [`<script type="module" src="${joinURL(base, '/@vite/client')}"></script>`]),
		...(html.includes(MARKLESS_DEV_ERROR_CLIENT_ID)
			? []
			: [
					`<script type="module" src="${joinURL(base, `/@id/__x00__${MARKLESS_DEV_ERROR_CLIENT_ID}`)}"></script>`,
				]),
	].join('');
	if (!tags) return html;
	if (html.includes('</head>')) return html.replace('</head>', `${tags}</head>`);
	if (html.includes('<head>')) return html.replace('<head>', `<head>${tags}`);
	return `${tags}${html}`;
}

function clientHot(
	server: ViteDevServer | undefined,
	options: ViteHmrOptions,
	environment: DevEnvironment | undefined,
) {
	return marklessEnvironment(environment) === 'server'
		? server?.environments?.[options.clientEnvironment]?.hot
		: environment?.hot;
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
