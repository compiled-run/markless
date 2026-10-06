import { readFile, readdir, mkdir, mkdtemp, cp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
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

test('a Link with params builds without spelling the app root in client output', async () => {
	const root = await mkdtemp(join(tmpdir(), 'markless-route-href-'));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	await cp(resolve(import.meta.dirname, '../fixtures/route-href-link-app'), root, {
		recursive: true,
	});
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless({ experimentalNativePacking: true }), router()],
	});
	await builder.buildApp();

	const clientFiles = await filesUnder(join(root, '.output/public'));
	const closures = clientFiles.find((file) => file.endsWith('build/interaction-closures.json'));
	expect(closures).toBeDefined();
	const closureText = await readFile(closures!, 'utf8');
	expect(closureText).toContain('route-href');
	for (const file of clientFiles) {
		const text = await readFile(file, 'utf8');
		expect(text, file).not.toContain(root);
		expect(text, file).not.toContain(encodeURIComponent(root));
	}
}, 180_000);
