import { execFile } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, test } from 'vitest';
import { runtimeSizeReport } from '../test-support/runtime-size.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');

const fixtures = [
	{
		filter: '@fixtures/vite-csr',
		outputs: ['packages/bundler/fixtures/vite-csr/dist'],
		forbiddenManifest: 'packages/bundler/fixtures/vite-csr/dist/arcade-manifest.json',
		bundleGraph: 'packages/bundler/fixtures/vite-csr/dist/build/bundle-graph.json',
		symbols: ['symbol:0', 'symbol:1'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-csr/dist',
			entryHtml: 'packages/bundler/fixtures/vite-csr/dist/index.html',
			maxRuntimeChunkGzipBytes: 3_000,
			maxAsyncScriptsGzipBytes: 3_050,
			maxAsyncScriptCount: 2,
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/vite-library',
		outputs: ['packages/bundler/fixtures/vite-library/dist'],
	},
	{
		filter: '@fixtures/vite-ssr',
		outputs: ['packages/bundler/fixtures/vite-ssr/dist'],
		forbiddenManifest: 'packages/bundler/fixtures/vite-ssr/dist/arcade-manifest.json',
		bundleGraph: 'packages/bundler/fixtures/vite-ssr/dist/build/bundle-graph.json',
		symbols: ['symbol:0', 'symbol:1', 'symbol:2'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-ssr/dist',
			maxRuntimeChunkGzipBytes: 2_175,
			maxAsyncScriptsGzipBytes: 4_100,
			maxAsyncScriptCount: 7,
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/vite-plus',
		outputs: ['packages/bundler/fixtures/vite-plus/dist'],
		forbiddenManifest: 'packages/bundler/fixtures/vite-plus/dist/arcade-manifest.json',
		bundleGraph: 'packages/bundler/fixtures/vite-plus/dist/build/bundle-graph.json',
		symbols: ['symbol:0'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-plus/dist',
			entryHtml: 'packages/bundler/fixtures/vite-plus/dist/index.html',
			maxRuntimeChunkGzipBytes: 2_950,
			maxAsyncScriptsGzipBytes: 3_000,
			maxAsyncScriptCount: 2,
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/rolldown-basic',
		outputs: ['packages/bundler/fixtures/rolldown-basic/dist'],
		forbiddenManifest:
			'packages/bundler/fixtures/rolldown-basic/dist/client/arcade-manifest.json',
		bundleGraph: 'packages/bundler/fixtures/rolldown-basic/dist/client/build/bundle-graph.json',
		symbols: ['symbol:0', 'symbol:1'],
	},
] as const;

describe('fixture builds', () => {
	beforeAll(async () => {
		await execPnpm(['build']);
	}, 120_000);

	for (const fixture of fixtures) {
		test(`${fixture.filter} builds from a clean output directory`, async () => {
			await Promise.all(
				fixture.outputs.map((output) =>
					rm(resolve(root, output), {
						force: true,
						recursive: true,
					}),
				),
			);

			await execPnpm(['--filter', fixture.filter, 'build']);

			if ('forbiddenManifest' in fixture) {
				expect(await exists(resolve(root, fixture.forbiddenManifest))).toBe(false);
			}

			if ('bundleGraph' in fixture) {
				const graph = JSON.parse(
					await readFile(resolve(root, fixture.bundleGraph), 'utf8'),
				);
				expect(graph).toEqual(expect.any(Array));
				for (const symbol of fixture.symbols) {
					expect(graph).toContain(symbol);
				}
			}

			if ('runtimeBudget' in fixture) {
				const scripts =
					'entryHtml' in fixture.runtimeBudget
						? await readModuleScripts(resolve(root, fixture.runtimeBudget.entryHtml))
						: undefined;
				const report = await runtimeSizeReport({
					dist: resolve(root, fixture.runtimeBudget.dist),
					scripts,
					includeStaticImports: !!scripts,
				});
				expect(report.runtimeChunks.length, report.summary).toBeGreaterThan(0);
				expect(report.largestRuntimeChunk?.gzipBytes, report.summary).toBeLessThanOrEqual(
					fixture.runtimeBudget.maxRuntimeChunkGzipBytes,
				);
				expect(report.asyncScripts.gzipBytes, report.summary).toBeLessThanOrEqual(
					fixture.runtimeBudget.maxAsyncScriptsGzipBytes,
				);
				expect(report.asyncScripts.count, report.summary).toBeLessThanOrEqual(
					fixture.runtimeBudget.maxAsyncScriptCount,
				);
				if (fixture.runtimeBudget.forbidVitePreloadHelper) {
					const chunksWithVitePreloadHelper = report.runtimeChunks
						.filter((chunk) => chunk.hasVitePreloadHelper)
						.map((chunk) => chunk.fileName);
					expect(chunksWithVitePreloadHelper, report.summary).toEqual([]);
				}
			}
		}, 120_000);
	}
});

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readModuleScripts(fileName: string): Promise<string[]> {
	const html = await readFile(fileName, 'utf8');
	return [
		...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g),
	].map((match) => match[1]!);
}

async function execPnpm(args: string[]) {
	try {
		await exec('pnpm', args, { cwd: root });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}
