// A whole-module compile is a pure function of its input, and one build asks for
// the same module more than once: the plain import and the `?markless-symbols`
// request compile it twice, and every module that re-exports through a package
// barrel compiles each family again just to read its interface. This memo keys
// on the input itself, so a changed source is a different key and nothing has to
// be invalidated by hand.
import type { CompileTsrxModuleInput, CompileTsrxModuleResult } from './artifacts.ts';

// Eviction only costs a recompile, so this bounds a long dev session's memory
// rather than deciding correctness.
const MAX_ENTRIES = 512;

// Outer key is the source text itself: stringifying it into every key cost more than the compiles the memo saved.
const compiles = new Map<string, Map<string, Promise<CompileTsrxModuleResult>>>();
let entries = 0;

// Sorted, because the two requests for one module build their interface records
// in whatever order they resolved imports; the values are compiler artifacts,
// whose own key order is fixed by the code that builds them.
function sortedRecordEntries(record: Readonly<Record<string, unknown>> | undefined) {
	if (!record) return null;
	return Object.keys(record)
		.sort()
		.map((key) => [key, record[key]]);
}

// Every field `compileTsrxModule` reads besides `source`, the outer key. A field left out here would serve one
// request's output to a different request, so this list must track the input type.
export function compileCacheKey(input: CompileTsrxModuleInput): string | null {
	try {
		return JSON.stringify([
			input.filename,
			input.moduleId ?? null,
			input.buildId ?? null,
			input.resolverId ?? null,
			input.omitAuthoredSource === true,
			input.additionalFrameworkApiSources ?? null,
			input.symbols,
			sortedRecordEntries(input.importedModuleInterfaces),
			sortedRecordEntries(input.importedModuleConstants),
			sortedRecordEntries(input.artifactChildMaterializations),
		]);
	} catch {
		return null;
	}
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
	const pending = compile();
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
			if (owner.size === 0 && compiles.get(input.source) === owner) compiles.delete(input.source);
		}
	});
	for (const [source, oldest] of compiles) {
		if (entries <= MAX_ENTRIES || oldest === owner) break;
		compiles.delete(source);
		entries -= oldest.size;
	}
	return pending;
}

export function clearCompileCache(): void {
	compiles.clear();
	entries = 0;
}

export function compileCacheSize(): number {
	return entries;
}
