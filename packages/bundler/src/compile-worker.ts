import { serialize } from 'node:v8';
import { parentPort, workerData } from 'node:worker_threads';
import {
	clearCompileCache,
	compileTsrxModule,
	type CompileTsrxModuleInput,
} from '@markless/compiler';
import { compileStoreEntry, writeCompileStoreEntry } from './compile-store.ts';

type CompileJob = {
	readonly id: number;
	readonly input: CompileTsrxModuleInput;
	readonly key: string;
};

const store = workerData as { readonly directory?: string; readonly fingerprint?: string };

parentPort!.on('message', async ({ id, input, key }: CompileJob) => {
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
	const storePath =
		store.directory && store.fingerprint
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
});
