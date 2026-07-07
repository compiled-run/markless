import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { beforeAll, describe, expect, test } from 'vitest';
import { runtimeSizeReport } from '../test-support/runtime-size.ts';
import { assertRuntimeBudget } from './fixture-budget.ts';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');

const fixtures = [
	{
		filter: '@fixtures/vite-csr',
		outputs: ['packages/bundler/fixtures/vite-csr/dist'],
		bundleGraph: 'packages/bundler/fixtures/vite-csr/dist/build/bundle-graph.json',
		symbols: ['symbol:0', 'symbol:1'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-csr/dist',
			entryHtml: 'packages/bundler/fixtures/vite-csr/dist/index.html',
			maxRuntimeChunkGzipBytes: 3_100,
			// anti-bloat wall — tightened by the runtime-stdlib goal; any increase must be justified
			maxEmittedRuntimeGzipBytes: 15_500, // anti-bloat wall, measured 15,348; re-baselined 2026-07-06 after resume-time escalation made the fail-closed full-resume chain emit-reachable (emitted != fetched != executed; per-chunk caps unchanged and passing); tighten-only from here; runtime-stdlib goal shrinks the library itself
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
		bundleGraph: 'packages/bundler/fixtures/vite-ssr/dist/build/bundle-graph.json',
		symbols: ['symbol:0', 'symbol:1'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-ssr/dist',
			entryHtml: 'packages/bundler/fixtures/vite-ssr/dist/index.html',
			maxRuntimeChunkGzipBytes: 2_175,
			// anti-bloat wall — tightened by the runtime-stdlib goal; any increase must be justified
			maxEmittedRuntimeGzipBytes: 14_550, // anti-bloat wall, measured 14,396; re-baselined 2026-07-06 after resume-time escalation made the fail-closed full-resume chain emit-reachable (emitted != fetched != executed; per-chunk caps unchanged and passing); tighten-only from here; runtime-stdlib goal shrinks the library itself
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/vite-plus',
		outputs: ['packages/bundler/fixtures/vite-plus/dist'],
		bundleGraph: 'packages/bundler/fixtures/vite-plus/dist/build/bundle-graph.json',
		symbols: ['symbol:0'],
		runtimeBudget: {
			dist: 'packages/bundler/fixtures/vite-plus/dist',
			entryHtml: 'packages/bundler/fixtures/vite-plus/dist/index.html',
			maxRuntimeChunkGzipBytes: 2_950,
			// anti-bloat wall — tightened by the runtime-stdlib goal; any increase must be justified
			maxEmittedRuntimeGzipBytes: 15_450, // anti-bloat wall, measured 15,272; re-baselined 2026-07-06 after resume-time escalation made the fail-closed full-resume chain emit-reachable (emitted != fetched != executed; per-chunk caps unchanged and passing); tighten-only from here; runtime-stdlib goal shrinks the library itself
			forbidVitePreloadHelper: true,
		},
	},
	{
		filter: '@fixtures/rolldown-basic',
		outputs: ['packages/bundler/fixtures/rolldown-basic/dist'],
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
				// Owner ruling 2026-07-05: no per-page fetch metric — 'emitted = required'
				// assertions arrive with the runtime-stdlib goal. The wall guards bloat.
				const emittedReport = await runtimeSizeReport({
					dist: resolve(root, fixture.runtimeBudget.dist),
				});
				assertRuntimeBudget({ budget: fixture.runtimeBudget, emittedReport });
			}
		}, 120_000);
	}
});

async function execPnpm(args: string[]) {
	try {
		await exec('pnpm', args, { cwd: root });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}
