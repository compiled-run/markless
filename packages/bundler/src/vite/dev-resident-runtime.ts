import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'pathe';
import type { Plugin } from 'vite';
import { mayContainDynamicImport, readChunkDynamicImports } from '../build/chunk-ast.ts';
import { DEV_RESIDENT_MODULE, moduleLoads } from '../module-loads.ts';
import { pathname } from '../virtual-ids.ts';
import { marklessRuntimeSpecifierId } from '../build/delegate-loader.ts';

const RUNTIME_ENTRY = '@markless/web';

type ResolveContext = {
	resolve(
		source: string,
		importer?: string,
	): Promise<{ readonly id: string; readonly external?: boolean | string } | null>;
};

// A dev `import()` fetches on first use, a task after the write that reached it; a build has packed code already on the page.
export function devResidentRuntimeImports(
	runtimeRoots: () => ReadonlyArray<string> = runtimePackageRoots,
) {
	let roots: ReadonlyArray<string> | undefined;
	const inRuntime = (id: string) => {
		const file = pathname(id);
		return (roots ??= runtimeRoots()).some((root) => file.startsWith(root));
	};
	return async function transform(this: ResolveContext, code: string, id: string) {
		if (!inRuntime(id) || !mayContainDynamicImport(code)) return null;
		const found = readChunkDynamicImports(pathname(id), code);
		if (!found) return null;
		const helper = marklessRuntimeSpecifierId(DEV_RESIDENT_MODULE);
		if (!helper) return null;
		const loads = moduleLoads(true, helper);
		const edits: Array<{
			readonly start: number;
			readonly end: number;
			readonly text: string;
		}> = [];
		for (const entry of found) {
			if (!entry.plain || entry.specifier === undefined) continue;
			const target = await this.resolve(entry.specifier, id);
			if (!target || target.external || !inRuntime(target.id)) continue;
			edits.push({ start: entry.start, end: entry.end, text: loads.load!(entry.specifier) });
		}
		if (edits.length === 0) return null;
		let next = code;
		for (const edit of edits.sort((a, b) => b.start - a.start))
			next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
		return { code: `${next}\n${loads.imports()}\n`, map: null };
	};
}

export function devResidentRuntimePlugin(): Plugin {
	const transform = devResidentRuntimeImports();
	return {
		name: 'markless:dev-resident-runtime',
		apply: 'serve',
		enforce: 'post',
		applyToEnvironment(environment) {
			return environment.config.consumer === 'client';
		},
		configEnvironment(name, config) {
			const consumer = config.consumer ?? (name === 'client' ? 'client' : 'server');
			if (consumer !== 'client') return undefined;
			// An installed runtime is pre-bundled, so the optimizer makes the same imports resident.
			return {
				optimizeDeps: {
					rolldownOptions: {
						plugins: [{ name: 'markless:dev-resident-runtime-deps', transform }],
					},
				},
			};
		},
		transform,
	};
}

// The runtime entry's package and the packages it depends on, as their real directories.
export function runtimePackageRoots(
	entry: string | undefined = import.meta.resolve?.(RUNTIME_ENTRY),
): string[] {
	if (!entry?.startsWith('file://')) return [];
	const root = packageRoot(dirname(fileURLToPath(entry)));
	if (!root) return [];
	const roots = new Set<string>();
	const visit = (directory: string) => {
		const real = realpathOf(directory);
		if (roots.has(`${real}/`)) return;
		roots.add(`${real}/`);
		for (const name of Object.keys(manifest(real)?.dependencies ?? {})) {
			const dependency = installedPackage(name, real);
			if (dependency) visit(dependency);
		}
	};
	visit(root);
	return [...roots];
}

type Manifest = { readonly name?: string; readonly dependencies?: Record<string, string> };

function manifest(directory: string): Manifest | undefined {
	try {
		return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest;
	} catch {
		return undefined;
	}
}

function packageRoot(from: string): string | undefined {
	for (let directory = from; ; directory = dirname(directory)) {
		if (manifest(directory)?.name) return directory;
		if (dirname(directory) === directory) return undefined;
	}
}

function installedPackage(name: string, from: string): string | undefined {
	for (let directory = from; ; directory = dirname(directory)) {
		const candidate = join(directory, 'node_modules', name);
		if (manifest(candidate)) return candidate;
		if (dirname(directory) === directory) return undefined;
	}
}

function realpathOf(path: string): string {
	try {
		return normalize(realpathSync(path));
	} catch {
		return normalize(path);
	}
}
