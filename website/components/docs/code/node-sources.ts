// A source host for compiling blocks under Node, as the tests do: package source is read
// from the repository, and the bundler's file system is the real one.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { SourceHost } from './bundle-host.ts';
import { packageFile } from './package-exports.ts';
import type { CodeFile } from './protocol.ts';
import { isRuntimeSpecifier, sourcePackages } from './source-packages.ts';

const PACKAGES = fileURLToPath(new URL('../../../../packages/', import.meta.url));

/**
 * Block files live in memory under `/code/`, or, given `folder`, are written there, so the
 * bundler's own file reads see them as they see a block's files in the compile worker.
 */
export function nodeSourceHost(folder?: string): SourceHost {
	const codeDir = folder ? `${folder.replace(/\/$/, '')}/` : '/code/';
	const block = new Map<string, string>();
	const packages = sourcePackages(PACKAGES);
	return {
		codeDir,
		root: '/',
		isRuntime: isRuntimeSpecifier,
		packageFile: (specifier) => packageFile(packages, specifier),
		placeBlock(files: readonly CodeFile[]) {
			if (folder) {
				rmSync(codeDir, { recursive: true, force: true });
				mkdirSync(codeDir, { recursive: true });
			}
			block.clear();
			for (const file of files) {
				block.set(`${codeDir}${file.name}`, file.code);
				if (folder) writeFileSync(`${codeDir}${file.name}`, file.code);
			}
		},
		async read(path) {
			if (block.has(path)) return block.get(path);
			return readFile(path, 'utf8').catch(() => undefined);
		},
		takeMisses: async () => [],
	};
}
