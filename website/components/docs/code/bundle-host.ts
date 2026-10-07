// Runs the Markless bundler's own resolve, load and transform hooks over a block's files
// and the package source they import, the way a Rolldown build would, and returns every
// module the result can reach. A component imported from another file or package links
// exactly as it does in an app build.
import { createMarklessDevGraph } from '../../../../packages/bundler/src/dev.ts';
import type { MarklessHookContext } from '../../../../packages/bundler/src/hooks/hook-context.ts';
import { loadHook, resolveIdHook } from '../../../../packages/bundler/src/hooks/resolve-load.ts';
import { transformHook } from '../../../../packages/bundler/src/hooks/transform-hook.ts';
import { createPluginState } from '../../../../packages/bundler/src/plugin-state.ts';
import { stripEmittedTypes } from '../../../../packages/bundler/src/transform.ts';
import { importSites } from './import-sites.ts';
import type { CodeFile, CompiledModule, ImportSite } from './protocol.ts';

/** Where a block's source comes from. */
export type SourceHost = {
	/** The folder a block's files are placed in, ending in `/`. */
	readonly codeDir: string;
	/** The folder module ids are spelled relative to. */
	readonly root: string;
	/** Whether the result frame provides `specifier` itself, so it is never compiled. */
	isRuntime(specifier: string): boolean;
	/** The file a package specifier names, when the block may compile that package's source. */
	packageFile(specifier: string): string | undefined;
	/** Makes the block's files readable by the bundler. */
	placeBlock(files: readonly CodeFile[]): void;
	/** Reads a source file, or undefined when there is none. */
	read(path: string): Promise<string | undefined>;
	/** Files the bundler read synchronously before they were read; empty when none. */
	takeMisses(): Promise<string[]>;
};

/** A compile failure, with the module it happened in. */
export class ModuleBuildError extends Error {
	constructor(
		readonly moduleId: string,
		override readonly cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause));
	}
}

type ResolvedId = { readonly id: string; readonly external?: boolean };
type ModuleInfo = { id: string; isEntry: boolean; meta: Record<string, unknown>; code?: string };

const VIRTUAL_STRING = /["'`](virtual:markless:[^"'`\s]+)["'`]/g;
// The bundler re-reads files it meets synchronously once they are read; each round reads more.
const READ_ROUNDS = 12;

function keyOf(id: string): string {
	return id.startsWith('\0') ? id.slice(1) : id;
}

function folderOf(path: string): string {
	return path.slice(0, path.lastIndexOf('/') + 1);
}

function joinPath(folder: string, relative: string): string {
	const parts = folder.split('/').filter(Boolean);
	for (const part of relative.split('/')) {
		if (part === '..') parts.pop();
		else if (part !== '.' && part !== '') parts.push(part);
	}
	return `/${parts.join('/')}`;
}

function splitQuery(specifier: string): [string, string] {
	const at = specifier.indexOf('?');
	return at < 0 ? [specifier, ''] : [specifier.slice(0, at), specifier.slice(at)];
}

async function buildOnce(
	files: readonly CodeFile[],
	buildId: string,
	host: SourceHost,
): Promise<CompiledModule[]> {
	const state = createPluginState();
	const root = host.root;
	const ctx: MarklessHookContext = {
		state,
		internalOptions: { rootDir: root, buildId, executionLog: 'never', packing: false },
		dev: createMarklessDevGraph(),
		environment: 'client',
		linkedChildren: state.importedChildren as MarklessHookContext['linkedChildren'],
		getEnvironment: () => 'client',
		getRoot: () => root,
		attributionTables: () => {
			throw new Error('A Code block keeps no execution log.');
		},
	};
	const infos = new Map<string, ModuleInfo>();
	const built = new Map<string, Promise<string>>();
	const entries = new Set(files.map((file) => `${host.codeDir}${file.name}`));

	const pluginContext = {
		warn() {},
		error(error: unknown): never {
			throw error instanceof Error ? error : new Error(String(error));
		},
		emitFile: () => '',
		addWatchFile() {},
		getModuleInfo: (id: string) => infos.get(id) ?? null,
		resolve: (source: string, importer?: string) => resolve(source, importer),
		async load({ id }: { id: string }) {
			await build(id);
			return infos.get(id);
		},
	};
	// The hooks type their context as Rolldown's; this host gives them what they call.
	const hookContext = pluginContext as never;

	async function resolve(source: string, importer?: string): Promise<ResolvedId | null> {
		if (host.isRuntime(source)) return { id: source, external: true };
		const resolved = await resolveIdHook(ctx, hookContext, source, importer);
		if (resolved)
			return typeof resolved === 'string'
				? { id: resolved }
				: { id: resolved.id, external: Boolean((resolved as ResolvedId).external) };
		const [path, query] = splitQuery(source);
		const fromPackage = host.packageFile(path);
		if (fromPackage) return { id: `${fromPackage}${query}` };
		if (path.startsWith('/')) return { id: source };
		if (
			(path.startsWith('./') || path.startsWith('../')) &&
			importer &&
			!importer.startsWith('\0')
		)
			return { id: `${joinPath(folderOf(splitQuery(importer)[0]), path)}${query}` };
		return null;
	}

	function build(id: string): Promise<string> {
		let code = built.get(id);
		if (!code) {
			code = buildModule(id).catch((error: unknown) => {
				throw error instanceof ModuleBuildError ? error : new ModuleBuildError(id, error);
			});
			built.set(id, code);
		}
		return code;
	}

	async function buildModule(id: string): Promise<string> {
		const info: ModuleInfo = { id, isEntry: entries.has(id), meta: {} };
		infos.set(id, info);
		const loaded: unknown = await loadHook(ctx, hookContext, id);
		let code = typeof loaded === 'string' ? loaded : (loaded as { code?: string } | null)?.code;
		const [path] = splitQuery(id);
		code ??= await host.read(path);
		if (code === undefined) throw new Error(`Cannot find module "${id}".`);
		if (path.endsWith('.css')) return (info.code = code);
		const transformed = await transformHook(ctx, hookContext, code, id);
		code = typeof transformed === 'string' ? transformed : (transformed?.code ?? code);
		if (/\.tsx?$/.test(path)) code = await stripEmittedTypes(code, path);
		return (info.code = code);
	}

	const modules = new Map<string, CompiledModule>();
	const pending = [...entries];
	while (pending.length > 0) {
		const id = pending.shift()!;
		const key = keyOf(id);
		if (modules.has(key)) continue;
		const code = await build(id);
		if (/\.css(?:\?|$)/.test(key)) {
			modules.set(key, { id: key, kind: 'style', code, imports: [] });
			continue;
		}
		const imports: ImportSite[] = [];
		for (const site of importSites(code, key)) {
			if (site.computed) {
				imports.push(site);
				continue;
			}
			const target = await resolve(site.specifier, id);
			if (!target || target.external) {
				imports.push(site);
				continue;
			}
			imports.push({ ...site, specifier: keyOf(target.id) });
			pending.push(target.id);
		}
		// A loader may name a module only in a table of strings, imported at run time.
		for (const [, named] of code.matchAll(VIRTUAL_STRING)) {
			const target = await resolve(named!, id);
			if (target && !target.external) pending.push(target.id);
		}
		modules.set(key, { id: key, kind: 'script', code, imports });
	}
	return [...modules.values()];
}

/** Compiles `files` and every module they reach; throws a `ModuleBuildError` on failure. */
export async function buildBlock(
	files: readonly CodeFile[],
	buildId: string,
	host: SourceHost,
): Promise<CompiledModule[]> {
	host.placeBlock(files);
	for (let round = 0; ; round += 1) {
		let modules: CompiledModule[] | undefined;
		let failure: unknown;
		try {
			modules = await buildOnce(files, buildId, host);
		} catch (error) {
			failure = error;
		}
		const misses = await host.takeMisses();
		if (misses.length === 0 || round === READ_ROUNDS) {
			if (modules) return modules;
			throw failure;
		}
	}
}
