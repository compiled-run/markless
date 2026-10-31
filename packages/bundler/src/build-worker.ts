import { serialize } from 'node:v8';
import { parentPort } from 'node:worker_threads';
import type { CompileTsrxModuleInput } from '@markless/compiler';
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
	readonly context?: unknown;
};

// Compiles run in child processes and chunk reads on threads, so each loads only the code its jobs need.
let chunkTasks: Promise<typeof import('./build/chunk-tasks.ts')> | undefined;
let chunkAst: Promise<typeof import('./build/chunk-ast.ts')> | undefined;
let compiler: Promise<typeof import('@markless/compiler')> | undefined;

// A parent that finished its build may exit before this process boots or answers; nothing is left to tell.
const post = (message: unknown, transfer?: ArrayBuffer[]): void => {
	if (parentPort) parentPort.postMessage(message, transfer);
	else if (process.connected) process.send!(message, undefined, undefined, () => {});
};
const writes = new Set<Promise<void>>();

(parentPort ?? process).on('message', async (job: CompileJob | ChunkJob | { kind: 'exit' }) => {
	if (job.kind === 'exit') {
		await Promise.all(writes);
		process.exit(0);
	} else if (job.kind === 'chunk') await runChunkJob(job);
	else await runCompileJob(job);
});
if (!parentPort) {
	process.once('disconnect', () => void Promise.all(writes).then(() => process.exit(0)));
	post({ ready: true });
}

async function runChunkJob({ id, task, fileName, code, context }: ChunkJob): Promise<void> {
	chunkTasks ??= import('./build/chunk-tasks.ts');
	chunkAst ??= import('./build/chunk-ast.ts');
	const [{ runChunkTaskInline }, { clearParsedChunkCode }] = await Promise.all([
		chunkTasks,
		chunkAst,
	]);
	try {
		post({
			id,
			result: runChunkTaskInline(task, fileName, code, context as never),
		});
	} catch (error) {
		post({
			id,
			error: error instanceof Error ? (error.stack ?? error.message) : String(error),
		});
	} finally {
		// A task's reads share one tree; kept past the task, every worker would hold a full parse cache of its own.
		clearParsedChunkCode();
	}
}

async function runCompileJob({ id, input, key, store }: CompileJob): Promise<void> {
	compiler ??= import('@markless/compiler');
	const { clearCompileCache, compileTsrxModule, resetParseCache } = await compiler;
	let bytes: Buffer;
	try {
		bytes = serialize(await compileTsrxModule(input));
	} catch {
		post({ id, failed: true });
		return;
	} finally {
		// The main thread memoizes; a worker holding every result or tree it produced would only grow.
		clearCompileCache();
		resetParseCache();
	}
	const storePath = store
		? compileStoreEntry(store.directory, store.fingerprint, input.source, key).path
		: undefined;
	const copy = storePath === undefined ? undefined : new Uint8Array(bytes);
	post({ id, bytes }, parentPort ? [bytes.buffer as ArrayBuffer] : undefined);
	if (copy && storePath) {
		const write = writeCompileStoreEntry(storePath, copy).then(() =>
			post({ id, written: true }),
		);
		writes.add(write);
		await write.finally(() => writes.delete(write));
	}
}
