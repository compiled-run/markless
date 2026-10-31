import { fork } from 'node:child_process';
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

type WorkerMessage = {
	id: number;
	ready?: true;
	failed?: true;
	written?: true;
	bytes?: Uint8Array;
	result?: unknown;
	error?: string;
};

type Handle = {
	send(message: unknown): void;
	ref(): void;
	unref(): void;
	exit(): void;
	readonly pid?: number;
};

type PooledWorker = {
	readonly handle: Handle;
	readonly writes: Map<number, () => void>;
	job: Job | undefined;
	online: boolean;
};

type Lane = {
	readonly workers: PooledWorker[];
	readonly queue: Job[];
	size: number;
	unavailable: boolean;
	readonly start: () => {
		handle: Handle;
		on: (event: string, listener: (...args: never[]) => void) => void;
	};
};

export type CompileWorkerPool = {
	readonly run: CompileRunner;
	/** Waits for every compile this pool handed a worker, and every result a worker is still writing to this build's store. */
	close(): Promise<void>;
};

let nextId = 0;

// One compile at a time needs far less than a build; a larger limit only lets garbage pile up before a collection.
const COMPILE_PROCESS_HEAP_MB = 2048;

function workerUrl(name: 'build-worker'): URL {
	// Source runs as .ts; the packed bundle sits beside its own build-worker.js.
	return new URL(
		import.meta.url.endsWith('.ts') ? `./${name}.ts` : `./${name}.js`,
		import.meta.url,
	);
}

// Compiles run in child processes, which exit once a module graph is built: a process frees the wasm parser's
// memory and its heap by exiting, while tearing down a thread that ran the parser can abort the whole process.
const compiles: Lane = {
	workers: [],
	queue: [],
	size: 0,
	unavailable: false,
	start() {
		const child = fork(workerUrl('build-worker'), [], {
			// A flag here overrides the build's NODE_OPTIONS, whose heap limit is sized for the whole build.
			execArgv: [...process.execArgv, `--max-old-space-size=${COMPILE_PROCESS_HEAP_MB}`],
			serialization: 'advanced',
			stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
		});
		return {
			handle: {
				send: (message) => child.send(message as never),
				ref: () => {
					child.ref();
					(child.channel as { ref?: () => void } | undefined)?.ref?.();
				},
				unref: () => {
					child.unref();
					(child.channel as { unref?: () => void } | undefined)?.unref?.();
				},
				exit: () => child.send({ kind: 'exit' }),
				pid: child.pid,
			},
			on: (event, listener) => {
				// A child that has spawned may still be loading the module that listens for jobs.
				if (event === 'online')
					child.on('message', (message: { ready?: true }) => message.ready && listener());
				else child.on(event as 'message', listener as never);
			},
		};
	},
};

// Chunk reads (while chunks render) run on threads that never parse with wasm. Idle workers are unreferenced, so
// they never hold the process open.
const chunkReads: Lane = {
	workers: [],
	queue: [],
	size: 0,
	unavailable: false,
	start() {
		const worker = new Worker(workerUrl('build-worker'));
		return {
			handle: {
				send: (message) => worker.postMessage(message),
				ref: () => worker.ref(),
				unref: () => worker.unref(),
				exit: () => void worker.terminate(),
			},
			on: (event, listener) => {
				if (event === 'online') worker.once('online', listener);
				else worker.on(event as 'message', listener as never);
			},
		};
	},
};

// One worker boots at a time: workers booting together under a CPU profiler deadlocked inside Node's builtin loader.
function addWorker(lane: Lane): void {
	if (lane.unavailable || lane.workers.length >= lane.size) return;
	let started: ReturnType<Lane['start']>;
	try {
		started = lane.start();
	} catch {
		if (!lane.workers.length) {
			lane.unavailable = true;
			for (const queued of lane.queue.splice(0)) giveBack(queued);
		}
		return;
	}
	const entry: PooledWorker = {
		handle: started.handle,
		writes: new Map(),
		job: undefined,
		online: false,
	};
	lane.workers.push(entry);
	entry.handle.unref();
	started.on('online', () => {
		// Retired while it booted: the exit sent then reached no listener yet.
		if (!lane.workers.includes(entry)) return entry.handle.exit();
		entry.online = true;
		addWorker(lane);
		dispatch(lane);
	});
	started.on('message', (message: WorkerMessage) => {
		if (message.ready) return;
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
		} else if (job && (message.failed || !message.bytes)) job.resolve(undefined);
		else if (job) {
			if (job.store) job.written(new Promise((resolve) => entry.writes.set(job.id, resolve)));
			job.resolve(deserialize(message.bytes!) as CompileTsrxModuleResult);
		}
		dispatch(lane);
	});
	// A worker that dies hands its job back to the calling thread and leaves the pool.
	const retire = () => {
		const index = lane.workers.indexOf(entry);
		if (index !== -1) lane.workers.splice(index, 1);
		const job = entry.job;
		entry.job = undefined;
		if (job) giveBack(job);
		// Writes it had not finished are lost, which only costs a recompile next build.
		for (const written of entry.writes.values()) written();
		entry.writes.clear();
		if (index === -1) return;
		if (!lane.workers.some((item) => item.online))
			for (const queued of lane.queue.splice(0)) giveBack(queued);
		dispatch(lane);
	};
	started.on('error', retire);
	started.on('exit', retire);
}

function dispatch(lane: Lane): void {
	for (const entry of lane.workers) {
		if (!entry.online || entry.job) continue;
		const job = lane.queue.shift();
		if (!job) break;
		entry.job = job;
		entry.handle.ref();
		try {
			entry.handle.send(
				job.kind === 'chunk'
					? {
							kind: 'chunk',
							id: job.id,
							task: job.task,
							fileName: job.fileName,
							code: job.code,
							context: job.context,
						}
					: {
							kind: 'compile',
							id: job.id,
							input: job.input,
							key: job.key,
							store: job.store,
						},
			);
		} catch {
			// An input that cannot be cloned runs on the calling thread.
			entry.job = undefined;
			giveBack(job);
		}
	}
	for (const entry of lane.workers) if (!entry.job) entry.handle.unref();
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
	chunkReads.size = Math.max(chunkReads.size, buildWorkerCount());
	if (chunkReads.unavailable || chunkReads.size === 0) {
		try {
			return Promise.resolve(runChunkTaskInline(task, fileName, code, context));
		} catch (error) {
			return Promise.reject(error);
		}
	}
	const { workers } = chunkReads;
	if (
		!workers.length ||
		(workers.length < chunkReads.size && workers.every((entry) => entry.online))
	)
		addWorker(chunkReads);
	return new Promise((resolve, reject) => {
		chunkReads.queue.push({
			kind: 'chunk',
			id: nextId++,
			task,
			fileName,
			code,
			context,
			resolve,
			reject,
		});
		dispatch(chunkReads);
	});
}

const compileRuns = new Set<Promise<unknown>>();

/**
 * Lets every compile process exit once its compiles and store writes are done. A compile asked for later starts
 * new ones, so this only frees the memory the compiles of a finished module graph held.
 */
export async function retireCompileWorkers(): Promise<void> {
	while (compileRuns.size) await Promise.all(compileRuns);
	for (const entry of compiles.workers.splice(0)) entry.handle.exit();
}

/** Process ids of the compile processes running now. */
export function compileWorkerPids(): number[] {
	return compiles.workers.flatMap((entry) =>
		entry.handle.pid === undefined ? [] : [entry.handle.pid],
	);
}

/** Compiles in child processes; a compile no process can take yet runs on the calling thread. */
export function createCompileWorkerPool(options: {
	readonly size: number;
	readonly store?: CompileStore & { readonly cache: PersistentCompileCache };
}): CompileWorkerPool {
	compiles.size = Math.max(compiles.size, options.size);
	const store = options.store && {
		directory: options.store.directory,
		fingerprint: options.store.fingerprint,
	};
	const writes = new Set<Promise<void>>();
	const runs = new Set<Promise<unknown>>();
	let closed = false;
	return {
		run(input, key) {
			if (closed || options.size === 0) return undefined;
			const { workers } = compiles;
			if (
				!workers.length ||
				(workers.length < compiles.size && workers.every((entry) => entry.online))
			)
				addWorker(compiles);
			// Until a worker is online the calling thread compiles, so booting never idles the build.
			if (!workers.some((entry) => entry.online)) return undefined;
			const run = new Promise<CompileTsrxModuleResult | undefined>((resolve) => {
				compiles.queue.push({
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
				dispatch(compiles);
			});
			runs.add(run);
			compileRuns.add(run);
			void run.finally(() => {
				runs.delete(run);
				compileRuns.delete(run);
			});
			return run;
		},
		async close() {
			closed = true;
			while (runs.size || writes.size) await Promise.all([...runs, ...writes]);
		},
	};
}
