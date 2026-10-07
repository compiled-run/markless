import type { FetchResult, ViteDevServer } from 'vite';
import type { FetchFunctionOptions } from 'vite/module-runner';
import { marklessRuntimeSpecifierId } from '../build/delegate-loader.ts';

// Vite marks a bare specifier external for every importer at once, so the runner gets the resolveId file instead.
export function installDevRuntimeImportResolution(
	server: ViteDevServer,
	clientEnvironment: string,
) {
	for (const [name, environment] of Object.entries(server.environments ?? {})) {
		if (name === clientEnvironment || typeof environment.fetchModule !== 'function') continue;
		const fetchModule = environment.fetchModule.bind(environment);
		environment.fetchModule = (
			id: string,
			importer?: string,
			options?: FetchFunctionOptions,
		): Promise<FetchResult> =>
			fetchModule(marklessRuntimeSpecifierId(id) ?? id, importer, options);
	}
}
