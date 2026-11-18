// Module graphs read from Rolldown itself: every module a build of an entry loads, tree-shaken or not. The docs' in-browser
// compiler is the compile worker built as the site builds it, with the same swaps of the bundler's Node-only imports.
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';
import { codeCompilerSwaps } from './code-client.ts';

export const COMPILE_WORKER_ENTRY = fileURLToPath(
	new URL('../components/docs/code/compile-worker.ts', import.meta.url),
);

export type ModuleGraph = ReadonlyMap<string, { readonly importedIds: ReadonlyArray<string> }>;

/** Every module a browser build of `entry` loads, with the ids each imports. */
export async function moduleGraph(entry: string, plugins: Plugin[] = []): Promise<ModuleGraph> {
	const modules = new Map<string, { readonly importedIds: ReadonlyArray<string> }>();
	const record: Plugin = {
		name: 'module-graph',
		generateBundle() {
			for (const id of this.getModuleIds())
				modules.set(id, { importedIds: this.getModuleInfo(id)?.importedIds ?? [] });
		},
	};
	await build({
		configFile: false,
		logLevel: 'silent',
		root: fileURLToPath(new URL('..', import.meta.url)),
		plugins: [...plugins, record],
		build: { write: false, minify: false, rollupOptions: { input: entry } },
	});
	return modules;
}

/** The docs' in-browser compiler. */
export const compileWorkerGraph = (): Promise<ModuleGraph> =>
	moduleGraph(COMPILE_WORKER_ENTRY, [codeCompilerSwaps()]);
