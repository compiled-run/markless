import {
	knowsChunkDynamicImports,
	mayContainDynamicImport,
	rememberChunkDynamicImports,
} from './chunk-ast.ts';
import type { ChunkTaskContext, ChunkTaskName, ChunkTaskResult } from './chunk-tasks.ts';
import { runChunkTaskInline } from './chunk-tasks.ts';
import { runChunkJob } from '../build-workers.ts';

// Below this a chunk's analysis costs less than posting it to a worker and back.
export const CHUNK_WORKER_MIN_CODE_LENGTH = 32 * 1024;

/** Runs a chunk analysis on a build worker when the chunk is large enough to pay for the trip. */
export function runChunkTask<T extends ChunkTaskName>(
	task: T,
	fileName: string,
	code: string,
	context?: ChunkTaskContext<T>,
): Promise<ChunkTaskResult<T>> {
	if (code.length >= CHUNK_WORKER_MIN_CODE_LENGTH)
		return runChunkJob(task, fileName, code, context);
	try {
		return Promise.resolve(runChunkTaskInline(task, fileName, code, context));
	} catch (error) {
		return Promise.reject(error);
	}
}

/** Reads the dynamic imports of every large chunk on the workers, so later passes find them cached. */
export async function prefetchChunkDynamicImports(
	chunks: Iterable<{ readonly fileName: string; readonly code: string }>,
): Promise<void> {
	await Promise.all(
		[...chunks]
			.filter(
				(chunk) =>
					chunk.code.length >= CHUNK_WORKER_MIN_CODE_LENGTH &&
					mayContainDynamicImport(chunk.code) &&
					!knowsChunkDynamicImports(chunk.fileName, chunk.code),
			)
			.map((chunk) =>
				runChunkTask('chunkDynamicImports', chunk.fileName, chunk.code).then(
					(found) => rememberChunkDynamicImports(chunk.fileName, chunk.code, found),
					// A read that throws is left to the synchronous path, which reports it where it did.
					() => {},
				),
			),
	);
}
