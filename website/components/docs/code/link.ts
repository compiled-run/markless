// Turns compiled modules into loadable URLs: each module's import specifiers are
// rewritten to the URLs of the modules they name, and each dynamic import becomes a
// call the host answers at run time.
import type { CompiledModule } from './protocol.ts';

export type LinkHost = {
	/** A URL that loads `code` as a module. */
	url(code: string): string;
	/** The URL of a runtime module the page provides, or undefined when `specifier` is not one. */
	runtime(specifier: string): Promise<string> | undefined;
	/** A JavaScript expression that imports `specifier` when evaluated. */
	dynamicImport(specifier: string): string;
};

export type Linker = {
	/** The URL of the module `specifier` names, linking it on first use. */
	url(specifier: string): Promise<string>;
	/** CSS of every style module linked so far. */
	readonly styles: readonly string[];
};

/** The module id a specifier names: `./x`, `/code/x` and `x?query` all name `x`. */
export function moduleKey(specifier: string): string {
	const bare = specifier.replace(/\?.*$/, '');
	if (bare.startsWith('./')) return bare.slice(2);
	if (bare.startsWith('/code/')) return bare.slice('/code/'.length);
	return bare;
}

export function createLinker(modules: readonly CompiledModule[], host: LinkHost): Linker {
	const byId = new Map(modules.map((module) => [module.id, module]));
	const urls = new Map<string, Promise<string>>();
	const linking = new Set<string>();
	const styles: string[] = [];

	async function linkModule(module: CompiledModule): Promise<string> {
		if (module.kind === 'style') {
			styles.push(module.code);
			return host.url('');
		}
		linking.add(module.id);
		try {
			let code = module.code;
			for (const site of [...module.imports].sort((a, b) => b.start - a.start)) {
				const replacement = site.dynamic
					? host.dynamicImport(site.specifier)
					: JSON.stringify(await url(site.specifier));
				code = code.slice(0, site.start) + replacement + code.slice(site.end);
			}
			return host.url(code);
		} finally {
			linking.delete(module.id);
		}
	}

	function url(specifier: string): Promise<string> {
		const runtime = host.runtime(specifier);
		if (runtime) return runtime;
		const key = moduleKey(specifier);
		if (linking.has(key))
			return Promise.reject(
				new Error(`${key} imports itself through a cycle, which a Code block cannot run.`),
			);
		let linked = urls.get(key);
		if (linked) return linked;
		const module = byId.get(key);
		if (!module)
			return Promise.reject(
				new Error(
					`Cannot import "${specifier}". A Code block can import @markless/core and the block's own .ts and .css files.`,
				),
			);
		linked = linkModule(module);
		urls.set(key, linked);
		return linked;
	}

	return { url, styles };
}
