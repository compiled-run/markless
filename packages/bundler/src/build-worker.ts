import { serialize } from 'node:v8';
import { parentPort } from 'node:worker_threads';
import {
	clearCompileCache,
	compileTsrxModule,
	type CompileTsrxModuleInput,
} from '@markless/compiler';
import { compileStoreEntry, writeCompileStoreEntry } from './compile-store.ts';
import type { ChunkTaskName } from './build/chunk-tasks.ts';

type CompileJob = {
	readonly kind: 'compile';
	readonly id: number;
	readonly input: CompileTsrxModuleInput;
	readonly key: string;
	readonly store?: { readonly directory: string; readonly fingerprint: string };
};

type ChunkJob = {
	readonly kind: 'chunk';
	readonly id: number;
	readonly task: ChunkTaskName;
	readonly fileName: string;
	readonly code: string;
};

// Compiles run while modules transform and chunk reads while chunks render, so a worker loads the chunk passes only once asked.
let chunkTasks: Promise<typeof import('./build/chunk-tasks.ts')> | undefined;
let chunkAst: Promise<typeof import('./build/chunk-ast.ts')> | undefined;

parentPort!.on('message', async (job: CompileJob | ChunkJob) => {
	if (job.kind === 'chunk') await runChunkJob(job);
	else await runCompileJob(job);
});

async function runChunkJob({ id, task, fileName, code }: ChunkJob): Promise<void> {
	chunkTasks ??= import('./build/chunk-tasks.ts');
	chunkAst ??= import('./build/chunk-ast.ts');
	const [{ runChunkTaskInline }, { clearParsedChunkCode }] = await Promise.all([
		chunkTasks,
		chunkAst,
	]);
	try {
		parentPort!.postMessage({ id, result: runChunkTaskInline(task, fileName, code) });
	} catch (error) {
		parentPort!.postMessage({
			id,
			error: error instanceof Error ? (error.stack ?? error.message) : String(error),
		});
	} finally {
		// A task's reads share one tree; kept past the task, every worker would hold a full parse cache of its own.
		clearParsedChunkCode();
	}
}

async function runCompileJob({ id, input, key, store }: CompileJob): Promise<void> {
	let bytes: Buffer;
	try {
		bytes = serialize(await compileTsrxModule(input));
	} catch {
		parentPort!.postMessage({ id, failed: true });
		return;
	} finally {
		// The main thread memoizes; a worker holding every result it produced would only grow.
		clearCompileCache();
	}
	const storePath = store
		? compileStoreEntry(store.directory, store.fingerprint, input.source, key).path
		: undefined;
	const copy = storePath === undefined ? undefined : new Uint8Array(bytes);
	parentPort!.postMessage(
		{ id, buffer: bytes.buffer, offset: bytes.byteOffset, length: bytes.byteLength },
		[bytes.buffer as ArrayBuffer],
	);
	if (copy && storePath) {
		await writeCompileStoreEntry(storePath, copy);
		parentPort!.postMessage({ id, written: true });
	}
}
