import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'pathe';
import { describe, expect, test } from 'vitest';
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
			// Recalibrated to actuals for chained-async key-phase gating (runtime gate + self-wake + single-flight); zero slack.
			// DE-MINIMIS INTERIM chain (settlement bridge +94); REPAYMENT OBLIGATION
			// ANCHORED TO THE ORIGINAL: final audit fails unless returned to <=18,183.
			maxEmittedRuntimeGzipBytes: 18_330, // interim 2026-08-06: +4 for the client residue-reader call site (browser-lane regression fix W4A, incl. ~2-byte run variance), de-minimis per proportionality order 2026-08-04. prior interim 2026-08-05: +11 total for the foreign-DOM census pin + range-splice invalidation (locator fix), de-minimis auto-interim per proportionality order 2026-08-04; repayment folded into the T013 vite-pair obligation. prior: owner receipt 2026-07-12: +15 for the lost-click window fix (pre-commit delegated listener install; measured 18,059); prior: anti-bloat wall, measured 17,962; re-baselined 2026-07-07 after tier-3 arm-branch flips became emit-reachable (demand-loaded; per-chunk caps + event-only budget unchanged); tighten-only from here; runtime-stdlib goal shrinks the library itself. consolidation debt: runtime-stdlib goal owns shrinking; two same-day re-baselines (commitArm, arm flips) — next expansion needs library shrink first.
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
			// Recalibrated to actuals for chained-async key-phase gating (runtime gate + self-wake + single-flight); zero slack. CI (Linux) emits slightly larger bytes than local macOS; wall tracks CI actuals.
			// DE-MINIMIS INTERIM chain (settlement bridge +94); REPAYMENT OBLIGATION
			// ANCHORED TO THE ORIGINAL: final audit fails unless returned to <=18,163.
			maxEmittedRuntimeGzipBytes: 18_293, // interim 2026-08-06: +4 for the client residue-reader call site (browser-lane regression fix W4A, incl. ~2-byte run variance), de-minimis per proportionality order 2026-08-04. prior interim 2026-08-05: +13 total for the foreign-DOM census pin + range-splice invalidation (locator fix), de-minimis auto-interim per proportionality order 2026-08-04; repayment folded into the T013 vite-pair obligation. prior: owner receipt 2026-07-12: +5 for the lost-click window fix (measured 18,026); prior: anti-bloat wall, measured 17,926; re-baselined 2026-07-07 after tier-3 arm-branch flips became emit-reachable (demand-loaded; per-chunk caps + event-only budget unchanged); tighten-only from here; runtime-stdlib goal shrinks the library itself. consolidation debt: runtime-stdlib goal owns shrinking; two same-day re-baselines (commitArm, arm flips) — next expansion needs library shrink first.
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
	// No root `pnpm build` here: fixtures resolve @markless deps through the dev
	// exports maps (src .ts), so package dists are not inputs to these builds.
	// Repacking the workspace from inside the suite wiped every packages/*/dist
	// (pack `clean: true`) in parallel with tests that read dist output
	// (scripts/release/publish-shape.test.ts), making the full run flaky.
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
				await expectNoAppChunkStaticallyImportsInstrumentChunk(
					resolve(root, fixture.runtimeBudget.dist),
				);
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

type ExecutionSizeEntry = {
	readonly chunk?: string;
	readonly instrument?: boolean;
};

async function expectNoAppChunkStaticallyImportsInstrumentChunk(dist: string): Promise<void> {
	const sizes = JSON.parse(
		await readFile(resolve(dist, 'build/execution-sizes.json'), 'utf8'),
	) as Record<string, ExecutionSizeEntry>;
	const instrumentChunks = new Set(
		Object.values(sizes)
			.filter((entry) => entry.instrument && entry.chunk)
			.map((entry) => entry.chunk!),
	);
	const appChunks = new Set(
		Object.values(sizes)
			.filter((entry) => !entry.instrument && entry.chunk)
			.map((entry) => entry.chunk!),
	);
	const forbiddenEdges: string[] = [];
	for (const importer of appChunks) {
		const source = await readFile(resolve(dist, 'build', importer), 'utf8');
		for (const match of source.matchAll(
			/\bimport(?:(?:\s+|[{\w*])[\s\S]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g,
		)) {
			const imported = match[1]!;
			if (instrumentChunks.has(imported)) forbiddenEdges.push(`${importer} -> ${imported}`);
		}
	}

	expect(
		forbiddenEdges,
		'app chunks must not statically import execution-instrument chunks',
	).toEqual([]);
}
