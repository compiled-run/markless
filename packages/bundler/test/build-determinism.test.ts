import { execFile } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';
import { withDemoBuildLock } from './helpers/demo-build-lock.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const demo = resolve(root, 'demos/music-player');
const dist = resolve(demo, 'dist');
const build = resolve(dist, 'build');

/**
 * One unchanged tree, built twice, has to emit the same chunk graph.
 *
 * This is pinned on the music-player demo and not on a bundler fixture because
 * the fixtures were never big enough to show it: three builds of this demo on one
 * unchanged tree emitted 111, 109 and 108 chunks, with different content hashes
 * and different code, while every vite fixture stayed byte-stable. The cause was
 * `forceImportedModules` loading a module's claim sources through `Promise.all`,
 * which let module registration land in completion order; the loads are
 * sequential now. A budget wall cannot tell a regression from noise while the
 * chunk COUNT moves under it, so this test guards the walls as much as the build.
 */
test('the music-player build emits the same chunk graph twice from one tree', async () => {
	// music-player-csr-budget.test.ts builds this same demo into this same dist/,
	// and vitest runs the two files in parallel workers.
	const { first, second } = await withDemoBuildLock(demo, async () => ({
		first: await buildOnce(),
		second: await buildOnce(),
	}));

	expect(second.chunkNames).toEqual(first.chunkNames);
	expect(second.modulesByChunk).toEqual(first.modulesByChunk);
	expect(second.chunkNames.length).toBeGreaterThan(0);
}, 900_000);

async function buildOnce() {
	await rm(dist, { force: true, recursive: true });
	await exec('pnpm', ['--dir', demo, 'build'], {
		cwd: root,
		env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1' },
	});

	const chunkNames = (await readdir(build)).filter((name) => name.endsWith('.js')).sort();
	const sizes = JSON.parse(
		await readFile(resolve(build, 'execution-sizes.json'), 'utf8'),
	) as Record<string, { readonly chunk?: string }>;
	const byChunk = new Map<string, string[]>();
	for (const [id, entry] of Object.entries(sizes)) {
		if (!entry.chunk || id.startsWith('./')) continue;
		byChunk.set(entry.chunk, [...(byChunk.get(entry.chunk) ?? []), id]);
	}
	// Keyed by module set, never by chunk file name: the name is a content hash, so
	// comparing names alone would report a rename as a graph change and vice versa.
	const modulesByChunk = [...byChunk.values()].map((ids) => ids.sort().join(', ')).sort();

	return { chunkNames, modulesByChunk };
}
