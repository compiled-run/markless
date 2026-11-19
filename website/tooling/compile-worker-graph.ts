// Module graphs and sizes read from Rolldown itself. The docs' in-browser compiler is the compile worker built as the site
// builds it, with the same swaps of the bundler's Node-only imports and the same defines.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin, type Rollup } from 'vite';
import { codeCompilerSwaps, COMPILE_WORKER_DEFINE } from './code-client.ts';

export const COMPILE_WORKER_ENTRY = fileURLToPath(
	new URL('../components/docs/code/compile-worker.ts', import.meta.url),
);

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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
		root: ROOT,
		plugins: [...plugins, record],
		build: { write: false, minify: false, rollupOptions: { input: entry } },
	});
	return modules;
}

/** The docs' in-browser compiler. */
export const compileWorkerGraph = (): Promise<ModuleGraph> =>
	moduleGraph(COMPILE_WORKER_ENTRY, [codeCompilerSwaps()]);

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes of a minified chunk each source accounts for: from each source-map segment to the next on its line. */
function bytesBySource(chunk: Rollup.OutputChunk): Map<string, number> {
	const map = chunk.map!;
	const bytes = new Map<string, number>();
	const lines = chunk.code.split('\n');
	let source = 0;
	map.mappings.split(';').forEach((line, row) => {
		const segments: { column: number; source: number | null }[] = [];
		let column = 0;
		for (const segment of line.split(',')) {
			if (segment === '') continue;
			const values: number[] = [];
			let value = 0;
			let shift = 0;
			for (const char of segment) {
				const digit = BASE64.indexOf(char);
				value += (digit & 31) << shift;
				if (digit & 32) shift += 5;
				else {
					values.push(value & 1 ? -(value >> 1) : value >> 1);
					value = 0;
					shift = 0;
				}
			}
			column += values[0]!;
			if (values.length >= 4) source += values[1]!;
			segments.push({ column, source: values.length >= 4 ? source : null });
		}
		const end = lines[row]?.length ?? 0;
		segments.forEach((segment, index) => {
			if (segment.source === null) return;
			const id = map.sources[segment.source]!;
			const next = segments[index + 1]?.column ?? end;
			bytes.set(id, (bytes.get(id) ?? 0) + next - segment.column);
		});
	});
	return bytes;
}

/** Minified bytes per source module of a production browser build of `entry`, read from its source maps. */
export async function minifiedBytes(
	entry: string,
	plugins: Plugin[] = [],
	define: Readonly<Record<string, string>> = {},
): Promise<Map<string, number>> {
	const output = (await build({
		configFile: false,
		logLevel: 'silent',
		root: ROOT,
		plugins,
		define,
		build: { write: false, minify: true, sourcemap: true, rollupOptions: { input: entry } },
	})) as Rollup.RollupOutput | Rollup.RollupOutput[];
	const bytes = new Map<string, number>();
	for (const result of Array.isArray(output) ? output : [output])
		for (const file of result.output)
			if (file.type === 'chunk')
				for (const [id, size] of bytesBySource(file)) {
					// Sources are relative to the chunk's own place in the output folder.
					const path = resolve(dirname(join(ROOT, 'dist', file.fileName)), id);
					bytes.set(path, (bytes.get(path) ?? 0) + size);
				}
	return bytes;
}

/** The docs' in-browser compiler, minified as the site ships it. */
export const compileWorkerBytes = (define = COMPILE_WORKER_DEFINE): Promise<Map<string, number>> =>
	minifiedBytes(COMPILE_WORKER_ENTRY, [codeCompilerSwaps()], define);
