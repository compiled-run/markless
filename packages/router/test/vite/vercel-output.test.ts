import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { brotliCompressSync, constants } from 'node:zlib';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { MARKLESS_BUILD_PREFIX } from '@markless/bundler/rolldown';
import { markless } from '@markless/bundler/vite';
import { router } from '../../src/vite/index.ts';

// A Vercel function ships without node_modules, so the server bundle may import only
// its own files and Node built-ins, even for an app with api/ and middleware/ files.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 });

const fixture = resolve(import.meta.dirname, '../../fixtures/router-full-stack');
let output = '';

beforeAll(async () => {
	output = await mkdtemp(join(tmpdir(), 'markless-vercel-output-'));
	const builder = await createBuilder({
		root: fixture,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
		nitro: {
			preset: 'vercel',
			buildDir: join(fixture, 'node_modules/.nitro-vercel-output-test'),
			output: { dir: output },
		},
	} as Parameters<typeof createBuilder>[0]);
	await builder.buildApp();
});

afterAll(async () => {
	if (output) await rm(output, { recursive: true, force: true });
	await rm(join(fixture, 'node_modules/.nitro-vercel-output-test'), {
		recursive: true,
		force: true,
	});
});

test('the Vercel server function imports nothing it does not carry', async () => {
	const server = join(output, 'functions/__server.func');
	const packageImports: string[] = [];
	for (const file of await readdir(server, { recursive: true })) {
		if (!file.endsWith('.mjs')) continue;
		const code = await readFile(join(server, file), 'utf8');
		for (const [, specifier] of code.matchAll(
			/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g,
		))
			if (!specifier!.startsWith('.') && !isBuiltin(specifier!))
				packageImports.push(`${file}: ${specifier}`);
	}
	expect(packageImports).toEqual([]);
});

test('Vercel serves each client chunk from a brotli copy written at the highest quality', async () => {
	const staticDir = join(output, 'static');
	const scripts = (await readdir(join(staticDir, MARKLESS_BUILD_PREFIX), { recursive: true })).filter(
		(file) => /\.(?:js|css)$/.test(file),
	);
	expect(scripts.length).toBeGreaterThan(0);
	for (const file of scripts) {
		const original = await readFile(join(staticDir, MARKLESS_BUILD_PREFIX, file));
		const copy = await readFile(join(staticDir, MARKLESS_BUILD_PREFIX, `${file}.br`));
		expect(
			copy.equals(
				brotliCompressSync(original, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
			),
			file,
		).toBe(true);
	}
	const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8')) as {
		routes: Array<{
			src?: string;
			dest?: string;
			has?: Array<{ type: string; key: string; value?: string }>;
			headers?: Record<string, string>;
		}>;
	};
	const filesystem = config.routes.findIndex((route) => 'handle' in route);
	const script = `/${MARKLESS_BUILD_PREFIX}${scripts.find((file) => file.endsWith('.js'))}`;
	const served = config.routes.findIndex(
		(route) =>
			route.src !== undefined &&
			new RegExp(route.src).test(script) &&
			route.dest !== undefined,
	);
	expect(served).toBeGreaterThanOrEqual(0);
	expect(served).toBeLessThan(filesystem);
	const route = config.routes[served]!;
	expect(script.replace(new RegExp(route.src!), route.dest!)).toBe(`${script}.br`);
	expect(route.has).toEqual([
		expect.objectContaining({ type: 'header', key: 'accept-encoding' }),
	]);
	const accepts = new RegExp(`^(?:${route.has![0]!.value!})$`);
	expect(accepts.test('gzip, deflate, br, zstd')).toBe(true);
	expect(accepts.test('br')).toBe(true);
	expect(accepts.test('gzip, deflate')).toBe(false);
	expect(route.headers).toMatchObject({
		'content-encoding': 'br',
		'content-type': expect.stringMatching(/javascript/),
		'cache-control': expect.stringContaining('immutable'),
	});
	expect(String(route.headers!.vary)).toMatch(/accept-encoding/i);
});
