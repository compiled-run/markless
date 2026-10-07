// What the bundler's hooks import from node:url and vite, answered in the compile worker.
// A delegate child would need a module runner; the worker has none, so that edge reports.

export function pathToFileURL(path: string): URL {
	return new URL(`file://${path}`);
}

export function fileURLToPath(url: string | URL): string {
	const text = String(url);
	return text.startsWith('file://') ? decodeURIComponent(text.slice('file://'.length)) : text;
}

function unavailable(): never {
	throw new Error('A Code block cannot render a delegate component at build time.');
}

export const moduleRunnerTransform = unavailable;

export class ESModulesEvaluator {
	runInlinedModule = unavailable;
	runExternalModule = unavailable;
}

export const createNodeImportMeta = unavailable;
export const ssrImportKey = '__vite_ssr_import__';
export const ssrDynamicImportKey = '__vite_ssr_dynamic_import__';
export const ssrExportAllKey = '__vite_ssr_exportAll__';
export const ssrExportNameKey = '__vite_ssr_exportName__';
export const ssrImportMetaKey = '__vite_ssr_import_meta__';
export const ssrModuleExportsKey = '__vite_ssr_exports__';

/** The bundler's yield between module compiles; the worker has no `setImmediate`. */
export function yieldToEventLoop(): Promise<void> {
	return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
