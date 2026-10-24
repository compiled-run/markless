import { unwrapAsyncImportWrappersInCode } from './async-import-wrappers.ts';
import { readChunkDynamicImports } from './chunk-ast.ts';
import { facadeChunkFacts } from './lazy-module-facades.ts';
import { packTopLevelEdits } from './pack-top-level.ts';
import { helperImporterRewrite } from './preload-helper-removal.ts';
import { stripEmptyVitePreloadWrappers } from './preload-cleanup.ts';
import { shortNameChunkFacts } from './short-export-names.ts';

// Pure analyses of one chunk's code: the same answer on the main thread or in a chunk worker.
const CHUNK_TASKS = {
	packTopLevelEdits,
	shortNameChunkFacts,
	chunkDynamicImports: readChunkDynamicImports,
	facadeChunkFacts,
	strippedPreloadHelper: (_fileName: string, code: string) => stripEmptyVitePreloadWrappers(code),
	unwrappedAsyncImports: (_fileName: string, code: string) => unwrapAsyncImportWrappersInCode(code),
	helperImporterRewrite,
} as const;

export type ChunkTaskName = keyof typeof CHUNK_TASKS;
export type ChunkTaskResult<T extends ChunkTaskName> = ReturnType<(typeof CHUNK_TASKS)[T]>;
/** What a task reads besides the chunk; it crosses to the worker by structured clone. */
export type ChunkTaskContext<T extends ChunkTaskName> = Parameters<(typeof CHUNK_TASKS)[T]>[2];

export function runChunkTaskInline<T extends ChunkTaskName>(
	task: T,
	fileName: string,
	code: string,
	context?: ChunkTaskContext<T>,
): ChunkTaskResult<T> {
	return (CHUNK_TASKS[task] as (fileName: string, code: string, context: unknown) => unknown)(
		fileName,
		code,
		context,
	) as ChunkTaskResult<T>;
}
