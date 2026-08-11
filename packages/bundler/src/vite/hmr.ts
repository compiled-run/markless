import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { joinURL, parsePath } from 'ufo';
import type {
	DevEnvironment,
	EnvironmentModuleNode,
	FetchResult,
	HotUpdateOptions,
	ViteDevServer,
} from 'vite';
import type { FetchFunctionOptions } from 'vite/module-runner';
import type { MarklessEnvironment } from '../types.ts';
import { preflightTsrxModuleDiagnostics } from '../transform.ts';
import { createDevErrorClientAsset } from '../dev-error/client-asset.ts';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
	normalizeMarklessDevError,
	type MarklessDevErrorPayload,
} from '../dev-error/index.ts';
import {
	fetchableDevEnvironment,
	hasInProcessModuleRunner,
	isServerViteEnvironment,
	marklessEnvironment,
} from './environment.ts';

const SOURCE_FILE_EXTENSION = /\.tsrx(?:[?#].*)?$/;
const RESOLVED_DEV_ERROR_CLIENT_ID = `\0${MARKLESS_DEV_ERROR_CLIENT_ID}`;
// How Vite spells a virtual id inside a request URL.
const VITE_ID_PREFIX = '/@id/';
const VITE_NULL_BYTE = '__x00__';

interface ViteHmrOptions {
	base: string;
	clientEnvironment: string;
	enabled: boolean;
	invalidateGeneratedModules?: (
		parent: string,
		environment?: MarklessEnvironment,
		nextSource?: string,
	) => string[] | Promise<string[]>;
	invalidatePrerenderSnapshots?: (renderDataIds: readonly string[]) => void;
	invalidSourceRecheckMs?: number;
}

interface PreflightVerdict {
	error?: MarklessDevErrorPayload;
	messagesSent: boolean;
}

export function createViteHmr(options: ViteHmrOptions) {
	let server: ViteDevServer | undefined;
	const invalidSources = new Set<string>();
	let invalidSourceRecheck: ReturnType<typeof setInterval> | undefined;
	let recheckingInvalidSources = false;
	const preflightByFile = new Map<
		string,
		{ source: string; verdict: Promise<PreflightVerdict> }
	>();
	// Module ids each out-of-process runner still has to be told about, keyed by
	// Vite environment name. Only environments with the fetch gate installed appear.
	const unreportedInvalidations = new Map<string, Set<string>>();

	// Vite runs the client environment's hotUpdate pass before every server one,
	// so the browser reload the client pass sends can bring a page request back
	// before the server module graphs have been invalidated for that same edit,
	// and that render serves pre-edit modules with nothing left to re-invalidate
	// it. A server render started while a pass is in flight waits for the whole
	// cycle instead; with no edit being processed there is nothing to wait for.
	let hotUpdatePasses = 0;
	let hotUpdateCycle: { settled: Promise<void>; finish: () => void } | undefined;

	function beginHotUpdatePass() {
		hotUpdatePasses += 1;
		if (hotUpdateCycle) return;

		let finish!: () => void;
		const settled = new Promise<void>((resolve) => {
			finish = resolve;
		});
		hotUpdateCycle = { settled, finish };
	}

	function endHotUpdatePass() {
		hotUpdatePasses -= 1;
		if (hotUpdatePasses > 0) return;

		// Vite starts the next environment's pass in a microtask, so a timer tick
		// is the first moment at which the whole cycle is known to be over.
		const cycle = hotUpdateCycle;
		const timer = setTimeout(() => {
			if (hotUpdatePasses > 0 || hotUpdateCycle !== cycle) return;
			hotUpdateCycle = undefined;
			cycle?.finish();
		}, 0);
		timer.unref?.();
	}

	function settledHotUpdate() {
		if (process.env.MARKLESS_NO_BARRIER) return undefined;
		return hotUpdateCycle?.settled;
	}

	function recordUnreportedInvalidation(
		environment: DevEnvironment,
		modules: Iterable<EnvironmentModuleNode>,
	) {
		const pending = unreportedInvalidations.get(environment.name);
		if (!pending) return;

		for (const module of modules) {
			if (module.id) pending.add(module.id);
		}
	}

	// A runner outside this process never sees a `full-reload` payload: its transport
	// forwards custom events only. It re-imports its entry instead and re-runs a module
	// only when the server reports that module invalidated on the runner's next fetch.
	// The server reports that from a missing transform result, and linking a parent
	// transforms its imported children, so the children's results are back before the
	// runner asks. This gate hands each such module its invalidation on the fetch itself.
	function installRunnerInvalidationGate(nextServer: ViteDevServer) {
		for (const [name, environment] of Object.entries(nextServer.environments ?? {})) {
			if (name === options.clientEnvironment || hasInProcessModuleRunner(environment)) {
				continue;
			}
			// Partial adapters and test doubles omit fetchModule despite the declared type.
			const fetchModule =
				typeof environment.fetchModule === 'function'
					? environment.fetchModule.bind(environment)
					: undefined;
			if (!fetchModule) continue;

			unreportedInvalidations.set(name, new Set<string>());
			environment.fetchModule = async (
				id: string,
				importer?: string,
				fetchOptions?: FetchFunctionOptions,
			): Promise<FetchResult> => {
				const pending = unreportedInvalidations.get(name);
				const module = pending?.size ? await fetchedModuleNode(environment, id) : undefined;
				if (!module?.id || !pending?.delete(module.id)) {
					return fetchModule(id, importer, fetchOptions);
				}

				environment.moduleGraph.invalidateModule(
					module,
					new Set<EnvironmentModuleNode>(),
					Date.now(),
					true,
					true,
				);
				return fetchModule(id, importer, { ...fetchOptions, cached: false });
			};
		}
	}

	function installServerRenderBarrier(nextServer: ViteDevServer) {
		for (const environment of Object.values(nextServer.environments ?? {})) {
			const fetchEnv = fetchableDevEnvironment(environment);
			if (!fetchEnv) continue;

			const dispatchFetch = fetchEnv.dispatchFetch.bind(fetchEnv);
			fetchEnv.dispatchFetch = async (request) => {
				await settledHotUpdate();
				return dispatchFetch(request);
			};
		}
	}

	function preflight(sourceId: string, source: string) {
		const cached = preflightByFile.get(sourceId);
		if (cached?.source === source) return cached.verdict;

		const verdict = preflightTsrxModuleDiagnostics({ filename: sourceId, source }).then(
			(): PreflightVerdict => ({ messagesSent: false }),
			(error): PreflightVerdict => ({
				error: normalizeMarklessDevError(error, { id: sourceId }),
				messagesSent: false,
			}),
		);
		preflightByFile.set(sourceId, { source, verdict });
		return verdict;
	}

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
		if (!isAbsolute(id) || !SOURCE_FILE_EXTENSION.test(id)) return;
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
			let recovered = false;
			for (const id of invalidSources) {
				let source: string;
				try {
					source = await readFile(id, 'utf8');
				} catch (error) {
					if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'EISDIR')) {
						if (deleteInvalidSource(id)) sendClear(id);
					}
					continue;
				}

				try {
					await preflightTsrxModuleDiagnostics({ filename: id, source });
				} catch {
					continue;
				}

				if (!deleteInvalidSource(id)) continue;
				sendClear(id);
				recovered = true;
			}
			if (recovered) {
				server?.environments?.[options.clientEnvironment]?.hot?.send?.({
					type: 'full-reload',
				});
			}
		} finally {
			recheckingInvalidSources = false;
			stopInvalidSourceRecheckIfIdle();
		}
	}

	function sendClear(id: string) {
		server?.environments?.[options.clientEnvironment]?.hot?.send?.({
			type: 'custom',
			event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
			data: { id },
		});
	}

	function cleanup() {
		if (invalidSourceRecheck) clearInterval(invalidSourceRecheck);
		invalidSourceRecheck = undefined;
		invalidSources.clear();
	}

	return {
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
			installRunnerInvalidationGate(nextServer);
			installServerRenderBarrier(nextServer);
			nextServer.httpServer?.once('close', cleanup);
			nextServer.watcher?.once?.('close', cleanup);
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
			beginHotUpdatePass();
			try {
				return await runHotUpdate(environment, ctx);
			} finally {
				endHotUpdatePass();
			}
		},
	};

	async function runHotUpdate(environment: DevEnvironment | undefined, ctx: HotUpdateOptions) {
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

		// The dev worker's module runner only drops evaluated modules when the reload
		// arrives on its own environment channel, and it needs one per edit even when
		// the client channel already reloaded for this file. Unmanaged server
		// environments (nitro) render pages from their own runner but skip this hook,
		// so the server pass has to deliver their reload too.
		const runnerHots =
			env === 'server' ? moduleRunnerHots(server, options, environment, hot) : [];
		const reloadModuleRunner = () => {
			for (const runnerHot of runnerHots) runnerHot.send?.({ type: 'full-reload' });
		};

		if (!options.enabled) {
			hot.send({ type: 'full-reload' });
			reloadModuleRunner();
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

		let sendMessages = true;
		let editedSource: string | undefined;
		if (ctx.file && SOURCE_FILE_EXTENSION.test(ctx.file) && ctx.read) {
			const sourceId = parsePath(ctx.file).pathname;
			try {
				editedSource = await ctx.read();
			} catch {
				// A synthetic/query-suffixed watcher path may not be readable. Let the
				// existing invalidation path handle it instead of reporting a fake compile error.
			}
			if (editedSource !== undefined) {
				const verdict = await preflight(sourceId, editedSource);
				sendMessages = !verdict.messagesSent;
				verdict.messagesSent = true;
				if (verdict.error) {
					if (sendMessages) {
						addInvalidSource(verdict.error.id);
						hot.send({
							type: 'custom',
							event: MARKLESS_DEV_ERROR_EVENT,
							data: verdict.error,
						});
					}
					return [];
				}
			}
			if (editedSource !== undefined && sendMessages && deleteInvalidSource(sourceId)) {
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
			env === 'server' ? unmanagedServerEnvironments(server, options) : [],
		);
		const invalidatedGeneratedIds = new Set<string>();
		for (const file of files) {
			const candidates =
				editedSource !== undefined && ctx.file
					? [ctx.file]
					: hmrCandidates(file, ctx.file);
			for (const candidate of candidates) {
				const invalidatedIds = await options.invalidateGeneratedModules?.(
					candidate,
					env,
					candidate === ctx.file ? editedSource : undefined,
				);
				for (const id of invalidatedIds ?? []) {
					invalidatedGeneratedIds.add(id);
					for (const targetEnvironment of invalidationEnvironments) {
						const module = targetEnvironment.moduleGraph?.getModuleById?.(id);
						if (!module) continue;

						const invalidated = new Set<EnvironmentModuleNode>();
						targetEnvironment.moduleGraph?.invalidateModule?.(
							module,
							invalidated,
							ctx.timestamp,
							true,
						);
						recordUnreportedInvalidation(targetEnvironment, invalidated);
					}
				}
			}
		}
		if (invalidatedGeneratedIds.size > 0) {
			options.invalidatePrerenderSnapshots?.([...invalidatedGeneratedIds].sort());
		}

		// The edited source and everything importing it must reach the out-of-process
		// runners too, not just the generated modules linked off them.
		if (ctx.file) {
			for (const targetEnvironment of invalidationEnvironments) {
				for (const module of targetEnvironment.moduleGraph?.getModulesByFile?.(
					ctx.file,
				) ?? []) {
					const invalidated = new Set<EnvironmentModuleNode>();
					targetEnvironment.moduleGraph?.invalidateModule?.(
						module,
						invalidated,
						ctx.timestamp,
						true,
						true,
					);
					recordUnreportedInvalidation(targetEnvironment, invalidated);
				}
			}
		}

		reloadModuleRunner();
		if (sendMessages) {
			hot.send({
				type: 'full-reload',
				path: firstChangedFile(files),
				triggeredBy: ctx.file,
			});
		}

		return [];
	}
}

// The runner asks by request URL; the pending set holds resolved module ids.
async function fetchedModuleNode(environment: DevEnvironment, id: string) {
	const resolved = id.startsWith(VITE_ID_PREFIX)
		? id.slice(VITE_ID_PREFIX.length).replace(VITE_NULL_BYTE, '\0')
		: id;
	return (
		environment.moduleGraph.getModuleById(resolved) ??
		(await environment.moduleGraph.getModuleByUrl(id).catch(() => undefined))
	);
}

function hasErrorCode(error: unknown, code: string) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === code
	);
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

export function injectDevClients(html: string, base: string) {
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
	// No originating environment (caller outside dev) and server-side environments
	// both report on the client channel; only the client environment owns its own.
	if (!environment || marklessEnvironment(environment) === 'server') {
		return server?.environments?.[options.clientEnvironment]?.hot;
	}
	return environment.hot;
}

// The server environments Vite calls server consumers while Markless declines to
// manage them (nitro). They render pages from their own module runner but their
// own hotUpdate pass is skipped by design, so the managed server pass speaks for them.
function unmanagedServerEnvironments(server: ViteDevServer | undefined, options: ViteHmrOptions) {
	const environments: DevEnvironment[] = [];
	for (const [name, candidate] of Object.entries(server?.environments ?? {})) {
		if (name === options.clientEnvironment) continue;
		if (candidate.config?.consumer !== 'server' || isServerViteEnvironment(candidate)) {
			continue;
		}
		environments.push(candidate);
	}

	return environments;
}

// Every server-side module runner that has to drop its evaluated modules for this edit.
function moduleRunnerHots(
	server: ViteDevServer | undefined,
	options: ViteHmrOptions,
	environment: DevEnvironment,
	clientChannel: DevEnvironment['hot'] | undefined,
) {
	const hots = new Set<DevEnvironment['hot']>();
	if (environment.hot && environment.hot !== clientChannel) hots.add(environment.hot);
	for (const unmanaged of unmanagedServerEnvironments(server, options)) {
		if (unmanaged === environment || !unmanaged.hot || unmanaged.hot === clientChannel) {
			continue;
		}
		hots.add(unmanaged.hot);
	}

	return [...hots];
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
	unmanagedServers: readonly DevEnvironment[] = [],
) {
	const environments = new Set<DevEnvironment>([environment]);
	if (clientEnvironment) environments.add(clientEnvironment);
	for (const unmanaged of unmanagedServers) environments.add(unmanaged);
	return [...environments];
}

function firstChangedFile(files: Set<string>) {
	for (const file of files) {
		return file;
	}

	return undefined;
}
