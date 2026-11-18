import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
	compileWorkerBytes,
	compileWorkerGraph,
	moduleGraph,
	type ModuleGraph,
} from './compile-worker-graph.ts';

const at = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const COMPILER = at('packages/compiler/src/index.ts');
const NATIVE = at('packages/compiler/src/native.ts');
const MOBILE = at('packages/mobile/src/index.ts');
const NATIVE_FACTS_MODULE = at('packages/compiler/src/passes/semantic-graph/native-facts-flag.ts');
const MOBILE_PACKAGE = `${dirname(at('packages/mobile/package.json'))}/`;

/** Every module reachable from `roots` through the imports `graph` records. */
function closure(graph: ModuleGraph, roots: Iterable<string>): Set<string> {
	const seen = new Set<string>();
	const queue = [...roots];
	for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
		if (seen.has(id)) continue;
		seen.add(id);
		queue.push(...(graph.get(id)?.importedIds ?? []));
	}
	return seen;
}

const reached = (graph: ModuleGraph, ids: Iterable<string>) => [...ids].filter((id) => graph.has(id)).sort();

it('the docs in-browser compiler loads no native-only module', async () => {
	const [worker, compiler, native, mobile] = await Promise.all([
		compileWorkerGraph(),
		moduleGraph(COMPILER),
		moduleGraph(NATIVE),
		moduleGraph(MOBILE),
	]);
	// Native-only: what the native entry's own modules load that the compiler's main entry does not, and the mobile package.
	const nativeRoots = native.get(NATIVE)?.importedIds ?? [];
	const nativeOnly = new Set([
		...[...closure(native, nativeRoots)].filter((id) => !compiler.has(id)),
		...[...mobile.keys()].filter((id) => id.startsWith(MOBILE_PACKAGE)),
	]);
	expect(nativeRoots.length).toBeGreaterThan(0);
	expect(reached(compiler, nativeRoots), 'the compiler main entry loads the native entry modules').toEqual([]);
	expect(reached(worker, nativeOnly), 'the compile worker loads native-only modules').toEqual([]);
}, 120_000);

// Every call of the native collectors in the shared analyzer goes through that module, guarded by its flag, which the site
// defines false for the worker: a call site left unguarded keeps the module's code in the shipped worker.
it('the docs in-browser compiler carries no native-fact call site of the analyzer', async () => {
	const [shipped, unfolded] = await Promise.all([compileWorkerBytes(), compileWorkerBytes({})]);
	expect(unfolded.get(NATIVE_FACTS_MODULE) ?? 0, 'without the define, the worker calls the collectors').toBeGreaterThan(0);
	expect(shipped.get(NATIVE_FACTS_MODULE) ?? 0, "the native-facts module's minified bytes in the shipped worker").toBe(0);
}, 300_000);
