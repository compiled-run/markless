import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { mayContainDynamicImport, rememberChunkDynamicImports } from './chunk-ast.ts';
import type { ChunkTaskName, ChunkTaskResult } from './chunk-tasks.ts';
import { runChunkTaskInline } from './chunk-tasks.ts';

// Below this a chunk's analysis costs less than posting it to a worker and back.
export const CHUNK_WORKER_MIN_CODE_LENGTH = 32 * 1024;

type Job = {
	readonly id: number;
	readonly task: ChunkTaskName;
	readonly fileName: string;
	readonly code: string;
	readonly resolve: (value: never) => void;
	readonly reject: (error: unknown) => void;
};

type PooledWorker = { readonly worker: Worker; job: Job | undefined };

let pool: PooledWorker[] | undefined;
let unavailable = false;
const queue: Job[] = [];
let nextId = 0;

function workerUrl(): URL {
	// Source runs as .ts; the packed bundle sits beside its own chunk-worker.js.
	return new URL(
		import.meta.url.endsWith('.ts') ? './chunk-worker.ts' : './chunk-worker.js',
		import.meta.url,
	);
}

function startPool(): PooledWorker[] | undefined {
	if (pool || unavailable) return pool;
	const size = Math.max(1, Math.min(availableParallelism() - 1, 8));
	try {
		pool = Array.from({ length: size }, () => {
			const entry: PooledWorker = { worker: new Worker(workerUrl()), job: undefined };
			entry.worker.unref();
			entry.worker.on('message', (message: { result?: unknown; error?: string }) => {
				const job = entry.job;
				entry.job = undefined;
				if (job) {
					if (message.error !== undefined) job.reject(new Error(message.error));
					else job.resolve(message.result as never);
				}
				dispatch();
			});
			entry.worker.on('error', () => {
				const job = entry.job;
				entry.job = undefined;
				// A dead worker takes its job's inline answer and leaves the pool.
				pool = pool?.filter((item) => item !== entry);
				if (job) runInline(job);
				if (!pool?.length) {
					pool = undefined;
					unavailable = true;
					for (const queued of queue.splice(0)) runInline(queued);
				} else dispatch();
			});
			return entry;
		});
	} catch {
		unavailable = true;
		pool = undefined;
	}
	return pool;
}

function runInline(job: Job): void {
	try {
		job.resolve(runChunkTaskInline(job.task, job.fileName, job.code) as never);
	} catch (error) {
		job.reject(error);
	}
}

function dispatch(): void {
	if (!pool) return;
	for (const entry of pool) {
		if (entry.job) continue;
		const job = queue.shift();
		if (!job) break;
		entry.job = job;
		entry.worker.ref();
		entry.worker.postMessage({
			id: job.id,
			task: job.task,
			fileName: job.fileName,
			code: job.code,
		});
	}
	for (const entry of pool) if (!entry.job) entry.worker.unref();
}

// Answers a worker already gave for the exact code, from a read that served several passes at once.
const knownResults = new Map<ChunkTaskName, Map<string, unknown>>();

export function rememberChunkTaskResult<T extends ChunkTaskName>(
	task: T,
	code: string,
	result: ChunkTaskResult<T>,
): void {
	let known = knownResults.get(task);
	if (!known) knownResults.set(task, (known = new Map()));
	known.set(code, result);
}

export function forgetChunkTaskResults(): void {
	knownResults.clear();
}

/** Runs a chunk analysis off the main thread when the chunk is large enough to pay for the trip. */
export function runChunkTask<T extends ChunkTaskName>(
	task: T,
	fileName: string,
	code: string,
): Promise<ChunkTaskResult<T>> {
	const known = knownResults.get(task);
	if (known?.has(code)) return Promise.resolve(known.get(code) as ChunkTaskResult<T>);
	if (code.length < CHUNK_WORKER_MIN_CODE_LENGTH || !startPool()) {
		try {
			return Promise.resolve(runChunkTaskInline(task, fileName, code));
		} catch (error) {
			return Promise.reject(error);
		}
	}
	return new Promise((resolve, reject) => {
		queue.push({ id: nextId++, task, fileName, code, resolve, reject });
		dispatch();
	});
}

export async function closeChunkWorkers(): Promise<void> {
	forgetChunkTaskResults();
	const current = pool;
	pool = undefined;
	unavailable = false;
	if (current) await Promise.all(current.map((entry) => entry.worker.terminate()));
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
					mayContainDynamicImport(chunk.code),
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
