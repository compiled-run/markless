import { afterAll, expect, test } from 'vitest';
import {
	CHUNK_WORKER_MIN_CODE_LENGTH,
	closeChunkWorkers,
	runChunkTask,
} from '../src/build/chunk-workers.ts';
import { runChunkTaskInline, type ChunkTaskName } from '../src/build/chunk-tasks.ts';

afterAll(() => closeChunkWorkers());

// A rendered pack: namespace objects, bare vars, cross-chunk imports and exports, a facade-style
// dynamic import read, a Vite preload helper, and enough filler to clear the worker threshold.
function largeChunk(seed: string): string {
	const filler: string[] = [];
	for (let index = 0; filler.join('\n').length < CHUNK_WORKER_MIN_CODE_LENGTH; index++)
		filler.push(
			`function ${seed}_fill${index}(context) { return context.graph.read({ graphNodeId: "state:${seed}${index}", path: ["a", ${index}] }); }`,
		);
	return [
		`import { __exportAll } from "./runtime-${seed}.js";`,
		`import { __vitePreload as preload, init_preload_helper } from "./preload-${seed}.js";`,
		`import { long_${seed}_name as shared, other } from "./shared-${seed}.js";`,
		`var lazy_${seed}_exports = __exportAll({ value: () => value_${seed} });`,
		`var value_${seed} = 1;`,
		`var bare_${seed}_a;`,
		`var bare_${seed}_b;`,
		`init_preload_helper();`,
		`const load_${seed} = () => import("./pack-${seed}.js").then((m) => (m.init_pack(), m.symbol_${seed}));`,
		`const text = "see chunk-${seed}.js and ${seed}Word";`,
		...filler,
		`export const read_${seed} = () => Promise.resolve().then(() => lazy_${seed}_exports);`,
		`export { shared as ${seed}_shared, other, load_${seed}, text };`,
	].join('\n');
}

const tasks: ChunkTaskName[] = [
	'packTopLevelEdits',
	'shortNameChunkFacts',
	'chunkDynamicImports',
	'strippedPreloadHelper',
	'facadeChunkFacts',
];

test('a chunk worker answers every task exactly as the main thread does', async () => {
	const chunks = ['alpha', 'beta', 'gamma'].map((seed) => ({
		fileName: `build/chunk-${seed}.js`,
		code: largeChunk(seed),
	}));
	expect(chunks.every((chunk) => chunk.code.length >= CHUNK_WORKER_MIN_CODE_LENGTH)).toBe(true);
	for (const task of tasks)
		for (const chunk of chunks) {
			const fromWorker = await runChunkTask(task, chunk.fileName, chunk.code);
			expect(fromWorker, `${task} ${chunk.fileName}`).toEqual(
				runChunkTaskInline(task, chunk.fileName, chunk.code),
			);
		}
});

test('a task that throws on a worker rejects with its message', async () => {
	const code = `export const broken = ;\n${'// filler\n'.repeat(CHUNK_WORKER_MIN_CODE_LENGTH / 10)}`;
	const inline = (() => {
		try {
			return { value: runChunkTaskInline('shortNameChunkFacts', 'chunk.js', code) };
		} catch (error) {
			return { error };
		}
	})();
	const fromWorker = await runChunkTask('shortNameChunkFacts', 'chunk.js', code).then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
	expect('error' in fromWorker).toBe('error' in inline);
	if ('value' in inline && 'value' in fromWorker) expect(fromWorker.value).toEqual(inline.value);
});
