import { deserialize } from 'node:v8';
import { Worker } from 'node:worker_threads';
import type {
	CompileRunner,
	CompileTsrxModuleInput,
	CompileTsrxModuleResult,
} from '@markless/compiler';
import type { PersistentCompileCache } from './compile-store.ts';

type Job = {
	readonly id: number;
	readonly input: CompileTsrxModuleInput;
	readonly key: string;
	readonly resolve: (result: CompileTsrxModuleResult | undefined) => void;
};

type PooledWorker = {
	readonly worker: Worker;
	readonly writes: Map<number, () => void>;
	job: Job | undefined;
	online: boolean;
};

export type CompileWorkerPool = {
	readonly run: CompileRunner;
	/** Waits for every result a worker is still writing to the store, then stops the workers. */
	close(): Promise<void>;
};

function workerUrl(): URL {
	// Source runs as .ts; the packed bundle sits beside its own compile-worker.js.
	return new URL(
		import.meta.url.endsWith('.ts') ? './compile-worker.ts' : './compile-worker.js',
		import.meta.url,
	);
}

/** Compiles on worker threads; a compile no worker can take yet runs on the calling thread. */
export function createCompileWorkerPool(options: {
	readonly size: number;
	readonly store?: {
		readonly cache: PersistentCompileCache;
		readonly directory: string;
		readonly fingerprint: string;
	};
}): CompileWorkerPool {
	const workers: PooledWorker[] = [];
	const queue: Job[] = [];
	const writes = new Set<Promise<void>>();
	let nextId = 0;
	let closed = false;

	// One worker boots at a time: workers booting together under a CPU profiler deadlocked inside Node's builtin loader.
	const addWorker = () => {
		if (closed || workers.length >= options.size) return;
		let worker: Worker;
		try {
			worker = new Worker(workerUrl(), {
				workerData: options.store
					? { directory: options.store.directory, fingerprint: options.store.fingerprint }
					: {},
			});
		} catch {
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
					if (options.store) {
						const write = new Promise<void>((resolve) =>
							entry.writes.set(job.id, resolve),
						);
						writes.add(write);
						void write.finally(() => writes.delete(write));
						options.store?.cache.track(write);
					}
					job.resolve(
						deserialize(
							new Uint8Array(message.buffer!, message.offset, message.length),
						) as CompileTsrxModuleResult,
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
	};

	const dispatch = () => {
		for (const entry of workers) {
			if (!entry.online || entry.job) continue;
			const job = queue.shift();
			if (!job) break;
			entry.job = job;
			entry.worker.ref();
			try {
				entry.worker.postMessage({ id: job.id, input: job.input, key: job.key });
			} catch {
				// An input that cannot be cloned compiles here.
				entry.job = undefined;
				job.resolve(undefined);
			}
		}
		for (const entry of workers) if (!entry.job) entry.worker.unref();
	};

	return {
		run(input, key) {
			if (closed) return undefined;
			if (workers.length === 0) addWorker();
			// Until a worker is online the calling thread compiles, so booting never idles the build.
			if (!workers.some((entry) => entry.online)) return undefined;
			return new Promise((resolve) => {
				queue.push({ id: nextId++, input, key, resolve });
				dispatch();
			});
		},
		async close() {
			closed = true;
			while (writes.size) await Promise.all(writes);
			await Promise.all(workers.splice(0).map((entry) => entry.worker.terminate()));
		},
	};
}
