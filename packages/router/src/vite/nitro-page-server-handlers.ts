import type { Plugin as RolldownPlugin } from 'rolldown';
import type { Plugin } from 'vite';
import { resolve } from 'pathe';

// Nitro's scanned handlers (api/, middleware/) run from the page server's build, so both share one instance of each module.

interface HandlerScanningNitro {
	readonly scannedHandlers: readonly { readonly handler: string }[];
}

export interface PageServerHandlersState {
	nitro: HandlerScanningNitro | undefined;
	/** Each scanned handler file, by the page server output file that now holds it. */
	readonly built: Map<string, string>;
}

export function pageServerHandlersState(): PageServerHandlersState {
	return { nitro: undefined, built: new Map() };
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

export const PAGE_SERVER_HANDLERS_ID = 'virtual:markless-router/page-server-handlers';
const RESOLVED_PAGE_SERVER_HANDLERS_ID = `\0${PAGE_SERVER_HANDLERS_ID}`;

/** The page server entry imports every scanned handler, so the production page server build holds them. */
export function pageServerHandlerChunksPlugin(state: PageServerHandlersState): Plugin {
	let build = false;
	return {
		name: 'markless-router:page-server-handler-chunks',
		configResolved(config) {
			build = config.command === 'build';
		},
		resolveId: {
			filter: { id: new RegExp(`^${PAGE_SERVER_HANDLERS_ID}$`) },
			handler: () => RESOLVED_PAGE_SERVER_HANDLERS_ID,
		},
		load: {
			filter: { id: new RegExp(`^\\0${PAGE_SERVER_HANDLERS_ID}$`) },
			handler() {
				const files = build ? [...scannedHandlerFiles(state)] : [];
				return `export const pageServerHandlers = [${files
					.map((file) => `() => import(${JSON.stringify(file)})`)
					.join(', ')}];`;
			},
		},
		buildStart() {
			if (this.environment?.name === 'ssr') state.built.clear();
		},
		writeBundle(options, bundle) {
			if (this.environment?.name !== 'ssr' || !options.dir) return;
			const files = scannedHandlerFiles(state);
			for (const chunk of Object.values(bundle))
				if (
					chunk.type === 'chunk' &&
					chunk.facadeModuleId &&
					files.has(chunk.facadeModuleId)
				)
					state.built.set(chunk.facadeModuleId, resolve(options.dir, chunk.fileName));
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
				if (!dev) return state.built.get(source) ?? null;
				return scannedHandlerFiles(state).has(source)
					? `${DEV_HANDLER_PREFIX}${source}`
					: null;
			},
		},
		load(id) {
			if (!id.startsWith(DEV_HANDLER_PREFIX)) return null;
			return devHandlerSource(id.slice(DEV_HANDLER_PREFIX.length));
		},
	};
}

// Imported per request, so a handler the dev server reloaded answers with its new code.
function devHandlerSource(file: string): string {
	return `export default async function pageServerHandler(event) {
	const handler = (await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("ssr", ${JSON.stringify(file)})).default;
	if (typeof handler === "function") return handler(event);
	if (typeof handler?.handler === "function") return handler.handler(event);
	return handler.fetch(event.req);
}
`;
}
