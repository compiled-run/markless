// Runs the Markless bundler's own resolve, load and transform hooks over a block's files
// and the package source they import, the way a Rolldown build would, and returns every
// module the result can reach. A component imported from another file or package links
// exactly as it does in an app build.
import { createMarklessDevGraph } from '../../../../packages/bundler/src/dev.ts';
import {
	invalidateAllGeneratedModules,
	invalidateEditedGeneratedModules,
} from '../../../../packages/bundler/src/dev-invalidation.ts';
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

/** What a module was built from: when all of it reads the same again, the build would too. */
type Trace = {
	readonly source: string;
	readonly code: string;
	/** Each resolve its hooks asked for, by `source\0importer`, and its answer. */
	readonly resolves: ReadonlyMap<string, string>;
	/** Each file its hooks resolved or watched, and that file's text. */
	readonly files: ReadonlyMap<string, string | undefined>;
	/** Each module its hooks loaded, and that module's code. */
	readonly loads: ReadonlyMap<string, string>;
};

type Recording = {
	readonly resolves: Map<string, string>;
	readonly paths: Set<string>;
	readonly loads: Map<string, string>;
};

/** What the last build did: the modules it ran the transform hook on, and the ids Markless invalidation named. */
export type BuildReport = {
	readonly transformed: readonly string[];
	readonly invalidated: readonly string[];
};

/** Builds one block again and again, rebuilding only the modules an edit changed. */
export type BlockBuilder = {
	/** Compiles `files` and every module they reach; throws a `ModuleBuildError` on failure. */
	build(files: readonly CodeFile[]): Promise<CompiledModule[]>;
	readonly lastBuild: BuildReport;
};

const TSRX_FILE = /\.tsrx$/;

function moduleFile(id: string): string {
	return splitQuery(keyOf(id))[0];
}

function fileOf(id: string): string | undefined {
	const [path] = splitQuery(id);
	return path.startsWith('/') ? path : undefined;
}

/** One block's compiles, sharing the bundler's state and every module's last build the way a dev server does. */
export function createBlockBuilder(host: SourceHost, buildId: string): BlockBuilder {
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
	const traces = new Map<string, Trace>();
	// Files a failed build may have left half-recorded in the bundler's state.
	const dirty = new Set<string>();
	let placed = new Map<string, string>();
	let report: { transformed: string[]; invalidated: string[] } = {
		transformed: [],
		invalidated: [],
	};

	function forget(ids: Iterable<string>, files: Iterable<string>): void {
		const keys = new Set([...ids].map(keyOf));
		const paths = new Set(files);
		for (const id of traces.keys())
			if (keys.has(keyOf(id)) || paths.has(moduleFile(id))) traces.delete(id);
	}

	async function invalidateAll(parent: string): Promise<void> {
		const ids = await invalidateAllGeneratedModules(ctx, parent, 'client');
		report.invalidated.push(...ids);
		forget(ids, [parent]);
	}

	async function invalidateDirty(): Promise<void> {
		const files = [...dirty];
		dirty.clear();
		for (const file of files) await invalidateAll(file);
	}

	// What a dev server calls on save: an edited `.tsrx` itself, else the `.tsrx` files importing the edit.
	async function invalidateEdits(files: readonly CodeFile[]): Promise<void> {
		const next = new Map(files.map((file) => [`${host.codeDir}${file.name}`, file.code]));
		for (const path of new Set([...placed.keys(), ...next.keys()])) {
			const code = next.get(path);
			if (placed.get(path) === code) continue;
			if (TSRX_FILE.test(path) && code !== undefined) {
				let ids: string[];
				try {
					ids = await invalidateEditedGeneratedModules(ctx, path, 'client', code);
				} catch {
					// Dev never gets here: its preflight stops an edit that does not compile.
					await invalidateAll(path);
					continue;
				}
				report.invalidated.push(...ids);
				forget(ids, []);
				continue;
			}
			if (TSRX_FILE.test(path)) await invalidateAll(path);
			const importers = new Set<string>();
			for (const [id, trace] of traces)
				if (trace.files.has(path) && TSRX_FILE.test(moduleFile(id)))
					importers.add(moduleFile(id));
			for (const importer of importers) await invalidateAll(importer);
		}
		placed = next;
	}

	async function buildRound(files: readonly CodeFile[]): Promise<CompiledModule[]> {
		const infos = new Map<string, ModuleInfo>();
		const built = new Map<string, Promise<string>>();
		const reads = new Map<string, Promise<string | undefined>>();
		const running: Promise<unknown>[] = [];
		const transforming = new Set<string>();
		const entries = new Set(files.map((file) => `${host.codeDir}${file.name}`));

		const read = (path: string) => {
			let text = reads.get(path);
			if (!text) reads.set(path, (text = host.read(path)));
			return text;
		};

		function contextFor(ancestors: ReadonlySet<string>, recording?: Recording) {
			const pluginContext = {
				warn() {},
				error(error: unknown): never {
					throw error instanceof Error ? error : new Error(String(error));
				},
				emitFile: () => '',
				addWatchFile(file: string) {
					recording?.paths.add(file);
				},
				getModuleInfo: (id: string) => infos.get(id) ?? null,
				async resolve(source: string, importer?: string) {
					const resolved = await resolve(source, importer, hookContext);
					if (recording) {
						recording.resolves.set(
							`${source}\0${importer ?? ''}`,
							JSON.stringify(resolved),
						);
						const file =
							resolved && !resolved.external ? fileOf(resolved.id) : undefined;
						if (file) recording.paths.add(file);
					}
					return resolved;
				},
				async load({ id }: { id: string }) {
					const code = await build(id, ancestors);
					recording?.loads.set(id, code);
					return infos.get(id);
				},
			};
			// The hooks type their context as Rolldown's; this host gives them what they call.
			const hookContext = pluginContext as never;
			return hookContext;
		}

		async function resolve(
			source: string,
			importer: string | undefined,
			hookContext: never,
		): Promise<ResolvedId | null> {
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

		function build(id: string, ancestors: ReadonlySet<string>): Promise<string> {
			let code = built.get(id);
			if (!code) {
				code = buildModule(id, new Set(ancestors).add(id)).catch((error: unknown) => {
					throw error instanceof ModuleBuildError
						? error
						: new ModuleBuildError(id, error);
				});
				built.set(id, code);
				running.push(code.catch(() => {}));
			}
			return code;
		}

		async function unchanged(trace: Trace, ancestors: ReadonlySet<string>): Promise<boolean> {
			for (const [path, text] of trace.files) if ((await read(path)) !== text) return false;
			const quiet = contextFor(ancestors);
			for (const [key, answer] of trace.resolves) {
				const [source, importer] = key.split('\0') as [string, string];
				try {
					if (
						JSON.stringify(await resolve(source, importer || undefined, quiet)) !==
						answer
					)
						return false;
				} catch {
					return false;
				}
			}
			for (const [id, code] of trace.loads) {
				if (ancestors.has(id)) return false;
				try {
					if ((await build(id, ancestors)) !== code) return false;
				} catch {
					return false;
				}
			}
			return true;
		}

		async function buildModule(id: string, ancestors: ReadonlySet<string>): Promise<string> {
			const info: ModuleInfo = { id, isEntry: entries.has(id), meta: {} };
			infos.set(id, info);
			const recording: Recording = {
				resolves: new Map(),
				paths: new Set(),
				loads: new Map(),
			};
			const hookContext = contextFor(ancestors, recording);
			const loaded: unknown = await loadHook(ctx, hookContext, id);
			let source =
				typeof loaded === 'string' ? loaded : (loaded as { code?: string } | null)?.code;
			const [path] = splitQuery(id);
			source ??= await read(path);
			if (source === undefined) throw new Error(`Cannot find module "${id}".`);
			const previous = traces.get(id);
			if (previous?.source === source && (await unchanged(previous, ancestors)))
				return (info.code = previous.code);
			traces.delete(id);
			let code = source;
			if (!path.endsWith('.css')) {
				transforming.add(id);
				report.transformed.push(id);
				const transformed = await transformHook(ctx, hookContext, source, id);
				code =
					typeof transformed === 'string' ? transformed : (transformed?.code ?? source);
				if (/\.tsx?$/.test(path)) code = await stripEmittedTypes(code, path);
			}
			const fileTexts = new Map<string, string | undefined>();
			for (const file of recording.paths) fileTexts.set(file, await read(file));
			traces.set(id, {
				source,
				code,
				resolves: recording.resolves,
				files: fileTexts,
				loads: recording.loads,
			});
			transforming.delete(id);
			return (info.code = code);
		}

		async function walk(): Promise<CompiledModule[]> {
			const walker = contextFor(new Set());
			const modules = new Map<string, CompiledModule>();
			const pending = [...entries];
			while (pending.length > 0) {
				const id = pending.shift()!;
				const key = keyOf(id);
				if (modules.has(key)) continue;
				const code = await build(id, new Set());
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
					const target = await resolve(site.specifier, id, walker);
					if (!target || target.external) {
						imports.push(site);
						continue;
					}
					imports.push({ ...site, specifier: keyOf(target.id) });
					pending.push(target.id);
				}
				// A loader may name a module only in a table of strings, imported at run time.
				for (const [, named] of code.matchAll(VIRTUAL_STRING)) {
					const target = await resolve(named!, id, walker);
					if (target && !target.external) pending.push(target.id);
				}
				modules.set(key, { id: key, kind: 'script', code, imports });
			}
			return [...modules.values()];
		}

		try {
			return await walk();
		} finally {
			// A build the failure cut short still finishes, so it never writes into the next one.
			for (let settled = 0; settled < running.length;) {
				const batch = running.slice(settled);
				settled = running.length;
				await Promise.all(batch);
			}
			for (const id of transforming) dirty.add(moduleFile(id));
			forget(transforming, []);
		}
	}

	return {
		get lastBuild(): BuildReport {
			return report;
		},
		async build(files) {
			report = { transformed: [], invalidated: [] };
			host.placeBlock(files);
			await invalidateDirty();
			await invalidateEdits(files);
			for (let round = 0; ; round += 1) {
				const transformedBefore = report.transformed.length;
				let modules: CompiledModule[] | undefined;
				let failure: unknown;
				try {
					modules = await buildRound(files);
				} catch (error) {
					failure = error;
				}
				const misses = await host.takeMisses();
				if (misses.length === 0 || round === READ_ROUNDS) {
					if (modules) return modules;
					throw failure;
				}
				// A module transformed while a file it read was missing is built again with it.
				const missed = report.transformed.slice(transformedBefore);
				for (const id of missed) dirty.add(moduleFile(id));
				forget(missed, []);
				await invalidateDirty();
			}
		},
	};
}

/** Compiles `files` and every module they reach from nothing; throws a `ModuleBuildError` on failure. */
export function buildBlock(
	files: readonly CodeFile[],
	buildId: string,
	host: SourceHost,
): Promise<CompiledModule[]> {
	return createBlockBuilder(host, buildId).build(files);
}
