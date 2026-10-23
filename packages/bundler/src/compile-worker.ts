import { getHeapStatistics, serialize } from 'node:v8';
import { parentPort } from 'node:worker_threads';
import {
	clearCompileCache,
	compileTsrxModule,
	usePersistentCompileStore,
	type CompileTsrxModuleInput,
} from '@markless/compiler';
import {
	compileStoreEntry,
	createPersistentCompileCache,
	writeCompileStoreEntry,
	type PersistentCompileCache,
} from './compile-store.ts';
import { transformTsrxModuleHere } from './transform.ts';
import type { TransformTsrxModuleInput } from './types.ts';

const MEMO_HEAP_BYTES = 768 * 1024 * 1024;

type Store = { readonly directory: string; readonly fingerprint: string };

type Job =
	| {
			readonly kind: 'compile';
			readonly id: number;
			readonly input: CompileTsrxModuleInput;
			readonly key: string;
			readonly store?: Store;
	  }
	| {
			readonly kind: 'transform';
			readonly id: number;
			readonly input: TransformTsrxModuleInput;
			readonly linkedChildHasBrowserTriggers: boolean;
			readonly store?: Store;
	  };

// A build's store, opened once per worker: a transform reads stored compiles and writes new ones through it.
const stores = new Map<string, PersistentCompileCache>();

function storeFor(store: Store | undefined): PersistentCompileCache | undefined {
	if (!store) return undefined;
	const key = `${store.directory}\0${store.fingerprint}`;
	let cache = stores.get(key);
	if (!cache) stores.set(key, (cache = createPersistentCompileCache(store)));
	return cache;
}

function send(id: number, bytes: Buffer): void {
	parentPort!.postMessage(
		{ id, buffer: bytes.buffer, offset: bytes.byteOffset, length: bytes.byteLength },
		[bytes.buffer as ArrayBuffer],
	);
}

parentPort!.on('message', async (job: Job) => {
	if (job.kind === 'transform') {
		const cache = storeFor(job.store);
		usePersistentCompileStore(cache);
		let bytes: Buffer;
		try {
			bytes = serialize(
				await transformTsrxModuleHere(job.input, job.linkedChildHasBrowserTriggers),
			);
		} catch {
			parentPort!.postMessage({ id: job.id, failed: true });
			return;
		} finally {
			// The memo serves a file's other requests on this worker; past this heap it costs more than it saves.
			if (getHeapStatistics().used_heap_size > MEMO_HEAP_BYTES) clearCompileCache();
		}
		send(job.id, bytes);
		if (cache) {
			await cache.settle();
			parentPort!.postMessage({ id: job.id, written: true });
		}
		return;
	}
	const { id, input, key, store } = job;
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
	send(id, bytes);
	if (copy && storePath) {
		await writeCompileStoreEntry(storePath, copy);
		parentPort!.postMessage({ id, written: true });
	}
});
