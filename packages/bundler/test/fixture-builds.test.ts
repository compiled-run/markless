import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
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
		manifest: 'packages/bundler/fixtures/vite-csr/dist/arcade-manifest.json',
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-csr/dist',
			entryHtml: 'packages/bundler/fixtures/vite-csr/dist/index.html',
			maxRuntimeChunkGzipBytes: 3_000,
			maxAsyncScriptsGzipBytes: 3_050,
			maxAsyncScriptCount: 2,
			forbidVitePreloadHelper: true,
			forbiddenRuntimeOrigins: [
				'/runtime/src/event-resume.ts',
				'/runtime/src/payload.ts',
				'/runtime/src/resume.ts',
				'/serializer/src/',
			],
		},
	},
	{
		filter: '@fixtures/vite-library',
		outputs: ['packages/bundler/fixtures/vite-library/dist'],
	},
	{
		filter: '@fixtures/vite-ssr',
		outputs: ['packages/bundler/fixtures/vite-ssr/dist'],
		manifest: 'packages/bundler/fixtures/vite-ssr/dist/arcade-manifest.json',
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-ssr/dist',
			maxRuntimeChunkGzipBytes: 2_175,
			maxAsyncScriptsGzipBytes: 2_700,
			maxAsyncScriptCount: 4,
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/vite-plus',
		outputs: ['packages/bundler/fixtures/vite-plus/dist'],
		manifest: 'packages/bundler/fixtures/vite-plus/dist/arcade-manifest.json',
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-plus/dist',
			entryHtml: 'packages/bundler/fixtures/vite-plus/dist/index.html',
			maxRuntimeChunkGzipBytes: 2_950,
			maxAsyncScriptsGzipBytes: 3_000,
			maxAsyncScriptCount: 2,
			forbidVitePreloadHelper: true,
			forbiddenRuntimeOrigins: ['/runtime/src/event-resume.ts'],
		},
	},
	{
		filter: '@fixtures/rolldown-basic',
		outputs: ['packages/bundler/fixtures/rolldown-basic/dist'],
		manifest: 'packages/bundler/fixtures/rolldown-basic/dist/client/arcade-manifest.json',
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

			if (fixture.manifest) {
				const manifest = JSON.parse(
					await readFile(resolve(root, fixture.manifest), 'utf8'),
				);
				expect(manifest.version).toBe(1);
				expect(manifest.modules).toEqual(expect.any(Array));
				expect(manifest.bundleGraphAsset).toBe('build/bundle-graph.json');
			}

			if ('runtimeBudget' in fixture) {
				const scripts =
					'entryHtml' in fixture.runtimeBudget
						? await readModuleScripts(resolve(root, fixture.runtimeBudget.entryHtml))
						: undefined;
				const report = await runtimeSizeReport({
					dist: resolve(root, fixture.runtimeBudget.dist),
					manifest: resolve(root, fixture.manifest),
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
				if ('forbiddenRuntimeOrigins' in fixture.runtimeBudget) {
					const forbiddenOrigins = report.runtimeChunks.flatMap((chunk) =>
						chunk.origins.filter((origin) =>
							fixture.runtimeBudget.forbiddenRuntimeOrigins.some((forbidden) =>
								`/${origin}`.includes(forbidden),
							),
						),
					);
					expect(forbiddenOrigins, report.summary).toEqual([]);
				}
			}
		}, 120_000);
	}
});

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
