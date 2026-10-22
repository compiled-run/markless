import { parentPort } from 'node:worker_threads';
import { clearParsedChunkCode } from './chunk-ast.ts';
import { runChunkTaskInline, type ChunkTaskName } from './chunk-tasks.ts';

parentPort!.on(
	'message',
	(message: {
		id: number;
		task: ChunkTaskName;
		fileName: string;
		code: string;
		context: unknown;
	}) => {
		try {
			parentPort!.postMessage({
				id: message.id,
				result: runChunkTaskInline(
					message.task,
					message.fileName,
					message.code,
					message.context as never,
				),
			});
		} catch (error) {
			parentPort!.postMessage({
				id: message.id,
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
			});
		} finally {
			// A task's reads share one tree; kept past the task, every worker would hold a full parse cache of its own.
			clearParsedChunkCode();
		}
	},
);
