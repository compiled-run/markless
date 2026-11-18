import type { Plugin as RolldownPlugin } from 'rolldown';
import type { Plugin } from 'vite';
import { resolve } from 'pathe';

// Nitro's scanned handlers (api/, middleware/) run from the page server's build, so both share one instance of each module.

interface RoutedHandler {
	readonly handler: string;
	readonly env?: string | readonly string[];
}

interface HandlerScanningNitro {
	readonly options?: { readonly plugins?: readonly string[] };
	readonly scannedHandlers: readonly RoutedHandler[];
	readonly routing: {
		readonly routes: {
			readonly routes: Record<
				string,
				{ readonly data: RoutedHandler | readonly RoutedHandler[] }
			>;
		};
		readonly routedMiddleware: {
			readonly routes: Record<string, { readonly data: RoutedHandler }>;
		};
		readonly globalMiddleware: readonly RoutedHandler[];
	};
}

export interface PageServerHandlersState {
	nitro: HandlerScanningNitro | undefined;
	/** Each scanned handler file, by the page server output file that now holds it. */
	readonly built: Map<string, string>;
	/** Every module the production page server build holds. */
	readonly pageServerModules: Set<string>;
}

export function pageServerHandlersState(): PageServerHandlersState {
	return { nitro: undefined, built: new Map(), pageServerModules: new Set() };
}

export function pageServerHandlersModule(state: PageServerHandlersState) {
	return {
		name: 'markless-router:page-server-handlers',
		setup(nitro: HandlerScanningNitro) {
			state.nitro ??= nitro;
		},
	};
}

function scannedHandlerFiles(state: PageServerHandlersState): ReadonlySet<string> {
	return new Set(state.nitro?.scannedHandlers.map((handler) => handler.handler) ?? []);
}

/** The scanned handlers this server answers with: Nitro's routing has already dropped those for another env. */
export function pageServerHandlerFiles(nitro: HandlerScanningNitro | undefined): string[] {
	if (!nitro) return [];
	const routed = new Set(
		[
			...Object.values(nitro.routing.routes.routes).flatMap((route) => route.data),
			...Object.values(nitro.routing.routedMiddleware.routes).map((route) => route.data),
			...nitro.routing.globalMiddleware,
		].map((handler) => handler.handler),
	);
	// Nitro's prerenderer is a second Nitro whose routing also takes .prerender handlers.
	const prerender = (handler: RoutedHandler) => [handler.env].flat().includes('prerender');
	return nitro.scannedHandlers
		.filter((handler) => routed.has(handler.handler) || prerender(handler))
		.map((handler) => handler.handler);
}

export const PAGE_SERVER_HANDLERS_ID = 'virtual:markless-router/page-server-handlers';
const RESOLVED_PAGE_SERVER_HANDLERS_ID = `\0${PAGE_SERVER_HANDLERS_ID}`;
// One module per handler that only this list imports, so each gets its own chunk even when a page imports the handler.
const HANDLER_ENTRY_PREFIX = '\0markless-router:page-server-handler-entry:';

/** The page server entry imports every scanned handler, so the production page server build holds them. */
export function pageServerHandlerChunksPlugin(state: PageServerHandlersState): Plugin {
	let build = false;
	return {
		name: 'markless-router:page-server-handler-chunks',
		configResolved(config) {
			build = config.command === 'build';
		},
		resolveId(source) {
			if (source === PAGE_SERVER_HANDLERS_ID) return RESOLVED_PAGE_SERVER_HANDLERS_ID;
			return source.startsWith(HANDLER_ENTRY_PREFIX) ? source : null;
		},
		load(id) {
			if (id.startsWith(HANDLER_ENTRY_PREFIX))
				return `export { default } from ${JSON.stringify(id.slice(HANDLER_ENTRY_PREFIX.length))};`;
			if (id !== RESOLVED_PAGE_SERVER_HANDLERS_ID) return null;
			const files = build ? pageServerHandlerFiles(state.nitro) : [];
			return `export const pageServerHandlers = [${files
				.map((file) => `() => import(${JSON.stringify(`${HANDLER_ENTRY_PREFIX}${file}`)})`)
				.join(', ')}];`;
		},
		buildStart() {
			if (this.environment?.name !== 'ssr') return;
			state.built.clear();
			state.pageServerModules.clear();
		},
		writeBundle(options, bundle) {
			if (this.environment?.name !== 'ssr' || !options.dir) return;
			for (const chunk of Object.values(bundle)) {
				if (chunk.type !== 'chunk') continue;
				for (const id of chunk.moduleIds) state.pageServerModules.add(id);
				if (chunk.facadeModuleId?.startsWith(HANDLER_ENTRY_PREFIX))
					state.built.set(
						chunk.facadeModuleId.slice(HANDLER_ENTRY_PREFIX.length),
						resolve(options.dir, chunk.fileName),
					);
			}
		},
	};
}

const DEV_HANDLER_PREFIX = '\0markless-router:page-server-handler:';

/** Points Nitro's import of each scanned handler at the page server's copy of it. */
export function pageServerHandlerImportsPlugin(
	state: PageServerHandlersState,
	dev: boolean,
): RolldownPlugin {
	return {
		name: 'markless-router:page-server-handler-imports',
		resolveId: {
			order: 'pre',
			handler(source) {
				if (!scannedHandlerFiles(state).has(source)) return null;
				if (dev) return `${DEV_HANDLER_PREFIX}${source}`;
				const built = state.built.get(source);
				if (!built) this.error(missingPageServerHandlerMessage(source));
				return built;
			},
		},
		load(id) {
			if (!id.startsWith(DEV_HANDLER_PREFIX)) return null;
			return devHandlerSource(id.slice(DEV_HANDLER_PREFIX.length));
		},
		generateBundle() {
			if (dev) return;
			for (const [plugin, shared] of pluginsSharingPageServerModules(
				state.nitro?.options?.plugins ?? [],
				state.pageServerModules,
				(id) => this.getModuleInfo(id),
			))
				this.warn(sharedPluginModuleMessage(plugin, shared));
		},
	};
}

// Nitro starts its plugins before the page server loads, so they keep their own copy of each module; say so.
export function pluginsSharingPageServerModules(
	plugins: readonly string[],
	pageServerModules: ReadonlySet<string>,
	moduleInfo: (
		id: string,
	) => {
		readonly importedIds: readonly string[];
		readonly dynamicallyImportedIds: readonly string[];
	} | null,
): Map<string, string[]> {
	const sharing = new Map<string, string[]>();
	for (const plugin of new Set(plugins)) {
		const seen = new Set<string>();
		const pending = [plugin];
		while (pending.length > 0) {
			const id = pending.pop()!;
			if (seen.has(id)) continue;
			seen.add(id);
			const info = moduleInfo(id);
			if (info) pending.push(...info.importedIds, ...info.dynamicallyImportedIds);
		}
		const shared = [...seen].filter((id) => pageServerModules.has(id)).sort();
		if (shared.length > 0) sharing.set(plugin, shared);
	}
	return sharing;
}

export function sharedPluginModuleMessage(plugin: string, shared: readonly string[]): string {
	return `Markless Router: the Nitro plugin ${plugin} imports modules the page server also holds, and gets its own copy of each, so state it keeps there (a store it seeds, a connection) is not what pages and api/ routes see:\n${shared.map((id) => `- ${id}`).join('\n')}`;
}

export function missingPageServerHandlerMessage(file: string): string {
	return `Markless Router: the page server build holds no copy of ${file}, so this handler would get a second instance of every module it shares with pages. Check that the file is not excluded from the page server build.`;
}

// Imported per request, so a handler the dev server reloaded answers with its new code.
function devHandlerSource(file: string): string {
	return `export default async function pageServerHandler(event, ...rest) {
	const handler = (await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("ssr", ${JSON.stringify(file)})).default;
	if (typeof handler === "function") return handler(event, ...rest);
	if (typeof handler?.handler === "function") return handler.handler(event, ...rest);
	return handler.fetch(event.req);
}
`;
}
