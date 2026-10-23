import { deserialize } from 'node:v8';
import { Worker } from 'node:worker_threads';
import type {
	CompileRunner,
	CompileTsrxModuleInput,
	CompileTsrxModuleResult,
} from '@markless/compiler';
import type { PersistentCompileCache } from './compile-store.ts';
import type { TransformRunner } from './transform.ts';
import type { TransformTsrxModuleInput, TransformTsrxModuleResult } from './types.ts';

type CompileStore = { readonly directory: string; readonly fingerprint: string };

type Job = {
	readonly id: number;
	readonly message:
		| { readonly kind: 'compile'; readonly input: CompileTsrxModuleInput; readonly key: string }
		| {
				readonly kind: 'transform';
				readonly input: TransformTsrxModuleInput;
				readonly linkedChildHasBrowserTriggers: boolean;
		  };
	readonly store: CompileStore | undefined;
	/** The worker whose compile memo already holds this file's other requests. */
	readonly worker: PooledWorker | undefined;
	readonly resolve: (result: unknown) => void;
	readonly written: (write: Promise<void>) => void;
};

type PooledWorker = {
	readonly worker: Worker;
	readonly writes: Map<number, () => void>;
	job: Job | undefined;
	online: boolean;
};

export type CompileWorkerPool = {
	readonly run: CompileRunner;
	readonly runTransform: TransformRunner;
	/** Waits for every result a worker is still writing to this build's store. */
	close(): Promise<void>;
};

// One pool per process, never terminated: tearing down a worker that ran the wasm parser can abort the whole process
// inside V8's wasm code freeing. Idle workers are unreferenced, so they never hold the process open.
const workers: PooledWorker[] = [];
const queue: Job[] = [];
let size = 0;
let unavailable = false;
let nextId = 0;

function workerUrl(): URL {
	// Source runs as .ts; the packed bundle sits beside its own compile-worker.js.
	return new URL(
		import.meta.url.endsWith('.ts') ? './compile-worker.ts' : './compile-worker.js',
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
		if (!workers.length) unavailable = true;
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
		}) => {
			if (message.written) {
				entry.writes.get(message.id)?.();
				entry.writes.delete(message.id);
				return;
			}
			const job = entry.job;
			entry.job = undefined;
			if (job && (message.failed || !message.buffer)) job.resolve(undefined);
			else if (job) {
				if (job.store)
					job.written(new Promise((resolve) => entry.writes.set(job.id, resolve)));
				job.resolve(
					deserialize(new Uint8Array(message.buffer!, message.offset, message.length)),
				);
			}
			dispatch();
		},
	);
	// A worker that dies hands its compile back to the calling thread and leaves the pool.
	const retire = () => {
		const index = workers.indexOf(entry);
		if (index !== -1) workers.splice(index, 1);
		entry.job?.resolve(undefined);
		entry.job = undefined;
		// Writes it had not finished are lost, which only costs a recompile next build.
		for (const written of entry.writes.values()) written();
		entry.writes.clear();
		if (!workers.some((item) => item.online))
			for (const queued of queue.splice(0)) queued.resolve(undefined);
		dispatch();
	};
	worker.on('error', retire);
	worker.on('exit', retire);
}

function dispatch(): void {
	for (const entry of workers) {
		if (!entry.online || entry.job) continue;
		const index = queue.findIndex(
			(queued) =>
				!queued.worker || queued.worker === entry || !workers.includes(queued.worker),
		);
		if (index === -1) continue;
		const [job] = queue.splice(index, 1) as [Job];
		entry.job = job;
		entry.worker.ref();
		try {
			entry.worker.postMessage({ ...job.message, id: job.id, store: job.store });
		} catch {
			// An input that cannot be cloned compiles on the calling thread.
			entry.job = undefined;
			job.resolve(undefined);
		}
	}
	for (const entry of workers) if (!entry.job) entry.worker.unref();
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
	const submit = (message: Job['message'], affinity?: string): Promise<unknown> | undefined => {
		if (closed || options.size === 0) return undefined;
		if (!workers.length || (workers.length < size && workers.every((entry) => entry.online)))
			addWorker();
		// Until a worker is online the calling thread works, so booting never idles the build.
		const online = workers.filter((entry) => entry.online);
		if (!online.length) return undefined;
		return new Promise((resolve) => {
			queue.push({
				id: nextId++,
				message,
				store,
				worker:
					affinity === undefined ? undefined : online[hashOf(affinity) % online.length],
				resolve,
				written: (write) => {
					writes.add(write);
					void write.finally(() => writes.delete(write));
					options.store?.cache.track(write);
				},
			});
			dispatch();
		});
	};
	return {
		run(input, key) {
			return submit({ kind: 'compile', input, key }) as Promise<
				CompileTsrxModuleResult | undefined
			>;
		},
		runTransform(input, linkedChildHasBrowserTriggers) {
			return submit(
				{ kind: 'transform', input, linkedChildHasBrowserTriggers },
				input.filename,
			) as Promise<TransformTsrxModuleResult | undefined>;
		},
		async close() {
			closed = true;
			while (writes.size) await Promise.all(writes);
		},
	};
}

function hashOf(text: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++)
		hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
	return hash >>> 0;
}
