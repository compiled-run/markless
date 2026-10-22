import { readChunkDynamicImports } from './chunk-ast.ts';
import { facadeChunkFacts } from './lazy-module-facades.ts';
import { packTopLevelEdits } from './pack-top-level.ts';
import { stripEmptyVitePreloadWrappers } from './preload-cleanup.ts';
import { shortNameChunkFacts } from './short-export-names.ts';

// Pure analyses of one chunk's code: the same answer on the main thread or in a chunk worker.
const CHUNK_TASKS = {
	packTopLevelEdits,
	shortNameChunkFacts,
	chunkDynamicImports: readChunkDynamicImports,
	facadeChunkFacts,
	strippedPreloadHelper: (_fileName: string, code: string) => stripEmptyVitePreloadWrappers(code),
} as const;

export type ChunkTaskName = keyof typeof CHUNK_TASKS;
export type ChunkTaskResult<T extends ChunkTaskName> = ReturnType<(typeof CHUNK_TASKS)[T]>;

export function runChunkTaskInline<T extends ChunkTaskName>(
	task: T,
	fileName: string,
	code: string,
): ChunkTaskResult<T> {
	return CHUNK_TASKS[task](fileName, code) as ChunkTaskResult<T>;
}
