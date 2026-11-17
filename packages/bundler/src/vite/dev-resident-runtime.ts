import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'pathe';
import { parseSync } from 'rolldown/experimental';
import type { Plugin } from 'vite';
import { mayContainDynamicImport, readChunkDynamicImports } from '../build/chunk-ast.ts';
import { DEV_RESIDENT_MODULE } from '../module-loads.ts';
import { pathname } from '../virtual-ids.ts';
import { marklessRuntimeSpecifierId } from '../build/delegate-loader.ts';
import { runtimeModuleIdFromOrigin } from '../build/bundle-graph.ts';

const RUNTIME_ENTRY = '@markless/web';

type ResolveContext = {
	resolve(
		source: string,
		importer?: string,
	): Promise<{ readonly id: string; readonly external?: boolean | string } | null>;
};

type Edges = { readonly loads: string[]; readonly lazy: string[] };

/**
 * On the dev server a runtime `import()` of its own module asks the dev-resident helper first, and the helper
 * names every such module for the first interaction to load, so a write after it finds its code loaded.
 */
export function devResidentRuntimeImports(
	runtimeRoots: () => ReadonlyArray<string> = runtimePackageRoots,
	helper: string | undefined = marklessRuntimeSpecifierId(DEV_RESIDENT_MODULE),
) {
	let roots: ReadonlyArray<string> | undefined;
	const inRuntime = (id: string) => {
		const file = pathname(id);
		return (roots ??= runtimeRoots()).some((root) => file.startsWith(root));
	};
	let lazyModules: Promise<string[]> | undefined;

	async function runtimeLazyModules(context: ResolveContext): Promise<string[]> {
		const edges = new Map<string, Promise<Edges>>();
		const lazy = new Set<string>();
		const visit = async (file: string): Promise<void> => {
			if (edges.has(file)) return;
			const found = moduleEdges(context, file, inRuntime);
			edges.set(file, found);
			const { loads, lazy: targets } = await found;
			for (const target of targets) lazy.add(target);
			await Promise.all([...loads, ...targets].map(visit));
		};
		await Promise.all(
			(roots ??= runtimeRoots()).flatMap((root) => runtimeEntryFiles(root)).map(visit),
		);
		return [...lazy].sort();
	}

	return async function transform(this: ResolveContext, code: string, id: string) {
		if (!helper || !inRuntime(id)) return null;
		if (pathname(id) === helper) {
			const modules = await (lazyModules ??= runtimeLazyModules(this));
			if (modules.length === 0) return null;
			const named = modules
				.map((module) => {
					const id = runtimeModuleIdFromOrigin(pathname(module));
					return `[${JSON.stringify(module)}, () => import(${JSON.stringify(module)}), ${JSON.stringify({ runtimeModuleId: id })}]`;
				})
				.join(', ');
			return { code: `${code}\nmarklessDevWarm('', '', [${named}]);\n`, map: null };
		}
		if (!mayContainDynamicImport(code)) return null;
		const found = readChunkDynamicImports(pathname(id), code);
		if (!found) return null;
		const edits: Array<{ readonly start: number; readonly end: number; readonly key: string }> = [];
		for (const entry of found) {
			if (!entry.plain || entry.specifier === undefined) continue;
			const target = await this.resolve(entry.specifier, id);
			if (!target || target.external || !inRuntime(target.id)) continue;
			edits.push({ start: entry.start, end: entry.end, key: target.id });
		}
		if (edits.length === 0) return null;
		let next = code;
		for (const edit of edits.sort((a, b) => b.start - a.start))
			next = `${next.slice(0, edit.start)}marklessDevLoad('', ${JSON.stringify(edit.key)}, () => ${next.slice(edit.start, edit.end)})${next.slice(edit.end)}`;
		return {
			code: `${next}\nimport { marklessDevLoad } from ${JSON.stringify(helper)};\n`,
			map: null,
		};
	};
}

// What one runtime module imports and lazily imports of the runtime, read from its module record.
async function moduleEdges(
	context: ResolveContext,
	file: string,
	inRuntime: (id: string) => boolean,
): Promise<Edges> {
	let code: string;
	try {
		code = readFileSync(pathname(file), 'utf8');
	} catch {
		return { loads: [], lazy: [] };
	}
	const { module, errors } = parseSync(pathname(file), code);
	if (errors.length > 0) return { loads: [], lazy: [] };
	const resolved = async (specifiers: string[]) =>
		(
			await Promise.all(
				specifiers.map(async (specifier) => {
					const target = await context.resolve(specifier, file);
					return target && !target.external && inRuntime(target.id) ? target.id : undefined;
				}),
			)
		).filter((id): id is string => id !== undefined);
	const loads = [
		...module.staticImports
			.filter((entry) => entry.entries.length === 0 || entry.entries.some((item) => !item.isType))
			.map((entry) => entry.moduleRequest.value),
		...module.staticExports.flatMap((entry) =>
			entry.entries.flatMap((item) =>
				item.moduleRequest && !item.isType ? [item.moduleRequest.value] : [],
			),
		),
	];
	const lazy = (readChunkDynamicImports(pathname(file), code) ?? []).flatMap((entry) =>
		entry.plain && entry.specifier !== undefined ? [entry.specifier] : [],
	);
	return { loads: await resolved(loads), lazy: await resolved(lazy) };
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
			// An installed runtime is pre-bundled, so the optimizer rewrites the same imports.
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

// The files a package's `exports` name, a `*` entry expanded over its directory.
export function runtimeEntryFiles(root: string): string[] {
	const exports = manifest(root)?.exports;
	const targets: string[] = [];
	const collect = (value: unknown): void => {
		if (typeof value === 'string') targets.push(value);
		else if (value && typeof value === 'object') {
			const conditions = value as Record<string, unknown>;
			collect(conditions.import ?? conditions.default);
		}
	};
	if (typeof exports === 'string') collect(exports);
	else if (exports && typeof exports === 'object')
		for (const value of Object.values(exports)) collect(value);
	return targets.flatMap((target) => {
		const file = join(root, target);
		const star = file.indexOf('*');
		if (star < 0) return [file];
		const prefix = file.slice(0, star);
		const suffix = file.slice(star + 1);
		try {
			return readdirSync(dirname(prefix))
				.map((name) => join(dirname(prefix), name))
				.filter((path) => path.startsWith(prefix) && path.endsWith(suffix));
		} catch {
			return [];
		}
	});
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

type Manifest = {
	readonly name?: string;
	readonly dependencies?: Record<string, string>;
	readonly exports?: unknown;
};

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
