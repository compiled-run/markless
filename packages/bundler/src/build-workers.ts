import { availableParallelism } from 'node:os';
import { deserialize } from 'node:v8';
import { Worker } from 'node:worker_threads';
import type {
	CompileRunner,
	CompileTsrxModuleInput,
	CompileTsrxModuleResult,
} from '@markless/compiler';
import type { PersistentCompileCache } from './compile-store.ts';
import {
	runChunkTaskInline,
	type ChunkTaskContext,
	type ChunkTaskName,
	type ChunkTaskResult,
} from './build/chunk-tasks.ts';

type CompileStore = { readonly directory: string; readonly fingerprint: string };

type CompileJob = {
	readonly kind: 'compile';
	readonly id: number;
	readonly input: CompileTsrxModuleInput;
	readonly key: string;
	readonly store: CompileStore | undefined;
	readonly resolve: (result: CompileTsrxModuleResult | undefined) => void;
	readonly written: (write: Promise<void>) => void;
};

type ChunkJob = {
	readonly kind: 'chunk';
	readonly id: number;
	readonly task: ChunkTaskName;
	readonly fileName: string;
	readonly code: string;
	readonly context: unknown;
	readonly resolve: (result: never) => void;
	readonly reject: (error: unknown) => void;
};

type Job = CompileJob | ChunkJob;

type PooledWorker = {
	readonly worker: Worker;
	readonly writes: Map<number, () => void>;
	job: Job | undefined;
	online: boolean;
};

export type CompileWorkerPool = {
	readonly run: CompileRunner;
	/** Waits for every result a worker is still writing to this build's store. */
	close(): Promise<void>;
};

// One pool per process for compiles (while modules transform) and chunk reads (while chunks render), never terminated:
// tearing down a worker that ran the wasm parser can abort the whole process inside V8's wasm code freeing. Idle
// workers are unreferenced, so they never hold the process open.
const workers: PooledWorker[] = [];
const queue: Job[] = [];
let size = 0;
let unavailable = false;
let nextId = 0;

function workerUrl(): URL {
	// Source runs as .ts; the packed bundle sits beside its own build-worker.js.
	return new URL(
		import.meta.url.endsWith('.ts') ? './build-worker.ts' : './build-worker.js',
		import.meta.url,
	);
}

// One worker boots at a time: workers booting together under a CPU profiler deadlocked inside Node's builtin loader.
function addWorker(): void {
	if (unavailable || workers.length >= size) return;
	let worker: Worker;
	try {
		worker = new Worker(workerUrl());
	} catch {
		if (!workers.length) {
			unavailable = true;
			for (const queued of queue.splice(0)) giveBack(queued);
		}
		return;
	}
	const entry: PooledWorker = { worker, writes: new Map(), job: undefined, online: false };
	workers.push(entry);
	worker.unref();
	worker.once('online', () => {
		entry.online = true;
		addWorker();
		dispatch();
	});
	worker.on(
		'message',
		(message: {
			id: number;
			failed?: true;
			written?: true;
			buffer?: ArrayBuffer;
			offset?: number;
			length?: number;
			result?: unknown;
			error?: string;
		}) => {
			if (message.written) {
				entry.writes.get(message.id)?.();
				entry.writes.delete(message.id);
				return;
			}
			const job = entry.job;
			entry.job = undefined;
			if (job?.kind === 'chunk') {
				if (message.error !== undefined) job.reject(new Error(message.error));
				else job.resolve(message.result as never);
			} else if (job && (message.failed || !message.buffer)) job.resolve(undefined);
			else if (job) {
				if (job.store)
					job.written(new Promise((resolve) => entry.writes.set(job.id, resolve)));
				job.resolve(
					deserialize(
						new Uint8Array(message.buffer!, message.offset, message.length),
					) as CompileTsrxModuleResult,
				);
			}
			dispatch();
		},
	);
	// A worker that dies hands its job back to the calling thread and leaves the pool.
	const retire = () => {
		const index = workers.indexOf(entry);
		if (index === -1) return;
		workers.splice(index, 1);
		const job = entry.job;
		entry.job = undefined;
		if (job) giveBack(job);
		// Writes it had not finished are lost, which only costs a recompile next build.
		for (const written of entry.writes.values()) written();
		entry.writes.clear();
		if (!workers.some((item) => item.online))
			for (const queued of queue.splice(0)) giveBack(queued);
		dispatch();
	};
	worker.on('error', retire);
	worker.on('exit', retire);
}

function dispatch(): void {
	for (const entry of workers) {
		if (!entry.online || entry.job) continue;
		const job = queue.shift();
		if (!job) break;
		entry.job = job;
		entry.worker.ref();
		try {
			entry.worker.postMessage(
				job.kind === 'chunk'
					? {
							kind: 'chunk',
							id: job.id,
							task: job.task,
							fileName: job.fileName,
							code: job.code,
							context: job.context,
						}
					: { kind: 'compile', id: job.id, input: job.input, key: job.key, store: job.store },
			);
		} catch {
			// An input that cannot be cloned runs on the calling thread.
			entry.job = undefined;
			giveBack(job);
		}
	}
	for (const entry of workers) if (!entry.job) entry.worker.unref();
}

// A job no worker can run goes back to the calling thread: a compile by answering nothing, a chunk read by running there.
function giveBack(job: Job): void {
	if (job.kind === 'compile') {
		job.resolve(undefined);
		return;
	}
	try {
		job.resolve(
			runChunkTaskInline(job.task, job.fileName, job.code, job.context as never) as never,
		);
	} catch (error) {
		job.reject(error);
	}
}

/** How many build workers a process starts: one per core but one, at most seven, or `MARKLESS_COMPILE_WORKERS`. */
export function buildWorkerCount(): number {
	const configured = Number(process.env.MARKLESS_COMPILE_WORKERS);
	if (Number.isInteger(configured) && configured >= 0) return configured;
	return Math.max(0, Math.min(availableParallelism() - 1, 7));
}

/** Runs a chunk read on a build worker, or on the calling thread when the process starts none. */
export function runChunkJob<T extends ChunkTaskName>(
	task: T,
	fileName: string,
	code: string,
	context?: ChunkTaskContext<T>,
): Promise<ChunkTaskResult<T>> {
	size = Math.max(size, buildWorkerCount());
	if (unavailable || size === 0) {
		try {
			return Promise.resolve(runChunkTaskInline(task, fileName, code, context));
		} catch (error) {
			return Promise.reject(error);
		}
	}
	if (!workers.length || (workers.length < size && workers.every((entry) => entry.online)))
		addWorker();
	return new Promise((resolve, reject) => {
		queue.push({ kind: 'chunk', id: nextId++, task, fileName, code, context, resolve, reject });
		dispatch();
	});
}

/** Compiles on worker threads; a compile no worker can take yet runs on the calling thread. */
export function createCompileWorkerPool(options: {
	readonly size: number;
	readonly store?: CompileStore & { readonly cache: PersistentCompileCache };
}): CompileWorkerPool {
	size = Math.max(size, options.size);
	const store = options.store && {
		directory: options.store.directory,
		fingerprint: options.store.fingerprint,
	};
	const writes = new Set<Promise<void>>();
	let closed = false;
	return {
		run(input, key) {
			if (closed || options.size === 0) return undefined;
			if (
				!workers.length ||
				(workers.length < size && workers.every((entry) => entry.online))
			)
				addWorker();
			// Until a worker is online the calling thread compiles, so booting never idles the build.
			if (!workers.some((entry) => entry.online)) return undefined;
			return new Promise((resolve) => {
				queue.push({
					kind: 'compile',
					id: nextId++,
					input,
					key,
					store,
					resolve,
					written: (write) => {
						writes.add(write);
						void write.finally(() => writes.delete(write));
						options.store?.cache.track(write);
					},
				});
				dispatch();
			});
		},
		async close() {
			closed = true;
			while (writes.size) await Promise.all(writes);
		},
	};
}
