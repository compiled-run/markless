import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import { MARKLESS_BUILD_PREFIX } from '@markless/bundler/rolldown';

// The browser code is the app's, not the host's: building for another Nitro preset only moves where it is written.

const packagesRoot = resolve(import.meta.dirname, '../../..');
const presets = { vercel: '.vercel/output/static', 'cloudflare-module': '.output/public' };
let root = '';
const chunks: Record<string, Record<string, string>> = {};

async function clientChunks(dir: string): Promise<Record<string, string>> {
	const files = (await readdir(join(dir, MARKLESS_BUILD_PREFIX), { recursive: true })) as string[];
	const hashes: Record<string, string> = {};
	for (const file of files.filter((name) => name.endsWith('.js')).sort())
		hashes[file] = createHash('sha256')
			.update(await readFile(join(dir, MARKLESS_BUILD_PREFIX, file)))
			.digest('hex');
	return hashes;
}

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-preset-client-'));
	await cp(resolve(import.meta.dirname, '../fixtures/defects-app'), root, { recursive: true });
	await writeFile(join(root, 'package.json'), '{ "name": "markless-preset-client", "private": true }\n');
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	for (const [preset, clientDir] of Object.entries(presets)) {
		// Each build compiles from scratch, as a fresh checkout on CI does.
		await rm(join(root, 'node_modules/.vite'), { recursive: true, force: true });
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			nitro: {
				preset,
				compatibilityDate: '2026-10-01',
				routeRules: { '/**': { prerender: true } },
			},
			plugins: [markless(), router()],
		} as Parameters<typeof createBuilder>[0]);
		await builder.buildApp();
		chunks[preset] = await clientChunks(join(root, clientDir));
	}
}, 240_000);

afterAll(async () => {
	if (root) await rm(root, { recursive: true, force: true });
});

test('the same app built for Vercel and for Cloudflare Workers ships the same client chunks', () => {
	expect(Object.keys(chunks.vercel!).length).toBeGreaterThan(0);
	expect(chunks['cloudflare-module']).toEqual(chunks.vercel);
});
