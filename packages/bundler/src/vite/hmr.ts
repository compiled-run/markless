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
	MARKLESS_DEV_PAGE_EDIT_EVENT,
	MARKLESS_DEV_RELOADS_ATTRIBUTE,
	MARKLESS_DEV_RELOADS_EVENT,
	normalizeMarklessDevError,
	type MarklessDevErrorPayload,
} from '../dev-error/index.ts';
import {
	fetchableDevEnvironment,
	hasInProcessModuleRunner,
	isServerViteEnvironment,
	marklessEnvironment,
} from './environment.ts';
import { moduleIdFor } from '../module-id.ts';

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
	// Both come from the host that routes pages; without them every edit reloads every open page.
	isPage?: (moduleId: string) => boolean;
	pageForUrl?: (url: string) => string | undefined;
}

// The root-relative page module ids one edit reached, or every page.
type EditedPages = ReadonlySet<string> | 'all';

// The preflight of one saved source; the pass that starts it is the one that reports its outcome.
export interface SourceEdit {
	readonly source: string;
	readonly verdict: Promise<MarklessDevErrorPayload | undefined>;
}

// The last handled edit stays on every state so a byte-identical save stays silent.
export type SourceState =
	| { readonly kind: 'clean'; readonly edit?: SourceEdit }
	| {
			readonly kind: 'preflighting';
			readonly edit: SourceEdit;
			readonly shownError?: MarklessDevErrorPayload;
	  }
	| {
			readonly kind: 'invalid';
			readonly error: MarklessDevErrorPayload;
			readonly edit?: SourceEdit;
	  };

export type SourceEvent =
	| { readonly type: 'edit'; readonly edit: SourceEdit }
	| { readonly type: 'edit-passed'; readonly edit: SourceEdit }
	// No error: the edit failed on an error that belongs to another file.
	| {
			readonly type: 'edit-failed';
			readonly edit: SourceEdit;
			readonly error?: MarklessDevErrorPayload;
	  }
	| { readonly type: 'failed'; readonly error: MarklessDevErrorPayload }
	| { readonly type: 'passed' }
	| { readonly type: 'deleted' }
	| { readonly type: 'cleanup' };

const CLEAN_SOURCE: SourceState = { kind: 'clean' };

export function isInvalidSource(state: SourceState | undefined) {
	return state?.kind === 'invalid' || (state?.kind === 'preflighting' && !!state.shownError);
}

function shownError(state: SourceState) {
	return state.kind === 'invalid'
		? state.error
		: state.kind === 'preflighting'
			? state.shownError
			: undefined;
}

function withShownError(
	state: SourceState,
	error: MarklessDevErrorPayload | undefined,
): SourceState {
	if (state.kind === 'preflighting')
		return { kind: 'preflighting', edit: state.edit, shownError: error };
	return error
		? { kind: 'invalid', error, edit: state.edit }
		: { kind: 'clean', edit: state.edit };
}

export function transitionSourceState(state: SourceState, event: SourceEvent): SourceState {
	switch (event.type) {
		case 'edit':
			return { kind: 'preflighting', edit: event.edit, shownError: shownError(state) };
		case 'edit-passed':
		case 'edit-failed': {
			if (state.kind !== 'preflighting' || state.edit !== event.edit) {
				throw new Error(
					`Markless HMR: ${event.type} for an edit that is not in flight (${state.kind})`,
				);
			}
			const error =
				event.type === 'edit-failed' ? (event.error ?? state.shownError) : undefined;
			return withShownError({ kind: 'clean', edit: state.edit }, error);
		}
		case 'failed':
			return withShownError(state, event.error);
		case 'passed':
		case 'deleted':
		case 'cleanup':
			return withShownError(state, undefined);
	}
}

type RecheckInterval = ReturnType<typeof setInterval>;

// The interval runs exactly while some file is invalid, rechecking or not.
export type RecheckState =
	| { readonly kind: 'idle' }
	| { readonly kind: 'armed'; readonly interval: RecheckInterval }
	| { readonly kind: 'rechecking'; readonly interval?: RecheckInterval };

export type RecheckEvent =
	| { readonly type: 'first-invalid'; readonly interval: RecheckInterval }
	| { readonly type: 'none-invalid' }
	| { readonly type: 'tick' }
	| { readonly type: 'done' }
	| { readonly type: 'cleanup' };

export function recheckInterval(state: RecheckState) {
	return state.kind === 'idle' ? undefined : state.interval;
}

export function transitionRecheckState(
	state: RecheckState,
	event: RecheckEvent,
	someInvalid: boolean,
): RecheckState {
	const next = nextRecheckState(state, event);
	if (!next || !!recheckInterval(next) !== someInvalid) {
		throw new Error(
			`Markless HMR: recheck cannot go ${state.kind} -${event.type}-> ${next?.kind ?? '?'} with ${someInvalid ? 'an' : 'no'} invalid file`,
		);
	}
	return next;
}

function nextRecheckState(state: RecheckState, event: RecheckEvent): RecheckState | undefined {
	switch (event.type) {
		case 'first-invalid':
			if (state.kind === 'idle') return { kind: 'armed', interval: event.interval };
			if (state.kind === 'rechecking' && !state.interval) {
				return { kind: 'rechecking', interval: event.interval };
			}
			return undefined;
		case 'none-invalid':
			if (state.kind === 'armed') return { kind: 'idle' };
			if (state.kind === 'rechecking' && state.interval) return { kind: 'rechecking' };
			return undefined;
		case 'tick':
			return state.kind === 'armed'
				? { kind: 'rechecking', interval: state.interval }
				: undefined;
		case 'done':
			if (state.kind !== 'rechecking') return undefined;
			return state.interval ? { kind: 'armed', interval: state.interval } : { kind: 'idle' };
		case 'cleanup':
			// A recheck already running finishes on its own; it finds nothing left to clear.
			return state.kind === 'rechecking' ? { kind: 'rechecking' } : { kind: 'idle' };
	}
}

export function createViteHmr(options: ViteHmrOptions) {
	let server: ViteDevServer | undefined;
	// Module ids each out-of-process runner still has to be told about, keyed by
	// Vite environment name. Only environments with the fetch gate installed appear.
	const unreportedInvalidations = new Map<string, Set<string>>();

	// Edits that reloaded pages, each recorded once however many environment passes report it.
	const edits: EditedPages[] = [];
	let lastReloadedEdit: string | undefined;
	function recordEdit(edit: string, pages: EditedPages) {
		if (edit === lastReloadedEdit) return undefined;
		lastReloadedEdit = edit;
		return edits.push(pages) - 1;
	}

	// A page reports the edit count it was served after and its URL; it is stale when a later edit reached it.
	function servedPageIsStale(data: { reloads?: unknown; href?: unknown } | undefined) {
		const since = typeof data?.reloads === 'number' ? data.reloads : edits.length;
		const later = edits.slice(Math.max(0, since));
		if (later.length === 0) return false;
		const page =
			typeof data?.href === 'string' && options.pageForUrl
				? options.pageForUrl(data.href)
				: undefined;
		return later.some((pages) => pages === 'all' || page === undefined || pages.has(page));
	}

	// A pass is where this file invalidates the module graphs a render transforms
	// from, so a server render that starts mid-pass waits for that pass to finish.
	// Passes for later environments need no waiting: the first pass to observe an
	// edit already invalidated every environment for it.
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

		const cycle = hotUpdateCycle;
		hotUpdateCycle = undefined;
		cycle?.finish();
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

	const sources = new Map<string, SourceState>();
	let recheck: RecheckState = { kind: 'idle' };

	function someSourceInvalid() {
		for (const state of sources.values()) if (isInvalidSource(state)) return true;
		return false;
	}

	function setRecheck(event: RecheckEvent) {
		const next = transitionRecheckState(recheck, event, someSourceInvalid());
		const interval = recheckInterval(recheck);
		if (interval && interval !== recheckInterval(next)) clearInterval(interval);
		recheck = next;
	}

	function startRecheckInterval() {
		const interval = setInterval(() => {
			// A tick that lands while a recheck still runs is skipped.
			if (recheck.kind !== 'armed') return;
			setRecheck({ type: 'tick' });
			void recheckInvalidSources();
		}, options.invalidSourceRecheckMs ?? 300);
		interval.unref?.();
		return interval;
	}

	function commitSource(id: string, before: SourceState, after: SourceState) {
		// Moving a file that turns invalid to the end keeps the recheck visiting files in the order they broke.
		if (!isInvalidSource(before) && isInvalidSource(after)) sources.delete(id);
		if (after.kind === 'clean' && !after.edit) sources.delete(id);
		else sources.set(id, after);
	}

	function updateSource(id: string, event: SourceEvent) {
		const before = sources.get(id) ?? CLEAN_SOURCE;
		const after = transitionSourceState(before, event);
		commitSource(id, before, after);
		const wasInvalid = isInvalidSource(before);
		const isInvalid = isInvalidSource(after);
		if (!wasInvalid && isInvalid && !recheckInterval(recheck)) {
			setRecheck({ type: 'first-invalid', interval: startRecheckInterval() });
		} else if (wasInvalid && !isInvalid && !someSourceInvalid()) {
			setRecheck({ type: 'none-invalid' });
		}
		return wasInvalid && !isInvalid;
	}

	function markSourceFailed(error: MarklessDevErrorPayload) {
		if (!isTrackedSource(error.id)) return;
		updateSource(error.id, { type: 'failed', error });
	}

	function startEdit(sourceId: string, source: string) {
		const edit: SourceEdit = {
			source,
			verdict: preflightTsrxModuleDiagnostics({ filename: sourceId, source }).then(
				() => undefined,
				(error) => normalizeMarklessDevError(error, { id: sourceId }),
			),
		};
		updateSource(sourceId, { type: 'edit', edit });
		return edit;
	}

	function editInFlight(sourceId: string, edit: SourceEdit) {
		const state = sources.get(sourceId);
		return state?.kind === 'preflighting' && state.edit === edit;
	}

	async function recheckInvalidSources() {
		try {
			let recovered = false;
			for (const [id, state] of sources) {
				if (!isInvalidSource(state)) continue;
				let source: string;
				try {
					source = await readFile(id, 'utf8');
				} catch (error) {
					if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'EISDIR')) {
						if (updateSource(id, { type: 'deleted' })) sendClear(id);
					}
					continue;
				}

				try {
					await preflightTsrxModuleDiagnostics({ filename: id, source });
				} catch {
					continue;
				}

				if (!updateSource(id, { type: 'passed' })) continue;
				sendClear(id);
				recovered = true;
			}
			if (recovered) {
				recordEdit(`recovered\0${Date.now()}`, 'all');
				server?.environments?.[options.clientEnvironment]?.hot?.send?.({
					type: 'full-reload',
				});
			}
		} finally {
			setRecheck({ type: 'done' });
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
		for (const [id, state] of sources) {
			commitSource(id, state, transitionSourceState(state, { type: 'cleanup' }));
		}
		setRecheck({ type: 'cleanup' });
	}

	return {
		configureServer(nextServer: ViteDevServer) {
			server = nextServer;
			installRunnerInvalidationGate(nextServer);
			installServerRenderBarrier(nextServer);
			nextServer.httpServer?.once('close', cleanup);
			nextServer.watcher?.once?.('close', cleanup);
			if (options.enabled) {
				installFetchViteClient(nextServer, options, async () => {
					await settledHotUpdate();
					return edits.length;
				});
				nextServer.environments?.[options.clientEnvironment]?.hot?.on?.(
					MARKLESS_DEV_RELOADS_EVENT,
					(data: { reloads?: unknown; href?: unknown } | undefined, client) => {
						if (servedPageIsStale(data)) client.send({ type: 'full-reload' });
					},
				);
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
			markSourceFailed(payload);
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

	function loadedOrInvalid(environments: Iterable<DevEnvironment>, file: string) {
		const path = parsePath(file).pathname;
		if (isInvalidSource(sources.get(path))) return true;
		let answered = false;
		for (const environment of environments) {
			// Partial adapters and test doubles omit getModulesByFile; one that cannot say counts as loading it.
			if (typeof environment.moduleGraph?.getModulesByFile !== 'function') continue;
			answered = true;
			if (environment.moduleGraph.getModulesByFile(path)?.size) return true;
		}
		return !answered;
	}

	// The pages whose server render imports the edited file. Anything else that imports it, such
	// as the document every page shares, reaches a module nothing imports and so reaches every page.
	function editedPages(
		targets: Map<DevEnvironment, MarklessEnvironment>,
		file: string,
	): EditedPages {
		const isPage = options.isPage;
		const root = server?.config?.root;
		if (!isPage || !options.pageForUrl || !root) return 'all';
		const pageOf = (module: EnvironmentModuleNode) => {
			const id = module.file ? moduleIdFor(module.file, root) : undefined;
			return id !== undefined && isPage(id) ? id : undefined;
		};
		const pending: EnvironmentModuleNode[] = [];
		for (const [target, scope] of targets) {
			if (scope !== 'server') continue;
			pending.push(
				...(target.moduleGraph?.getModulesByFile?.(parsePath(file).pathname) ?? []),
			);
		}
		if (pending.length === 0) return 'all';

		const pages = new Set<string>();
		const seen = new Set<EnvironmentModuleNode>();
		while (pending.length > 0) {
			const module = pending.pop()!;
			if (seen.has(module)) continue;
			seen.add(module);
			const page = pageOf(module);
			const importers = [...(module.importers ?? [])];
			if (page) {
				pages.add(page);
				// A page's other importers are the router's page table; a page importing it renders it too.
				pending.push(...importers.filter((importer) => pageOf(importer)));
				continue;
			}
			if (importers.length === 0) return 'all';
			pending.push(...importers);
		}
		return pages;
	}

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

		const targets = invalidationTargets(server, options, environment, env);

		// The dev worker's module runner only drops evaluated modules when the reload
		// arrives on its own environment channel, and it needs one per edit even when
		// the client channel already reloaded for this file. Unmanaged server
		// environments (nitro) render pages from their own runner but skip this hook,
		// so whichever pass runs first has to deliver their reload too.
		const runnerHots = moduleRunnerHots(targets, hot);
		const reloadModuleRunner = () => {
			for (const runnerHot of runnerHots) runnerHot.send?.({ type: 'full-reload' });
		};

		if (!options.enabled) {
			hot.send({ type: 'full-reload' });
			reloadModuleRunner();
			return [];
		}

		const modules = new Set(ctx.modules ?? []);
		if (ctx.file) {
			for (const target of targets.keys()) {
				for (const module of target.moduleGraph?.getModulesByFile?.(ctx.file) ?? [])
					modules.add(module);
			}
		}
		// Adding or removing a file changes what every environment's glob imports list, the router's page table among them.
		const listingModules = new Map<DevEnvironment, Set<EnvironmentModuleNode>>();
		if (ctx.type !== 'update') {
			listingModules.set(environment, new Set(ctx.modules ?? []));
			for (const target of targets.keys()) {
				for (const module of await globImporters(target, ctx)) {
					const listed = listingModules.get(target) ?? new Set<EnvironmentModuleNode>();
					listed.add(module);
					listingModules.set(target, listed);
					modules.add(module);
				}
			}
		}
		// A file no environment loaded (a generated code-block file, a new unimported component) is no page's business.
		if (modules.size === 0 && ctx.file && !loadedOrInvalid(targets.keys(), ctx.file)) return [];
		for (const [target, listed] of listingModules) {
			for (const module of listed) {
				const invalidated = new Set<EnvironmentModuleNode>();
				target.moduleGraph?.invalidateModule?.(module, invalidated, ctx.timestamp, true);
				recordUnreportedInvalidation(target, invalidated);
			}
		}
		const files = changedFiles([...modules]);
		const root = server?.config?.root;
		if (ctx.file && SOURCE_FILE_EXTENSION.test(ctx.file)) {
			const prefix = root && `${root}/`;
			files.set(
				parsePath(ctx.file).pathname,
				prefix && ctx.file.startsWith(prefix)
					? `/${ctx.file.slice(prefix.length)}`
					: ctx.file,
			);
		}
		if (!files.size) {
			return undefined;
		}

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
				// The pass that started this edit's preflight reports it; the reload that races a later pass has already been sent.
				const handled = sources.get(sourceId)?.edit;
				if (handled?.source === editedSource) {
					await handled.verdict;
					return [];
				}
				const edit = startEdit(sourceId, editedSource);
				const error = await edit.verdict;
				const inFlight = editInFlight(sourceId, edit);
				if (error) {
					const ownError = error.id === sourceId && isTrackedSource(sourceId);
					if (inFlight) {
						updateSource(sourceId, {
							type: 'edit-failed',
							edit,
							error: ownError ? error : undefined,
						});
					}
					if (!inFlight || !ownError) markSourceFailed(error);
					hot.send({ type: 'custom', event: MARKLESS_DEV_ERROR_EVENT, data: error });
					return [];
				}
				if (
					updateSource(
						sourceId,
						inFlight ? { type: 'edit-passed', edit } : { type: 'passed' },
					)
				) {
					hot.send({
						type: 'custom',
						event: MARKLESS_DEV_ERROR_CLEAR_EVENT,
						data: { id: sourceId },
					});
				}
			}
		}

		const invalidationEnvironments = [...targets.keys()];
		const invalidationScopes = generatedModuleScopes(targets);
		const invalidatedGeneratedIds = new Set<string>();
		for (const [sourceId] of files) {
			const candidates =
				editedSource !== undefined && ctx.file
					? [ctx.file]
					: hmrCandidates(
							sourceId,
							ctx.file && SOURCE_FILE_EXTENSION.test(ctx.file) ? ctx.file : undefined,
						);
			for (const candidate of candidates) {
				for (const scope of invalidationScopes) {
					const invalidatedIds = await options.invalidateGeneratedModules?.(
						candidate,
						scope,
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
		}
		if (invalidatedGeneratedIds.size > 0) {
			options.invalidatePrerenderSnapshots?.([...invalidatedGeneratedIds].sort());
		}

		// The edited source and everything importing it must reach the out-of-process
		// runners too, not just the generated modules linked off them.
		if (ctx.file) {
			for (const targetEnvironment of invalidationEnvironments) {
				for (const module of targetEnvironment.moduleGraph?.getModulesByFile?.(ctx.file) ??
					[]) {
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
		const pages = ctx.type === 'update' && ctx.file ? editedPages(targets, ctx.file) : 'all';
		const edit = recordEdit(`${ctx.file}\0${ctx.timestamp}`, pages);
		if (pages === 'all') {
			hot.send({
				type: 'full-reload',
				path: firstChangedFile(files),
				triggeredBy: ctx.file,
			});
		} else if (edit !== undefined) {
			hot.send({ type: 'custom', event: MARKLESS_DEV_PAGE_EDIT_EVENT, data: { edit } });
		}

		return [];
	}
}

// Vite's glob plugin names, per environment, the modules whose import.meta.glob lists the added
// or removed file; asked here so the first pass refreshes every environment's listing.
async function globImporters(environment: DevEnvironment, ctx: HotUpdateOptions) {
	const plugin = environment.plugins?.find((candidate) => candidate.name === 'vite:import-glob');
	const hook = plugin?.hotUpdate;
	const handler = typeof hook === 'function' ? hook : hook?.handler;
	if (!handler) return [];
	const modules = await handler.call({ environment } as never, { ...ctx, modules: [] });
	return Array.isArray(modules) ? (modules as EnvironmentModuleNode[]) : [];
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

function isTrackedSource(id: string) {
	return isAbsolute(id) && SOURCE_FILE_EXTENSION.test(id);
}

function hasErrorCode(error: unknown, code: string) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === code
	);
}

function installFetchViteClient(
	server: ViteDevServer,
	options: ViteHmrOptions,
	servedAfterReloads: () => Promise<number>,
) {
	for (const environment of Object.values(server.environments)) {
		const fetchEnv = fetchableDevEnvironment(environment);
		if (!fetchEnv) continue;

		const dispatchFetch = fetchEnv.dispatchFetch.bind(fetchEnv);
		fetchEnv.dispatchFetch = async (request) => {
			const reloads = await servedAfterReloads();
			const response = await dispatchFetch(request);
			if (!response.headers.get('content-type')?.includes('text/html')) return response;

			const html = await response.text();
			const nextHtml = injectDevClients(html, options.base, reloads);
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

export function injectDevClients(html: string, base: string, reloads?: number) {
	if (!html) return html;
	const tags = [
		...(html.includes('/@vite/client')
			? []
			: [`<script type="module" src="${joinURL(base, '/@vite/client')}"></script>`]),
		...(html.includes(MARKLESS_DEV_ERROR_CLIENT_ID)
			? []
			: [
					`<script type="module" src="${joinURL(base, `/@id/__x00__${MARKLESS_DEV_ERROR_CLIENT_ID}`)}"${reloads === undefined ? '' : ` ${MARKLESS_DEV_RELOADS_ATTRIBUTE}="${reloads}"`}></script>`,
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

// Every environment this edit has to be invalidated in, each mapped to the Markless
// environment its generated modules were recorded under. Vite runs one hotUpdate pass
// per environment and the browser acts on the reload sent from the first of them, so
// that pass invalidates all of them rather than only its own.
function invalidationTargets(
	server: ViteDevServer | undefined,
	options: ViteHmrOptions,
	environment: DevEnvironment,
	env: MarklessEnvironment,
) {
	const targets = new Map<DevEnvironment, MarklessEnvironment>([[environment, env]]);
	const clientEnvironment = server?.environments?.[options.clientEnvironment];
	if (clientEnvironment) targets.set(clientEnvironment, 'client');
	for (const [name, candidate] of Object.entries(server?.environments ?? {})) {
		if (name === options.clientEnvironment || targets.has(candidate)) continue;

		// Vite calls nitro a server consumer while Markless declines to manage it: it
		// renders pages from its own runner but is given no hotUpdate pass of its own.
		const unmanaged =
			candidate.config?.consumer === 'server' && !isServerViteEnvironment(candidate);
		if (!unmanaged && marklessEnvironment(candidate) !== 'server') continue;
		targets.set(candidate, 'server');
	}

	return targets;
}

// Generated modules are cached per Markless environment, so each one present has to
// be invalidated by name; 'lib' environments never reach this hook.
function generatedModuleScopes(targets: Map<DevEnvironment, MarklessEnvironment>) {
	const scopes = new Set(targets.values());
	return (['client', 'server'] as const).filter((scope) => scopes.has(scope));
}

// Every server-side module runner that has to drop its evaluated modules for this edit.
function moduleRunnerHots(
	targets: Map<DevEnvironment, MarklessEnvironment>,
	clientChannel: DevEnvironment['hot'] | undefined,
) {
	const hots = new Set<DevEnvironment['hot']>();
	for (const [environment, scope] of targets) {
		if (scope !== 'server' || !environment.hot || environment.hot === clientChannel) {
			continue;
		}
		hots.add(environment.hot);
	}

	return [...hots];
}

function changedFiles(modules: EnvironmentModuleNode[]) {
	const files = new Map<string, string>();
	for (const module of modules) {
		for (const item of [module, ...(module.importers ?? [])]) {
			const url = sourceUrl(item);
			if (url) files.set(parsePath(item.id ?? item.file ?? url).pathname, url);
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

function firstChangedFile(files: Map<string, string>) {
	for (const file of files.values()) {
		return file;
	}

	return undefined;
}
