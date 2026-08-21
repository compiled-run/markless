import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { resolve } from 'pathe';
import { expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const demo = resolve(root, 'demos/music-player-ssr');
const clientBuild = resolve(demo, '.output/public/build');

// Production `executionLog: never` measurement: 62,464 B across 76 distinct
// size-map chunks; 62,500 B is the permanent shipped wall (owner ratification
// 2026-07-12, T006), leaving 36 B / 0.06% headroom. Tighten only.
// 62,500 -> 62,520 (owner receipt 2026-07-12): lost-click window fix, measured 62,514.
// Recalibrated to actuals for chained-async key-phase gating (runtime gate + self-wake + single-flight); zero slack. CI (Linux) emits slightly larger bytes than local macOS; wall tracks CI actuals.
// 62,657 -> 62,722 (interim 2026-08-05): +65 for the foreign-DOM census pin + range-splice invalidation (locator fix), de-minimis auto-interim per proportionality order 2026-08-04; repayment folded into T013's mp-ssr obligations.
// 62,722 -> 62,925 (interim 2026-08-06, owner-accepted cost class): +203 for mount-time served-arm record registration + the client residue-reader call site (browser-lane correctness fixes); covers both environments (CI 62,915, local macOS 62,923) plus ~2-byte gzip run variance; repayment stays with the runtime-stdlib shrink obligation. Was: +193 CI-measured for mount-time served-arm record registration + the client residue-reader call site (browser-lane correctness fixes); wall tracks CI actuals per the note above; repayment stays with the runtime-stdlib shrink obligation.
// 62,925 -> 62,940 (interim 2026-08-11): +13 local (62,938 measured post strict-everywhere landing 6b2134e9 + style-object lowering working tree), de-minimis auto-interim per proportionality order 2026-08-04; attribution not isolated between the two change sets - prime suspect is the composite functionSource extraction in collect-elements (touches all composite template expressions); T999 style-object audit owns confirming or repaying.
// 62,940 -> 64,390 (interim 2026-08-17, owner-accepted cost class, PR #23): +1,450 for derived-result reconciliation in the runtime graph (graph-reconcile.ts plus the write / read / async-publish hooks; path-granular computed invalidation). CI 64,369, local macOS 64,363-64,382; wall covers both environments plus gzip run variance. Repayment owed by the runtime-stdlib shrink obligation; the reconcile helper (~1.2 kB gzip on its own) is the first shrink candidate.
// 64,390 -> 63,090 (re-anchor 2026-08-18, per-app reconcile wiring): derived reconciliation is now installed per app, and this demo has no computed nodes, so its build carries neither the reconcile helper nor the installer. Measured 63,074 local macOS across 78 chunks; the wall keeps 16 B for gzip run variance (CI Linux has measured at or below local on every prior entry). This repays 1,300 of the 1,450 B PR #23 charged; the ~150 B left is the call-site residue inside the graph itself.
// 63,090 -> 63,109 (2026-08-18): CI (Linux) actual for the per-app reconcile plane; local macOS measured 63,074. Wall tracks CI actuals.
// 63,109 -> 63,112 (interim 2026-08-18, de-minimis gzip variance): local macOS measured 63,110 on main da8ce0a0 with no member-tag code in this demo's build; +3 B run variance, no cost class.
// 63,112 -> 63,812 (re-anchor 2026-08-18, instance identity for composed children): +696, measured 63,808 by this test across 78 chunks (same chunk count as before). All of it is code, not payload: the served ids only gain their `c<n>:` prefix characters, which gzip absorbs. The code is the composition seam qualifying a composed child's cells/computed/dependencies and every graphNodeId-bearing view record with the child's instance path, plus the loader wrapper that answers a composed symbol's reads and writes on that instance's nodes. It cannot move to build time: composition runs on the child render module's runtime output, and one child module serves every edge that composes it, so per-edge qualified emission would mean one specialized copy of the child module per parent edge. What did move to build time is the classifier (packages/compiler/src/passes/protocol-state.ts), which is why the two fixture walls did not move. The wall keeps ~4 B for gzip run variance. Repayment owed by the bundler-diet goal.
// 63,812 -> 64,001 (re-anchor 2026-08-19, attribute presence, owner-accepted): +185, measured 63,997; dynamic attributes emit name+value from the slot so falsy values render no attribute; mostly compiler emission (name no longer duplicated in statics). Repayment owed by bundler-diet.
// 64,001 -> 64,012 (interim 2026-08-19, instance-path grammar + route ordering): +9 measured 64,010 (route construction reads compiler-emitted per-edge paths, longest-prefix-first); projected-child p<n>: segments cost 0 (measured with nesting disabled). Repayment owed by bundler-diet.
// 64,012 -> 64,420 (re-anchor 2026-08-19, widget-scoped shared()): +404, measured 64,416; composition registers widget roots and qualifies widget-scoped shared ids (rides the composing-page paths; non-composing fixture walls unmoved at 18,479/18,378). Covered by the owner identity-bytes ruling (compile-time impossible: widget roots are a cross-module composition fact). Repayment owed by bundler-diet.
// 64,420 -> 64,514 (re-anchor 2026-08-20, projection-after-seed): +92 measured 64,508; the seed-threading channel in the shared prerender chunk (seedChild slot call, slot module, values merge, renderer projection call + chunk context, child recursion — 246 raw chars). The seed-pass logic itself is pay-per-use (installMarklessSharedSeedPass emitted only into render-data modules whose compiler planned a shared-seed symbol; forcing the gate off fails exactly the 2 CSR witnesses). Removing the channel needs a module-global seed map, unsafe under concurrent server renders. Owner identity-bytes ruling; repayment owed by bundler-diet. Follow-up: make this budget path-independent (worktree builds embed the absolute path and read +6).
// 64,514 -> 64,516 (de-minimis 2026-08-20): +1 gzip run-variance byte measured on the untouched branch (64,515 with all T038 work stashed); proportionality order auto-interim.
// 64,516 -> 64,645 (re-anchor 2026-08-20, U-G production error containment, owner-accepted "compiler when it makes sense, runtime last resort" - this is the last-resort case): +129 measured 64,645 root / 64,641 worktree (4 B gzip run variance); the catch-and-report at the outermost delegated-listener boundary, so a rejection that never reached dispatch reporting (e.g. failed runtime chunk load) surfaces instead of vanishing. Cannot move to build time: it contains runtime failures by nature. Cheapest of six measured variants (from +323); fixture walls unmoved. Repayment owed by bundler-diet.
// 64,645 -> 64,681 (interim 2026-08-21, de-minimis auto-interim per proportionality order 2026-08-04): +36 measured, attributed by revert-measurement wholly to the two prerender-evaluator decision call sites that close a pre-existing CSR gap (prop-decided arms in composed children silently took the else arm; expression child props threw PRERENDER_PROP_UNDERIVABLE) - now answered by the compiled residue reader. Recursive self-composition itself measured byte-neutral. Repayment owed by bundler-diet.
const MAX_SHIPPED_JS_GZIP_BYTES = 64_681;

test('music-player-ssr production build stays within its shipped JS budget', async () => {
	await rm(resolve(demo, '.output'), { force: true, recursive: true });
	// Consumer posture: the wall measures the 'never' build even though the
	// demo's default build keeps the lab instrument (owner rulings 2026-07-12).
	await execPnpm(['--dir', demo, 'build'], { MARKLESS_CONSUMER_BUILD: '1' });

	const sizes = JSON.parse(
		await readFile(resolve(clientBuild, 'execution-sizes.json'), 'utf8'),
	) as Record<string, { readonly chunk?: string; readonly instrument?: true }>;
	const chunkNames = [
		...new Set(
			Object.values(sizes)
				.map((entry) => entry.chunk)
				.filter(isString),
		),
	].sort();
	const compressedChunks = await Promise.all(
		chunkNames.map(async (fileName) =>
			gzipSync(await readFile(resolve(clientBuild, fileName)), { level: 9 }),
		),
	);
	const gzipBytes = compressedChunks.reduce((total, chunk) => total + chunk.length, 0);

	expect(chunkNames.length, 'production build must emit client JS chunks').toBeGreaterThan(0);
	expect(
		Object.values(sizes).filter((entry) => entry.instrument),
		'production build must keep execution instrumentation stripped',
	).toEqual([]);
	expect(
		gzipBytes,
		`production shipped JS: ${gzipBytes} gzip bytes across ${chunkNames.length} distinct chunks`,
	).toBeLessThanOrEqual(MAX_SHIPPED_JS_GZIP_BYTES);
}, 120_000);

async function execPnpm(args: string[], env: Record<string, string> = {}): Promise<void> {
	try {
		await exec('pnpm', args, { cwd: root, env: { ...process.env, ...env } });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}

function isString(value: string | undefined): value is string {
	return value !== undefined;
}
