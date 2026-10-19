import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { relative, resolve } from 'pathe';
import { expect, test } from 'vitest';
import { marklessBuildManifestPath } from '../src/build/build-manifests.ts';
import { MARKLESS_EXECUTION_SIZES } from '../src/build/chunking.ts';
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
		await readFile(marklessBuildManifestPath(dist, MARKLESS_EXECUTION_SIZES), 'utf8'),
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

const website = resolve(root, 'website');
const websiteOutput = resolve(website, '.output');

/**
 * The website composes the same widgets from many pages, so several variants of
 * one source compile at once. A sibling variant's first pass used to publish
 * unlinked render data under the shared id, and a page's render-data request that
 * read it in that window inlined its own copy instead of importing the shared
 * module: the toaster page's chunk then changed bytes, names and every plan that
 * lists it, about one build in three.
 */
test('the website build writes the same bytes twice from one tree', async () => {
	const { first, second } = await withDemoBuildLock(website, async () => ({
		first: await buildWebsite(),
		second: await buildWebsite(),
	}));
	const differing = [...new Set([...first.keys(), ...second.keys()])].filter(
		(file) => first.get(file) !== second.get(file),
	);
	expect(differing).toEqual([]);
	expect(first.size).toBeGreaterThan(0);
}, 900_000);

async function buildWebsite(): Promise<Map<string, string>> {
	await rm(websiteOutput, { force: true, recursive: true });
	await exec('pnpm', ['exec', 'vp', 'build'], {
		cwd: website,
		env: { ...process.env, MARKLESS_CONSUMER_BUILD: '1' },
		maxBuffer: 256 * 1024 * 1024,
	});
	const digests = new Map<string, string>();
	for (const file of (await readdir(websiteOutput, { recursive: true, withFileTypes: true }))
		.filter((entry) => entry.isFile())
		.map((entry) => relative(websiteOutput, resolve(entry.parentPath, entry.name)))
		// Nitro stamps the build time into its descriptor.
		.filter((file) => file !== 'nitro.json')
		.sort()) {
		const bytes = await readFile(resolve(websiteOutput, file));
		digests.set(
			file,
			createHash('sha256')
				.update(
					file === 'server/index.mjs' ? withoutNitroAssetTable(bytes.toString()) : bytes,
				)
				.digest('hex'),
		);
	}
	return digests;
}

// Nitro lists the public files it serves with their mtimes, in filesystem order; the files themselves are compared above.
function withoutNitroAssetTable(code: string): string {
	return code.replace(
		/\/\/#region #nitro\/virtual\/public-assets-data\n[\s\S]*?\/\/#endregion\n/,
		'',
	);
}
