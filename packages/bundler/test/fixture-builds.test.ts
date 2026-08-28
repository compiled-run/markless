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
			// 3,100 -> 3,300 (2026-08-23): +217 for the DOM-faithful bubble walk (defect 67).
			// 3,300 -> 3,460 (2026-08-23): +149 measured 3,449 - per-graph widget registries
			// (defect 72) + plural element-handle reads (C-prime) + keyed-row removal.
			// Repayment owed to bundler-diet with the existing pay-per-use obligation.
			// 3,460 -> 3,560 (2026-08-23): +91 measured 3,551 - the timer-callback write band
			// (defect 79) + the emitted resolver's per-graph handle wrapper (defect 78,
			// which also DELETED the runtime's host-derived fallback). Bundler-diet repayment.
			// re-anchor 2026-08-27: 3,750 -> 5,162, measured 5,151 (raw 13,945; was raw 10,306 at the
			// 3,739 anchor 48851c2b). Two changes moved it, and nothing else in this chunk did.
			// Attribution is by module exhaustion, not revert-measurement: the chunk's whole string
			// literal set names only the dispatch core (`web:resume-events`,
			// MARKLESS_EVENT_DISPATCH_UNMATCHED), instance scope (MARKLESS_WIDGET_INSTANCE_UNRESOLVED)
			// and the focus keys, and the only sources feeding it that changed since the anchor are
			// resume-events.ts (+12,610 raw source B), fns/instance-scope.ts (+7,937),
			// fns/overlay.ts (+3,023) and the new fns/element-handle-roster.ts.
			//   529caa2d  focus replay moved INTO the dispatch core (marklessNativeFocus,
			//             marklessOverlayFocusOrigin, marklessPrimedHover), so a plain click loads no
			//             module for a handle it never reads - progressive execution buys the bytes.
			//             The pointer/focus priming merges that fed it are in the same family.
			//   9fbedb5c  the element-bound roster keyed by widget instance, with 65ab93e3 (a widget
			//   65ab93e3  root's own element mints from its own instance token) and c288d956 (a
			//   c288d956  surface's captured focus origin handed out through the runtime):
			//             marklessQualifyGraphNodeId, marklessWidgetHostGraph, marklessRowParent.
			// Named and NOT either family, both landing in resume-events.ts: 96b659d9 disposed-row
			// dispatch and 61953e0d non-bubbling dispatch. The row-component mint stays demand-split -
			// none of its MARKLESS_REPEAT_ROW_COMPONENT_* codes appear anywhere in this fixture's
			// build, so it costs this wall nothing. Margin 11 B for gzip run variance, as before.
			// Repayment owed to bundler-diet with the existing pay-per-use obligation.
			// re-anchor 2026-08-27 (element-handle qualifier, chunk cost priced): the
			// qualifier's install slot left resume-locators.ts for resume-arm-records.ts.
			// Why it moved: fns/instance-scope.ts is statically imported by the dispatch
			// core (resume-events.ts), so instance-scope importing resume-locators.ts made
			// the always-loaded chunk swallow resume-locators + resume-census whole -
			// 13,945 -> 16,952 raw, 5,151 -> 6,202 gzip, and NOT one byte of it new code.
			// Priced by revert-measurement, not assumption: reverting the three web files
			// on the tip returns this chunk to 13,945 raw / 5,151 gzip exactly, so the
			// whole +1,051 was theirs. instance-scope already imported resume-arm-records,
			// so hosting the slot there removed the edge without adding one.
			// SPLIT: 1,053 gzip recovered here (6,202 -> 5,149, two under the 5,151 this
			// chunk measured before the qualifier existed - the slot's own bytes left too).
			// The residue is on the emitted wall below, not this one.
			maxRuntimeChunkGzipBytes: 5_160, // re-anchor 2026-08-27: measured 5,149, margin 11 for gzip run variance. prior 5,162 (measured 5,151) - see the attribution above. prior 3,750 (measured 3,739, dispatch-ordering + row-mint + stop-threading). prior 3,730 (multi-binding chain).
			// anti-bloat wall — tightened by the runtime-stdlib goal; any increase must be justified
			// Recalibrated to actuals for chained-async key-phase gating (runtime gate + self-wake + single-flight); zero slack.
			// DE-MINIMIS INTERIM chain (settlement bridge +94); REPAYMENT OBLIGATION
			// ANCHORED TO THE ORIGINAL: final audit fails unless returned to <=18,183.
			// re-anchor 2026-08-23 (U157, instance-scope row/widget stack): 18,658 -> 19,740, measured
			// 19,722. Baseline re-measured on this tree at the music-player wall's own anchor commit
			// 76d4a492: 18,611, so the growth priced here is +1,111. Attributed by building the tree at
			// each merge on the first-parent chain, then confirmed by revert-measurement on the tip:
			//   +25    U140, the disposed-container guard (teardown race; runtime by nature).
			//   +1,087 U139+U143+U150, the instance-scope row/widget stack (layer 4 row segment on
			//          bound symbols, layer 5 widget-root follows the dispatched row, layer 6 widget
			//          ids through the root registry). Reverting all three on the tip returns this
			//          fixture to 18,635 exactly, matching the pre-layer-4 chain build. The three
			//          cannot be split by revert - layers 5 and 6 edit layer 4's code in
			//          fns/instance-scope.ts - so the per-layer shares come from the chain builds:
			//          +918 layer 4, +112 layer 5, +57 layer 6 with U153.
			//   +0     U124-U137 (compiler emission only: -1 here across that whole span), U138,
			//          U142, U145, U147, U149, U151, U153 and every @markless/ui family in the window.
			// THIS IS NOT PAYLOAD AND NOT COMPILE-TIME-IMPOSSIBLE COST. This fixture is one root.tsrx
			// with no `@for`, no widget, and no shared() call, so it never takes a row segment or
			// resolves a widget root; it pays 1,087 B for capability code currently retained
			// unconditionally in the shared runtime chunk. On the music-player demo the same three
			// layers cost only 418 B and are genuinely unavoidable there (a keyed row's key is a
			// runtime value). The gap is the repayment: gating the stack pay-per-use has a MEASURED
			// ceiling of 1,087 B here and 1,082 B on vite-plus - that is what the revert recovered, so
			// no estimate is involved. Owed to bundler-diet as its highest-value single item; the wall
			// is raised to keep the suite honest, not because these bytes are earned.
			// Margin is 18 B for gzip run variance; local macOS measurement, next CI actual re-anchors.
			// re-anchor 2026-08-27: 20,775 -> 23,604, measured 23,586 across the same 15 runtime-heavy
			// chunks. +1,412 of the +2,825 is the dispatch-core chunk above (same two families). The
			// rest is the demand-gated companion chunk that carries the roster's own refusals
			// (MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS, 2,949 gzip) - 9fbedb5c's roster keyed by
			// widget instance, split out of the eager closure by the roster demand gate rather than
			// deleted, so it is counted here and not in the chunk cap. Margin 18 B for gzip run
			// variance; local macOS measurement. Repayment owed to bundler-diet.
			// 23,604 -> 23,644 (2026-08-27): +40 measured, the UNAVOIDABLE half of the
			// qualifier split. resume-locators + resume-census standing as their own
			// demand-loaded chunk gzip worse than they did merged into the dispatch chunk
			// (two dictionaries, not one), and the slot itself is ~330 chars. That is the
			// price of those bytes not being eager, and it is the whole residue: the
			// largest-chunk wall above took the 1,053-byte recovery.
			maxEmittedRuntimeGzipBytes: 23_644, // re-anchor 2026-08-27: measured 23,626, margin 18. prior 23,604 (measured 23,586) - see above. prior 20,775 (measured 20,761 - accrual from the dispatch-ordering + row-mint chain. prior 20,750 (multi-binding). prior 20,440 -> 20,550. // re-anchor 2026-08-23: measured 20,542 - same 79/78 chain as the chunk wall above. prior 20,280 -> 20,440. // re-anchor 2026-08-23: measured 20,431 - the registry + plural-handle chain (see the chunk wall above); bundler-diet repayment. prior: 19,790 -> 20,280. // re-anchor 2026-08-23: 19,790 -> 20,280, measured 20,260. +470 across the handle/dispatch capability chain landed today: handle value-reads + per-instance keying + composition-aware seed gates + anchor-style residue + the DOM-faithful bubble walk (defect 67, +217 of it). Same pay-per-use repayment obligation as the instance-scope stack above: this fixture is one root.tsrx and takes none of these paths at runtime; owed to bundler-diet. // prior re-anchor 2026-08-19 (attribute presence, owner-accepted): 18,556 -> 18,658, measured 18,654 local macOS; dynamic attributes emit name+value from the slot so undefined/null/false render no attribute (SSR too); ~77 is compiler emission (the name is no longer duplicated in statics), ~21 the shared runtime presence helper; repayment owed by bundler-diet. prior re-anchor 2026-08-18 (per-app reconcile wiring): 18,565 -> 18,556, measured 18,552 local macOS. The plane is now emitted per app, so what stays here is the call-site residue in the graph itself, not the reconcile helper. prior interim 2026-08-17 (owner-accepted cost class, PR #23): +72 for derived-result reconciliation in the runtime graph (path-granular computed invalidation; CI 18,522, local macOS 18,561, wall covers both + gzip run variance); repayment owed by the runtime-stdlib shrink obligation. prior interim 2026-08-06 (owner-accepted): +163 for mount-time served-arm record registration (composed-boundary correctness, same defect family as the recordless-click seizure; 5 variants measured, this is the cheapest); repayment owed by the runtime-stdlib shrink obligation. prior same-day: +4 for the client residue-reader call site (browser-lane regression fix W4A, incl. ~2-byte run variance), de-minimis per proportionality order 2026-08-04. prior interim 2026-08-05: +11 total for the foreign-DOM census pin + range-splice invalidation (locator fix), de-minimis auto-interim per proportionality order 2026-08-04; repayment folded into the T013 vite-pair obligation. prior: owner receipt 2026-07-12: +15 for the lost-click window fix (pre-commit delegated listener install; measured 18,059); prior: anti-bloat wall, measured 17,962; re-baselined 2026-07-07 after tier-3 arm-branch flips became emit-reachable (demand-loaded; per-chunk caps + event-only budget unchanged); tighten-only from here; runtime-stdlib goal shrinks the library itself. consolidation debt: runtime-stdlib goal owns shrinking; two same-day re-baselines (commitArm, arm flips) — next expansion needs library shrink first.
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
			// 2,950 -> 3,290 (2026-08-23): +215 bubble walk; 3,290 -> 3,300: +18 dispatch fix.
			// 3,300 -> 3,455 (2026-08-23): +143 measured 3,443 - same registry + plural-handle
			// chain as vite-csr; bundler-diet repayment.
			// 3,455 -> 3,555 (2026-08-23): +90 measured 3,545 - same chain as vite-csr.
			// re-anchor 2026-08-27: 3,745 -> 5,165, measured 5,153 at raw 13,945 - byte-identical raw
			// size to vite-csr's chunk, because it is the same shared runtime chunk. Same two changes,
			// same attribution as the vite-csr entry above: focus replay into the dispatch core
			// (529caa2d) and widget-instance qualification (9fbedb5c, 65ab93e3, c288d956), plus the
			// same two unrelated dispatch fixes (96b659d9, 61953e0d). Margin 12 B, as before.
			// re-anchor 2026-08-27: same shared runtime chunk as vite-csr, byte-identical
			// raw size (13,933), same qualifier move and same attribution as that entry.
			// 1,054 gzip recovered (6,201 -> 5,147); residue on the emitted wall below.
			maxRuntimeChunkGzipBytes: 5_159, // re-anchor 2026-08-27: measured 5,147, margin 12 for gzip run variance. prior 5,165 (measured 5,153) - see the attribution above. prior 3,745 (measured 3,733). prior 3,725.
			// anti-bloat wall — tightened by the runtime-stdlib goal; any increase must be justified
			// Recalibrated to actuals for chained-async key-phase gating (runtime gate + self-wake + single-flight); zero slack. CI (Linux) emits slightly larger bytes than local macOS; wall tracks CI actuals.
			// DE-MINIMIS INTERIM chain (settlement bridge +94); REPAYMENT OBLIGATION
			// ANCHORED TO THE ORIGINAL: final audit fails unless returned to <=18,163.
			// re-anchor 2026-08-23 (U157, instance-scope row/widget stack): 18,580 -> 19,660, measured
			// 19,639. Baseline re-measured on this tree at commit 76d4a492: 18,528, so the growth
			// priced here is +1,111 - the same total as vite-csr, from the same shared runtime chunk.
			// Attributed by chain builds and confirmed by revert-measurement on the tip:
			//   +29    U140, the disposed-container guard (teardown race; runtime by nature).
			//   +1,082 U139+U143+U150, the instance-scope row/widget stack; reverting all three on the
			//          tip returns this fixture to 18,557 exactly. Per-layer shares from the chain
			//          builds: +916 layer 4, +111 layer 5, +55 layer 6 with U153.
			//   +0     U124-U137 (0 here across that whole span), U138, U142, U145, U147, U149, U151,
			//          U153 and every @markless/ui family in the window.
			// Same verdict as vite-csr: this fixture has no `@for`, no widget and no shared() call, so
			// the 1,082 B is retained capability code it never runs, not payload and not
			// compile-time-impossible cost. Pay-per-use gating has a MEASURED recovery ceiling of
			// 1,082 B here. Owed to bundler-diet; the wall moves to keep the suite honest, not because
			// the bytes are earned. Margin is 21 B for gzip run variance; local macOS measurement.
			// re-anchor 2026-08-27: 20,705 -> 23,552, measured 23,531 across the same 15 runtime-heavy
			// chunks - same accrual as vite-csr (shared runtime chunk + the demand-gated roster
			// chunk), same bundler-diet repayment obligation. Margin 21 B for gzip run variance.
			// 23,552 -> 23,583 (2026-08-27): +31 measured, the same unavoidable half as
			// vite-csr - the demand-split locator chunk gzips worse alone than merged.
			maxEmittedRuntimeGzipBytes: 23_583, // re-anchor 2026-08-27: measured 23,562, margin 21. prior 23,552 (measured 23,531) - see above. prior 20,705 (measured 20,693 - same accrual as vite-csr. prior 20,680. // prior re-anchor 2026-08-24: measured 20,666 - same chain. prior 20,370 -> 20,480. // re-anchor 2026-08-23: measured 20,466 - same chain. prior 20,210 -> 20,370. // re-anchor 2026-08-23: measured 20,361 - same chain as vite-csr; bundler-diet repayment. prior: 20,190 -> 20,210 -> this. Same +~470 capability chain as vite-csr (shared runtime chunk); same bundler-diet repayment obligation. // prior re-anchor 2026-08-19 (attribute presence, owner-accepted): 18,490 -> 18,580, measured 18,576 local macOS; same change as vite-csr (~75 compiler emission, ~11 runtime helper); repayment owed by bundler-diet. prior re-anchor 2026-08-18 (per-app reconcile wiring): 18,495 -> 18,490, measured 18,486 local macOS. prior interim 2026-08-17 (owner-accepted cost class, PR #23): +54 for derived-result reconciliation in the runtime graph (CI 18,454, local macOS 18,491, wall covers both + gzip run variance); repayment owed by the runtime-stdlib shrink obligation. prior interim 2026-08-06 (owner-accepted): +148 for mount-time served-arm record registration; repayment owed by the runtime-stdlib shrink obligation. prior same-day: +4 for the client residue-reader call site (browser-lane regression fix W4A, incl. ~2-byte run variance), de-minimis per proportionality order 2026-08-04. prior interim 2026-08-05: +13 total for the foreign-DOM census pin + range-splice invalidation (locator fix), de-minimis auto-interim per proportionality order 2026-08-04; repayment folded into the T013 vite-pair obligation. prior: owner receipt 2026-07-12: +5 for the lost-click window fix (measured 18,026); prior: anti-bloat wall, measured 17,926; re-baselined 2026-07-07 after tier-3 arm-branch flips became emit-reachable (demand-loaded; per-chunk caps + event-only budget unchanged); tighten-only from here; runtime-stdlib goal shrinks the library itself. consolidation debt: runtime-stdlib goal owns shrinking; two same-day re-baselines (commitArm, arm flips) — next expansion needs library shrink first.
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
