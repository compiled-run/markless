import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { MARKLESS_BUILD_PREFIX } from '@markless/bundler/rolldown';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';
import {
	compressedAssetsModule,
	compressedAssetsState,
	PUBLIC_BROTLI_QUALITY,
} from '../../src/vite/nitro-compressed-assets.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';

vi.setConfig({ testTimeout: 30_000 });

const packagesRoot = resolve(import.meta.dirname, '../../..');
let root = '';
let origin = '';
let close: (() => void) | undefined;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'markless-compressed-assets-'));
	await cp(resolve(import.meta.dirname, '../fixtures/fragment-app'), root, { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await symlink(
		resolve(packagesRoot, 'router/node_modules/nitro'),
		join(root, 'node_modules/nitro'),
		'dir',
	);
	const nodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = 'production';
	try {
		const builder = await createBuilder({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless(), router()],
		});
		await builder.buildApp();
	} finally {
		if (nodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = nodeEnv;
	}
	const server = await startBuiltServer(join(root, '.output/server/index.mjs'), {
		env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
	});
	origin = server.origin;
	close = () => server.close();
}, 240_000);

afterAll(async () => {
	close?.();
	if (root) await rm(root, { recursive: true, force: true });
});

function get(path: string, acceptEncoding?: string) {
	return new Promise<{ headers: Record<string, string | string[] | undefined>; body: Buffer }>(
		(done, fail) => {
			const req = request(
				origin + path,
				{
					headers:
						acceptEncoding === undefined ? {} : { 'accept-encoding': acceptEncoding },
				},
				(res) => {
					const chunks: Buffer[] = [];
					res.on('data', (chunk: Buffer) => chunks.push(chunk));
					res.on('end', () =>
						done({ headers: res.headers, body: Buffer.concat(chunks) }),
					);
				},
			);
			req.on('error', fail);
			req.end();
		},
	);
}

async function largestScript(): Promise<string> {
	const dir = join(root, '.output/public', MARKLESS_BUILD_PREFIX);
	const files = (await readdir(dir, { recursive: true })).filter((file) => file.endsWith('.js'));
	const sized = await Promise.all(
		files.map(async (file) => ({ file, size: (await readFile(join(dir, file))).length })),
	);
	return `/${MARKLESS_BUILD_PREFIX}${sized.sort((a, b) => b.size - a.size)[0]!.file}`;
}

test('the node server answers a script with its precompressed brotli or gzip copy, and the file itself otherwise', async () => {
	const path = await largestScript();
	const original = await readFile(join(root, '.output/public', path));
	expect(original.length).toBeGreaterThan(1024);

	const br = await get(path, 'gzip, deflate, br, zstd');
	expect(br.headers['content-encoding']).toBe('br');
	expect(String(br.headers.vary)).toMatch(/accept-encoding/i);
	expect(br.headers['content-type']).toMatch(/javascript/);
	expect(br.headers['cache-control']).toContain('immutable');
	expect(Number(br.headers['content-length'])).toBe(br.body.length);
	expect(br.body.length).toBeLessThan(original.length);
	expect(brotliDecompressSync(br.body).equals(original)).toBe(true);

	const gzip = await get(path, 'gzip');
	expect(gzip.headers['content-encoding']).toBe('gzip');
	expect(gunzipSync(gzip.body).equals(original)).toBe(true);

	const plain = await get(path);
	expect(plain.headers['content-encoding']).toBeUndefined();
	expect(plain.body.equals(original)).toBe(true);
});

test('every file with a gzip copy has a brotli copy written at the public brotli quality', async () => {
	const publicDir = join(root, '.output/public');
	const gzipped = (await readdir(publicDir, { recursive: true })).filter((file) =>
		file.endsWith('.gz'),
	);
	expect(gzipped.length).toBeGreaterThan(0);
	for (const gz of gzipped) {
		const original = await readFile(join(publicDir, gz.slice(0, -3)));
		const br = await readFile(join(publicDir, `${gz.slice(0, -3)}.br`));
		expect(brotliDecompressSync(br).equals(original)).toBe(true);
		const expected = brotliCompressSync(original, {
			params: { [constants.BROTLI_PARAM_QUALITY]: PUBLIC_BROTLI_QUALITY },
		});
		expect(br.equals(expected), gz).toBe(true);
	}
});

test('precompression stays off where the host compresses at its edge, inlines assets, or the app chose', () => {
	const options = (serveStatic: boolean | string) => ({
		options: { serveStatic, output: { publicDir: '/out/public' } } as {
			serveStatic: boolean | string;
			output: { publicDir: string };
			compressPublicAssets?: unknown;
		},
	});
	const node = options(true);
	const nodeState = compressedAssetsState();
	compressedAssetsModule(false, nodeState).setup(node);
	expect(node.options.compressPublicAssets).toEqual({ gzip: true });
	expect(nodeState.brotliDir).toBe('/out/public');
	for (const nitro of [options(false), options('inline')]) {
		const state = compressedAssetsState();
		compressedAssetsModule(false, state).setup(nitro);
		expect(nitro.options.compressPublicAssets).toBeUndefined();
		expect(state.brotliDir).toBeUndefined();
	}
	const chosen = options(true);
	const chosenState = compressedAssetsState();
	compressedAssetsModule(true, chosenState).setup(chosen);
	expect(chosen.options.compressPublicAssets).toBeUndefined();
	expect(chosenState.brotliDir).toBeUndefined();
});
