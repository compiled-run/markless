import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { relative, resolve } from 'pathe';
import { expect, test } from 'vitest';
import { DEFAULT_FENCE_CACHE_DIR } from '../../../../website/tooling/fence-pool.ts';
import { withDemoBuildLock } from '../helpers/demo-build-lock.ts';

// Lives in the perf-guards lane, which runs alone: one website build peaks near 11 GB.
const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../../..');
const website = resolve(root, 'website');
const websiteOutput = resolve(website, '.output');

/**
 * The website composes the same widgets from many pages, so several variants of
 * one source compile at once, and which finishes first varies from build to build.
 * Two races used to show in the output. A sibling variant's first pass published
 * unlinked render data under the shared id, so a page's render-data request that
 * read it in that window inlined its own copy instead of importing the shared
 * module, changing the toaster page's chunk about one build in three. And an
 * importer that found only a child's first pass loaded the child's plain module
 * to wait for its final one, pulling a module no page imports into the deferred
 * packs whenever that child compiled slowly.
 *
 * The first build starts without the fence cache and the second reuses what the
 * first wrote, so the two compile at very different speeds: that exposed the
 * second race.
 */
test('the website build writes the same bytes twice from one tree', async () => {
	const { first, second } = await withDemoBuildLock(website, async () => ({
		first: await buildWebsite({ coldFences: true }),
		second: await buildWebsite({ coldFences: false }),
	}));
	const differing = [...new Set([...first.keys(), ...second.keys()])].filter(
		(file) => first.get(file) !== second.get(file),
	);
	expect(differing).toEqual([]);
	expect(first.size).toBeGreaterThan(0);
}, 900_000);

async function buildWebsite(options: { coldFences: boolean }): Promise<Map<string, string>> {
	await rm(websiteOutput, { force: true, recursive: true });
	if (options.coldFences) await rm(DEFAULT_FENCE_CACHE_DIR, { force: true, recursive: true });
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
