import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'pathe';
import { createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
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
