import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { createBuilder, type Plugin } from 'vite';
import { expect, test } from 'vitest';
import { clearCompileCache, setCompileCacheLimit } from '@markless/compiler';
import { markless } from '../../core/src/vite.ts';
import { router } from '../../router/src/vite/index.ts';
import { compileCacheSize } from '../../compiler/src/compile-cache.ts';
import { generateBuildScaleApp } from '../../../scripts/benchmarks/build-scale/generate.mjs';

let heldAtBuildEnd = 0;

// Each environment drops the memo at its own buildEnd, so the size is read just before it does.
const memoProbe: Plugin = {
	name: 'compile-memo-probe',
	buildEnd: {
		order: 'pre',
		handler() {
			heldAtBuildEnd = Math.max(heldAtBuildEnd, compileCacheSize());
		},
	},
};

async function build(root: string): Promise<Map<string, string>> {
	heldAtBuildEnd = 0;
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [memoProbe, markless(), router()],
	});
	await builder.buildApp();
	const output = join(await realpath(root), '.output/public');
	const files = new Map<string, string>();
	for (const entry of await readdir(output, { recursive: true, withFileTypes: true }))
		if (entry.isFile()) {
			const path = join(entry.parentPath, entry.name);
			files.set(
				path.slice(output.length),
				createHash('sha256')
					.update(await readFile(path))
					.digest('hex'),
			);
		}
	return files;
}

// The compile memo only saves work: a build that evicts after every compile ships the same bytes as one that keeps them all.
test(
	'an app ships the same files whatever the compile memo is allowed to hold',
	{ timeout: 600_000 },
	async () => {
		const scratch = await realpath(
			await mkdtemp(join(tmpdir(), 'markless-compile-cache-size-')),
		);
		const previous = setCompileCacheLimit(undefined);
		try {
			const kept = join(scratch, 'kept', 'app');
			const evicted = join(scratch, 'evicted', 'app');
			for (const dir of [kept, evicted])
				await generateBuildScaleApp({
					dir,
					pages: 4,
					components: 6,
					perPage: 3,
					layers: 2,
				});
			clearCompileCache();
			const fromKept = await build(kept);
			const keptEntries = heldAtBuildEnd;
			clearCompileCache();
			setCompileCacheLimit(1);
			const fromEvicted = await build(evicted);
			const evictedEntries = heldAtBuildEnd;
			expect(keptEntries).toBeGreaterThan(10);
			expect(evictedEntries).toBeLessThanOrEqual(2);
			expect(fromKept.size).toBeGreaterThan(0);
			expect(fromEvicted).toEqual(fromKept);
		} finally {
			setCompileCacheLimit(previous);
			clearCompileCache();
			await rm(scratch, { recursive: true, force: true });
		}
	},
);
