import { readFile, readdir, mkdir, mkdtemp, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, expect, test } from 'vitest';
import { marklessBuildManifestDir, marklessBuildManifestPath } from '@markless/bundler/rolldown';
import { markless } from '@markless/bundler/vite';
import { MARKLESS_INTERACTION_CLOSURES } from '../../../bundler/src/build/chunking.ts';
import { buildInternalFilesInPublicOutput } from '../../../../scripts/test-utils/public-build-output.ts';
import { router } from '../../src/vite/index.ts';

const packagesRoot = resolve(import.meta.dirname, '../../..');
const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function filesUnder(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { recursive: true, withFileTypes: true });
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

let built: Promise<string> | undefined;
function buildRouteHrefApp(): Promise<string> {
	return (built ??= (async () => {
		const root = await mkdtemp(join(tmpdir(), 'markless-route-href-'));
		cleanups.push(() => rm(root, { recursive: true, force: true }));
		await cp(resolve(import.meta.dirname, '../fixtures/route-href-link-app'), root, {
			recursive: true,
		});
		await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
		for (const pkg of ['core', 'router'])
			await symlink(
				join(packagesRoot, pkg),
				join(root, 'node_modules/@markless', pkg),
				'dir',
			);
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless({ experimentalNativePacking: true }), router()],
		});
		await builder.buildApp();
		return root;
	})());
}

test('a Link with params builds without spelling the app root in client output', async () => {
	const root = await buildRouteHrefApp();
	const publicDir = join(root, '.output/public');
	const closureText = await readFile(
		marklessBuildManifestPath(publicDir, MARKLESS_INTERACTION_CLOSURES),
		'utf8',
	);
	expect(closureText).toContain('route-href');
	const files = [
		...(await filesUnder(publicDir)),
		...(await filesUnder(marklessBuildManifestDir(publicDir))),
	];
	for (const file of files) {
		const text = await readFile(file, 'utf8');
		expect(text, file).not.toContain(root);
		expect(text, file).not.toContain(encodeURIComponent(root));
	}
}, 180_000);

test('a router build serves no build-internal manifest from .output/public', async () => {
	const root = await buildRouteHrefApp();
	expect(await buildInternalFilesInPublicOutput(join(root, '.output/public'))).toEqual([]);
}, 180_000);
