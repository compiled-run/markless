// The persistent half of the compile memo: each compile result is written once under a hash of the compiler's
// own files and the whole compile input, so a later build or dev server reads it back instead of compiling.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { deserialize, serialize } from 'node:v8';
import { promisify } from 'node:util';
import { threadId } from 'node:worker_threads';
import * as zlib from 'node:zlib';
import { dirname, join } from 'pathe';
import type { CompileTsrxModuleResult, PersistentCompileStore } from '@markless/compiler';

// Past this the least recently used results are removed, keeping every result the current process used.
export const DEFAULT_COMPILE_CACHE_MAX_BYTES = 1024 * 1024 * 1024;

export type PersistentCompileCache = PersistentCompileStore & {
	/** Waits for every write this process started, then trims the store to its size budget. */
	flush(): Promise<void>;
	/** Waits for every write this process started, without trimming. */
	settle(): Promise<void>;
	/** Holds `flush` until a write started elsewhere, such as on a compile worker, has finished. */
	track(write: Promise<void>): void;
};

/** Runtimes without zstd in `node:zlib` (older Node, some Bun releases) build without the cache. */
export function persistentCompileCacheAvailable(): boolean {
	return typeof zlib.zstdCompress === 'function' && typeof zlib.zstdDecompressSync === 'function';
}

export function createPersistentCompileCache(input: {
	readonly directory: string;
	readonly fingerprint: string;
	readonly maxBytes?: number;
}): PersistentCompileCache {
	const used = new Set<string>();
	const writes = new Set<Promise<void>>();
	const pathOf = (source: string, key: string) => {
		const entry = compileStoreEntry(input.directory, input.fingerprint, source, key);
		used.add(entry.hash);
		return entry.path;
	};
	return {
		read(source, key) {
			const path = pathOf(source, key);
			let bytes: Buffer;
			try {
				bytes = readFileSync(path);
			} catch {
				return undefined;
			}
			try {
				const result = deserialize(
					zlib.zstdDecompressSync(bytes),
				) as CompileTsrxModuleResult;
				const now = new Date();
				void utimes(path, now, now).catch(() => {});
				return result;
			} catch {
				return undefined;
			}
		},
		write(source, key, result) {
			const path = pathOf(source, key);
			let bytes: Buffer;
			try {
				bytes = serialize(result);
			} catch {
				return;
			}
			const pending = writeCompileStoreEntry(path, bytes).finally(() =>
				writes.delete(pending),
			);
			writes.add(pending);
		},
		track(write) {
			const pending = write.finally(() => writes.delete(pending));
			writes.add(pending);
		},
		async settle() {
			while (writes.size) await Promise.all(writes);
		},
		async flush() {
			while (writes.size) await Promise.all(writes);
			await trim(input.directory, input.maxBytes ?? DEFAULT_COMPILE_CACHE_MAX_BYTES, used);
		},
	};
}

/** Where one compile result lives: a hash of the compiler's fingerprint and the whole compile input. */
export function compileStoreEntry(
	directory: string,
	fingerprint: string,
	source: string,
	key: string,
): { readonly hash: string; readonly path: string } {
	const hash = createHash('sha256')
		.update(fingerprint)
		.update('\0')
		.update(key)
		.update('\0')
		.update(source)
		.digest('hex');
	return { hash, path: join(directory, hash.slice(0, 2), `${hash}.bin`) };
}

/** Writes one serialized result; a failed write only costs a recompile next time. */
export async function writeCompileStoreEntry(path: string, bytes: Uint8Array): Promise<void> {
	try {
		const packed = await promisify(zlib.zstdCompress)(bytes);
		await mkdir(dirname(path), { recursive: true });
		const partial = `${path}.${process.pid}.${threadId}.tmp`;
		await writeFile(partial, packed);
		await rename(partial, path);
	} catch {}
}

async function trim(directory: string, maxBytes: number, used: ReadonlySet<string>): Promise<void> {
	const files: { path: string; hash: string; bytes: number; mtime: number }[] = [];
	let total = 0;
	for (const shard of await readdir(directory).catch(() => [] as string[])) {
		for (const name of await readdir(join(directory, shard)).catch(() => [] as string[])) {
			const path = join(directory, shard, name);
			const info = await stat(path).catch(() => undefined);
			if (!info?.isFile()) continue;
			total += info.size;
			files.push({ path, hash: name.split('.')[0]!, bytes: info.size, mtime: info.mtimeMs });
		}
	}
	if (total <= maxBytes) return;
	files.sort((a, b) => a.mtime - b.mtime);
	for (const file of files) {
		if (total <= maxBytes) break;
		if (used.has(file.hash)) continue;
		await rm(file.path, { force: true });
		total -= file.bytes;
	}
}

/** A hash of every file the compiler's output depends on: its own package, the serializer it embeds, and its parsers. */
export function compilerFingerprint(): string {
	const hash = createHash('sha256');
	const compiler = packageDirectory(createRequire(import.meta.url), '@markless/compiler');
	const fromCompiler = createRequire(join(compiler, 'package.json'));
	const serializer = packageDirectory(fromCompiler, '@markless/serializer');
	for (const directory of [compiler, serializer]) hashPackage(hash, directory);
	for (const name of ['@tsrx/yuku', 'yuku-css']) {
		try {
			hash.update(readFileSync(join(packageDirectory(fromCompiler, name), 'package.json')));
		} catch {
			hash.update(`${name}:missing`);
		}
	}
	return hash.digest('hex');
}

// Packages that do not export their package.json are found from their entry file upward.
function packageDirectory(require: NodeJS.Require, name: string): string {
	let directory = dirname(require.resolve(name));
	while (!existsSync(join(directory, 'package.json')) && dirname(directory) !== directory)
		directory = dirname(directory);
	return directory;
}

function hashPackage(hash: ReturnType<typeof createHash>, directory: string): void {
	hash.update(readFileSync(join(directory, 'package.json')));
	for (const sub of ['src', 'dist']) {
		const root = join(directory, sub);
		if (!existsSync(root)) continue;
		for (const name of (readdirSync(root, { recursive: true }) as string[]).sort()) {
			const path = join(root, name);
			if (!statSync(path).isFile()) continue;
			hash.update(name).update('\0').update(readFileSync(path));
		}
	}
}
