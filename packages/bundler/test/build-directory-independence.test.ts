import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { createBuilder } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '../../core/src/vite.ts';
import { router } from '../../router/src/vite/index.ts';
import { generateBuildScaleApp } from '../../../scripts/benchmarks/build-scale/generate.mjs';

async function build(root: string): Promise<Map<string, string>> {
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
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

// Content hashes and import-map specifiers are derived from module ids, and a router entry's id
// carries the app root; built anywhere, through any spelling of its path, an app ships the same bytes.
test(
	'one app built in two directories, one reached through a symlink, emits identical files',
	{ timeout: 600_000 },
	async () => {
		const scratch = await realpath(await mkdtemp(join(tmpdir(), 'markless-build-directory-')));
		try {
			const first = join(scratch, 'first-checkout', 'app');
			const second = join(scratch, 'second-checkout', 'app');
			const linked = join(scratch, 'linked-checkout');
			for (const dir of [first, second])
				await generateBuildScaleApp({
					dir,
					pages: 3,
					components: 4,
					perPage: 2,
					layers: 1,
				});
			await mkdir(linked);
			await symlink(join(scratch, 'second-checkout'), join(linked, 'via'), 'dir');
			const fromFirst = await build(first);
			const fromLinked = await build(join(linked, 'via', 'app'));
			expect(fromFirst.size).toBeGreaterThan(0);
			expect(fromLinked).toEqual(fromFirst);
		} finally {
			await rm(scratch, { recursive: true, force: true });
		}
	},
);
