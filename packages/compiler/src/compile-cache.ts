// A whole-module compile is a pure function of its input, and one build asks for
// the same module more than once: the plain import and the `?markless-symbols`
// request compile it twice, and every module that re-exports through a package
// barrel compiles each family again just to read its interface. This memo keys
// on the input itself, so a changed source is a different key and nothing has to
// be invalidated by hand.
import type { CompileTsrxModuleInput, CompileTsrxModuleResult } from './artifacts.ts';

// Eviction only costs a recompile, so this bounds a long dev session's memory rather than deciding correctness.
// At 512, a 123-page app re-ran 5,203 of its 8,160 compiles after eviction; holding them all did not raise peak memory.
const DEFAULT_MAX_ENTRIES = 16_384;
let maxEntries = DEFAULT_MAX_ENTRIES;

// Outer key is the source text itself: stringifying it into every key cost more than the compiles the memo saved.
const compiles = new Map<string, Map<string, Promise<CompileTsrxModuleResult>>>();
let entries = 0;

// Sorted, because the two requests for one module build their interface records
// in whatever order they resolved imports; the values are compiler artifacts,
// whose own key order is fixed by the code that builds them.
function sortedRecordJson(record: Readonly<Record<string, unknown>> | undefined): string {
	if (!record) return 'null';
	return `[${Object.keys(record)
		.sort()
		.map((key) => `[${JSON.stringify(key)},${artifactJson(record[key])}]`)
		.join(',')}]`;
}

// One child's interface reaches every module that imports it, so its text is built once, not per importer.
// Artifacts are never mutated: the memo below already hands one result object to every request.
const artifactJsonByObject = new WeakMap<object, string>();

function artifactJson(value: unknown): string {
	if (!value || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	let json = artifactJsonByObject.get(value);
	if (json === undefined) artifactJsonByObject.set(value, (json = JSON.stringify(value)));
	return json;
}

// Every field `compileTsrxModule` reads besides `source`, the outer key. A field left out here would serve one
// request's output to a different request, so this list must track the input type.
export function compileCacheKey(input: CompileTsrxModuleInput): string | null {
	try {
		return `${JSON.stringify([
			input.filename,
			input.moduleId ?? null,
			input.buildId ?? null,
			input.resolverId ?? null,
			input.omitAuthoredSource === true,
			input.additionalFrameworkApiSources ?? null,
			input.serverOnlyProps ?? null,
			input.routeRoot === true,
			input.symbols,
		])}${sortedRecordJson(input.importedModuleInterfaces)}${sortedRecordJson(
			input.importedModuleConstants,
		)}${sortedRecordJson(input.artifactChildMaterializations)}`;
	} catch {
		return null;
	}
}

/**
 * A compile store that outlives the process, keyed by the input itself; the host owns where results live.
 * Reads are synchronous: a stored result must arrive in the same turn a compile would start in, because the
 * bundler's claim publication counts on siblings publishing without another task running in between.
 */
export type PersistentCompileStore = {
	read(source: string, key: string): CompileTsrxModuleResult | undefined;
	write(source: string, key: string, result: CompileTsrxModuleResult): void;
};

let persistent: PersistentCompileStore | undefined;

export function usePersistentCompileStore(store: PersistentCompileStore | undefined): void {
	persistent = store;
}

/**
 * Compiles somewhere else, such as a worker thread, and writes the result to the persistent store itself when
 * one is set. Returns undefined, or resolves undefined, to have the compile run here instead.
 */
export type CompileRunner = (
	input: CompileTsrxModuleInput,
	key: string,
) => Promise<CompileTsrxModuleResult | undefined> | undefined;

let runner: CompileRunner | undefined;

export function useCompileRunner(next: CompileRunner | undefined): void {
	runner = next;
}

function compileThroughStore(
	input: CompileTsrxModuleInput,
	key: string,
	compile: () => Promise<CompileTsrxModuleResult>,
): Promise<CompileTsrxModuleResult> {
	const store = persistent;
	const stored = store?.read(input.source, key);
	if (stored) return Promise.resolve(stored);
	const compileHere = () =>
		compile().then((result) => {
			store?.write(input.source, key, result);
			return result;
		});
	const elsewhere = runner?.(input, key);
	// A compile that throws elsewhere runs again here, so the error the caller sees is the compiler's own.
	return elsewhere ? elsewhere.then((result) => result ?? compileHere()) : compileHere();
}

export function memoizedCompile(
	input: CompileTsrxModuleInput,
	compile: () => Promise<CompileTsrxModuleResult>,
): Promise<CompileTsrxModuleResult> {
	const key = compileCacheKey(input);
	if (key === null) return compile();
	let bySource = compiles.get(input.source);
	const cached = bySource?.get(key);
	if (cached) {
		compiles.delete(input.source);
		compiles.set(input.source, bySource!);
		return cached;
	}
	const pending = compileThroughStore(input, key, compile);
	if (!bySource) compiles.set(input.source, (bySource = new Map()));
	bySource.set(key, pending);
	entries++;
	// A throwing compile is not remembered: the transform hook answers one by
	// recompiling against a wider link input, and a stored rejection nobody
	// awaits again would also surface as an unhandled rejection.
	const owner = bySource;
	pending.catch(() => {
		if (owner.get(key) === pending) {
			owner.delete(key);
			entries--;
			if (owner.size === 0 && compiles.get(input.source) === owner)
				compiles.delete(input.source);
		}
	});
	for (const [source, oldest] of compiles) {
		if (entries <= maxEntries || oldest === owner) break;
		compiles.delete(source);
		entries -= oldest.size;
	}
	return pending;
}

export function clearCompileCache(): void {
	compiles.clear();
	entries = 0;
}

/** Bounds the memo to `limit` entries (the default when undefined) and returns the bound it replaced. */
export function setCompileCacheLimit(limit: number | undefined): number {
	const previous = maxEntries;
	maxEntries = limit ?? DEFAULT_MAX_ENTRIES;
	return previous;
}

export function compileCacheSize(): number {
	return entries;
}
