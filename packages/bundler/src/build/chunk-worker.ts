import { parentPort } from 'node:worker_threads';
import { runChunkTaskInline, type ChunkTaskName } from './chunk-tasks.ts';

parentPort!.on(
	'message',
	(message: { id: number; task: ChunkTaskName; fileName: string; code: string }) => {
		try {
			parentPort!.postMessage({
				id: message.id,
				result: runChunkTaskInline(message.task, message.fileName, message.code),
			});
		} catch (error) {
			parentPort!.postMessage({
				id: message.id,
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
			});
		}
	},
);
