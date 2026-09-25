// Fence highlighting runs on worker threads: the type checker behind the hovers costs seconds of CPU.
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { FenceRenderer } from './highlight-code.ts';

export type FencePoolOptions = {
	/** Where rendered fences persist between builds; false renders every fence afresh. */
	readonly cacheDir: string | false;
	readonly workers: number;
};

export type FencePool = { readonly render: FenceRenderer };

type Reply = { readonly id: number; readonly html?: string | null; readonly error?: string };

type Waiting = { resolve(html: string | undefined): void; reject(error: Error): void };

type Lane = { readonly worker: Worker; readonly waiting: Map<number, Waiting> };

const SITE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export const DEFAULT_FENCE_CACHE_DIR = join(SITE_ROOT, 'node_modules', '.cache', 'markless-fences');

export function createFencePool(options: FencePoolOptions): FencePool {
	const lanes: Lane[] = [];
	const rendered = new Map<string, Promise<string | undefined>>();
	let nextId = 0;

	const spawn = (): Lane => {
		const worker = new Worker(new URL('./fence-worker.ts', import.meta.url), {
			// Parent flags (a test runner's `--conditions`, `--input-type`) would change what the worker loads.
			execArgv: [],
			workerData: { cacheDir: options.cacheDir },
		});
		const lane: Lane = { worker, waiting: new Map() };
		worker.unref();
		worker.on('message', (reply: Reply) => {
			const wait = lane.waiting.get(reply.id);
			if (!wait) return;
			lane.waiting.delete(reply.id);
			if (lane.waiting.size === 0) worker.unref();
			if (reply.error !== undefined) wait.reject(new Error(reply.error));
			else wait.resolve(reply.html ?? undefined);
		});
		worker.on('error', (error) => {
			lanes.splice(lanes.indexOf(lane), 1);
			for (const wait of lane.waiting.values()) wait.reject(error);
			lane.waiting.clear();
		});
		lanes.push(lane);
		return lane;
	};

	const laneFor = (): Lane => {
		const idle = lanes.find((lane) => lane.waiting.size === 0);
		if (idle) return idle;
		if (lanes.length < options.workers) return spawn();
		return lanes.reduce((least, lane) =>
			lane.waiting.size < least.waiting.size ? lane : least,
		);
	};

	const send = (code: string, fenceLanguage: string): Promise<string | undefined> =>
		new Promise((resolve, reject) => {
			const lane = laneFor();
			const id = nextId++;
			// A pending reply keeps the process alive; an idle pool never does.
			if (lane.waiting.size === 0) lane.worker.ref();
			lane.waiting.set(id, { resolve, reject });
			lane.worker.postMessage({ id, code, fenceLanguage });
		});

	return {
		render(code, fenceLanguage) {
			const key = `${fenceLanguage}\0${code}`;
			let html = rendered.get(key);
			if (!html) rendered.set(key, (html = send(code, fenceLanguage)));
			return html;
		},
	};
}

let shared: FencePool | undefined;

export function sharedFencePool(): FencePool {
	shared ??= createFencePool({
		cacheDir: process.env.MARKLESS_FENCE_CACHE === '0' ? false : DEFAULT_FENCE_CACHE_DIR,
		workers: Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
	});
	return shared;
}
