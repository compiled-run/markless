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
// 64,681 -> 64,896 (re-anchor 2026-08-21, per-iteration widget instance identity, T067b): +215, measured 64,896 across 78 chunks; baseline re-measured by reverting the whole change set (passes at 64,681). Covered by the owner identity-bytes ruling, same compile-time-impossible cost class as the +404 widget-scope re-anchor: a keyed `@for` row's key is a RUNTIME value, so the instance-path grammar gains a third segment kind (`r:<key>:`) that no compile-time literal can carry. The bytes are the row segment riding the shared prerender/composition chunk — minting it per row, threading the row key through the render walker and into projections, and stripping it back off at the loader boundary so routes and symbol tables still match the compile-time path they were emitted with. Pay-per-use was not expressible here: the row segment is minted inside the shared render walker and composition seam that every composing page already loads, and gating it per page would mean a specialized copy of that walker. Repayment owed by bundler-diet.
// 64,896 -> 64,911 (interim 2026-08-22, de-minimis auto-interim per proportionality order 2026-08-04, T071 projection widget resolution): +15 measured 64,911 across 78 chunks, attributed by revert-measurement: +12 to the prerender renderer/evaluator carrying the seed map across a COMPOSED edge (it already crossed a projection; the SSR render context already carried it, so this is the CSR side catching up), +3 to the seed pass reading a composed child's declared children-projection path. Composition cost class. No payload growth: the declared path is a compile-time marker on the composing module, so a page that composes no family root emits none and pays only the two runtime call sites. Repayment owed by bundler-diet.
// 64,911 -> 64,980 (re-anchor 2026-08-22, component-tag spread forwarding, T072): +69 measured 64,980 across 78 chunks; baseline re-measured by reverting only the three web call sites (passes at 64,911 with the compiler half of the change set still in), so every byte is runtime and none is payload. Composition cost class: `{...rest}` written on a CHILD COMPONENT tag now crosses the edge as one prop binding, and the child-prop loop that both the prerender evaluator and the seed pass run has to merge it - which is a runtime merge over the props object the parent was handed, not a name the compiler can write out (the contents are the consumer's, and one child module serves every edge that composes it). The compiler half costs this demo nothing: a page with no component-tag spread emits no spread prop and no `marklessSsrSpreadProps` call. Repayment owed by bundler-diet.
// 64,980 -> 65,162 (re-anchor 2026-08-22, sibling widget resolution + row scoping, T074): +189 over a baseline re-measured at 64,973 on this tree by reverting the whole change set; 78 chunks, unchanged. Attributed by revert-measurement: +3 for the spread hygiene (the `__markless` reserved-prefix filter in the two spread-attribute renderers, which stopped `__marklessSsrCallbacks="[object Object]"` reaching the DOM), and +186 for the composition seam. Composition cost class, and compile-time impossible for the same reason the +404 widget-scope re-anchor was: a part written into a composing component renders BESIDE the widget root that component composed, not inside it, so the part's own instance path never reaches that root. The registry that answers "which rendered widget holds this id" therefore turns from a set of roots into a map that also carries the projection sites composition registered them under, and an already-composed widget id has to take the instance path again when it is composed a second time (that is what gives each keyed row a widget of its own). The declared chain the registration reads is compile-time data on the composing module, and the CSR walk that reads it stayed pay-per-use: it rides the shared-seed pass, so a page with no widget seeds loads neither (forcing that gate off was measured at 65,635, so the slot placement is worth 473 B). The payload grows only on pages that compose a widget root: `projectionIds` is emitted only for a widget definition whose composing child declared the chain, and this demo has none. Repayment owed by bundler-diet.
// 65,162 -> 65,210 (interim 2026-08-23, T075d callback-slot escape): +48 measured at the root
// checkout; T075d claimed slot-free modules emit nothing, but part of the escape emission rides
// unconditionally - attribution to the exact site owed by the T075f recovery item, which should
// gate it and walk this number back. Composition cost class; repayment owed by bundler-diet.
// 65,210 held (T075f, 2026-08-22). The wall constant does not move: this tree measures 65,193
// across 78 chunks, under it either way. Two facts were revert-measured in one worktree, so both
// numbers are comparable to each other rather than to the root checkout (a worktree build embeds
// its longer absolute path and reads a few bytes high, per the 64,514 entry's follow-up note).
//   - T075f itself costs +9: baseline 65,184 with the whole change set reverted, 65,193 with it
//     applied, 78 chunks both ways. All of it is the containment on the invoke path in
//     resume-events.ts (a symbol reached through a callback slot runs in a body no caller awaits,
//     so its failure is reported instead of escaping as an unhandled rejection). Runtime cost
//     class by nature, the same "last resort" case the +129 U-G containment entry was.
//   - The T075d +48 was NOT recovered, and the site named in the recovery charter is not where it
//     is. The two candidates were checked: the invoke branch in the emitted symbol-resolver module
//     is already gated (`routesCallbackSlots`, from the bound rows), and the protocol-state cell
//     machinery is gated on `semanticGraph.sharedCallbackBindings`, which this demo has none of -
//     it emits neither cell nor graphNodeIds entry. What is left rides the shared composition and
//     seed chunk every composing page loads: the two identity fields on the scoped graph
//     (`marklessPageGraph`, `marklessInstancePath` in fns/instance-scope.ts) and the callback
//     branch in `edgeChildProps` (fns/shared-seed.ts). Both are inside one shared module, so
//     making them pay-per-use means splitting that chunk, not adding a gate - bundler-diet's
//     shape, not this task's. Floor documented rather than claimed recovered.
// 65,210 -> 65,441 (re-anchor 2026-08-22, T075g composed-seed return leg): +237 over a baseline
// re-measured on this worktree at 65,204 by reverting the whole change set; 78 chunks either way.
// Attributed by revert-measurement wholly to packages/web/src (with only the compiler and
// serializer halves applied the build passes the old wall), so none of it is payload: the new
// record is emitted only for a component that seeds a shared node from its own props, and this
// demo has none. Composition cost class. The bytes are three runtime seams: the compose-side
// remap that moves each declared prop read onto the parent's node and drops the reads the parent
// never passed live, the subscription that wires those routes on resume, and the read adapter that
// lets a re-run seed symbol reach the value the enclosing instance now holds instead of the props
// its component was rendered with once. Compile-time impossible for the same reason the +404
// widget-scope and +189 sibling re-anchors were: which node a composed child's prop reads is the
// CONSUMER's fact, and one child module serves every edge that composes it. Two trims were
// measured and kept (65,501 -> 65,458 -> 65,441): collapsing the dependency rewrite onto the
// existing remap result, and dropping a per-node freshness check seeds cannot use anyway (one node
// carries a seed per property, which its id cannot tell apart). Repayment owed by bundler-diet.
// 65,441 -> 65,444 (re-anchor 2026-08-22, main merge at 8f9db739): +3 measured on the merge
// commit itself, before the T075h seed-phase change (which added 0 on top). The merge brought
// main's yuku-tsrx 0.1.2 adapter dissolution into the compiler; emission-side churn of that
// size is codegen noise, not a new payload class. De-minimis interim per the proportionality
// order; repayment stays with bundler-diet.
// 65,444 -> 65,452 (re-anchor 2026-08-22, U112/U116 merge window): +8 across two candidate
// classes, not individually revert-measured (de-minimis): compiled modules now publish real
// ES named exports per served component (plain-ESM consumers link — the sr-gallery gate), and
// handler symbol modules carry same-file module-scope declarations they name. Both are
// consumer-capability payload, not waste. Repayment stays with bundler-diet.
// MEASUREMENT LANDMINE, found by U157: this wall's number is a NODE_ENV=test build, because vitest
// sets NODE_ENV=test and the build below inherits it. The same `pnpm --dir <demo> build` run from a
// plain shell reads 143 B LOWER (65,833 against this entry's 65,976) - confirmed by re-running the
// CLI build with NODE_ENV=test and getting the test's number exactly. Measure this wall through the
// test, or export NODE_ENV=test, or you will under-read it by ~143 B. The two fixture walls in
// fixture-builds.test.ts have no such offset (measured identical both ways).
// 65,452 -> 65,995 (re-anchor 2026-08-23, U157 attribution of the row/widget layer stack): growth
// of +553 since the 65,452 anchor commit (76d4a492), measured at 65,976 across 78 chunks - 78 at
// every step, so no chunk appeared or split. The old constant was sound: that commit measures
// 65,280 by CLI here, i.e. 65,423 in this wall's own NODE_ENV=test terms, leaving the 29 B margin
// its de-minimis entry intended. U116, named as a candidate when this attribution was commissioned,
// is therefore already paid for by that entry and is not part of what follows. Attribution below is
// by building the tree at each merge along the first-parent chain, then confirmed by
// revert-measurement on the tip; the two methods agree to within 3 B of gzip run variance.
//   +103  U124-U137, the compiler block (template-literal interpolations visible to the symbol
//         import scan, bare `undefined` as a value not a read source, branch arms and dynamic hosts
//         forwarding the loop row, rest-spreads excluding destructured props, method calls keeping
//         their receiver, the symbol-module read-back audit, row-scoping walking branch arms).
//         Compiler EMISSION inside this demo's own modules, not shipped library: the two
//         non-composing fixture walls moved -1 and 0 across the same span.
//   +29   U140, the disposed-container guard (a dispatch arriving after its container is torn down
//         is ignored instead of throwing). Runtime by nature - it is a teardown race, and nothing
//         at build time knows when a container dies.
//   +421  U139+U143+U150, the instance-scope row/widget stack: layer 4 (bound symbols carry the row
//         segment, so a per-row write lands on its own row), layer 5 (widget-root resolution
//         follows the dispatched row), layer 6 (bound-symbol widget ids resolve through the root
//         registry). Revert-measured as ONE set on the tip, both ways: reverting all three returns
//         the CLI build to 65,412, exactly the pre-layer-4 chain build, and the test's own build to
//         65,558, i.e. +418 against this entry's 65,976. The 3 B between the two is gzip run
//         variance. They cannot be split by revert because layers 5 and 6 edit layer 4's own code in
//         fns/instance-scope.ts; the per-layer shares come from the CLI chain builds instead (+256
//         layer 4, +97 layer 5, +68 layer 6 together with U153, which the shares above use so they
//         sum to the +553 total). Compile-time impossible for the reason the +215 T067b entry gave:
//         a keyed row's key is a RUNTIME value, while a bound symbol's id is minted per component
//         EDGE and carries build-time branch/repeat scope only. Only the record that matched the
//         dispatch knows which row it was, so the graph has to be re-spelled against that record.
//   +0    U138, U142, U145, U147, U149, U151, U153 and every @markless/ui family added in this
//         window. Measured, not assumed: with the three layers reverted, the tip build reads the
//         pre-layer-4 number exactly. U147 (shared runtime exports) costs this demo nothing, as its
//         packet predicted - those exports are consumer capability this demo never links.
// Margin is 19 B for gzip run variance, on a local macOS worktree measurement; per this wall's
// convention the next CI (Linux) actual re-anchors on top. Readings of 65,800 / 65,863 / 65,912
// were reported from the root checkout while this window was still landing - all three are below
// 65,976 and consistent with it, being earlier points on the same climb.
// Repayment owed by bundler-diet - and the fixture walls carry the priced version of that debt: the
// same three layers cost a row-free, widget-free app 1,087 B, all of it retained capability code it
// never runs. That is the trim to take, and it is measured, not estimated.
// 65,995 -> 66,085 (bridge 2026-08-23): +85 from the four merges landed after the
// attribution unit measured (claimed-root callback binding, unary lift on component
// edges, layer-7 keep-path, per-edge claim prep) — same capability cost classes the
// attribution priced; measured 66,080 on this tip, 5 B margin. Repayment: bundler-diet
// owns the measured 1,087 B pay-per-use ceiling from the attribution entry above.
// 66,085 -> 66,510 (bridge 2026-08-23): +423 across the correctness merges since the
// last bridge — the component-scoping stack (U176/U178/U180/U181, emitted scoping
// carried into lowered reads) and the per-render widget registries (U179, ~54-70 B
// of concurrency-safety plumbing so renderToString is safe under concurrent
// requests). Measured 66,508 on this tip. Repayment: bundler-diet still owns the
// measured 1,087 B pay-per-use ceiling, now plus a chartered server-only-module
// extraction for the registry plumbing.
// 66,510 -> 67,330 (2026-08-23): +794 across the handle/dispatch capability chain
// (handle value-reads + trigger-group handle records, per-instance keying, anchor
// attribute lowering, bubble walk defect 67 at +215). Measured 67,304.
// 67,330 -> 67,360 (2026-08-23, same day): measured 67,343 on the real checkout
// after the demand-gated overlay landed (worker's worktree measured 67,330 flat);
// +13 = the non-bubbling dispatch fix's share here plus gzip run variance.
// 67,360 -> 67,940 (2026-08-23): measured 67,926. +566 = per-graph widget registries
// (defect 72 incl. emitted-resolver graph pass) + served-open enlist handoff + plural
// element-handle machinery with the live row-walk read (+320 of it). Bundler-diet owns
// the repayment alongside the standing pay-per-use obligations.
// 67,940 -> 68,200 (2026-08-24): measured 68,187 - the multi-binding chain. Bundler-diet repayment.
// 68,200 -> 68,380 (2026-08-24): +164 measured - keyed-repeat records now emitted for
// widget-rooting repeats (previously dropped entirely = the defect-84 wire gap).
// Clawback named for bundler-diet: rowElementCount + rowEvents pay-per-use (dead
// weight on widget-rooted records; rowElementCount has no resume consumer).
// 68,380 -> 68,440 (2026-08-24): measured 68,434 - rowStartOffset consumption in
// resume-keyed-repeats (defect 84 half 1: rows addressed past static siblings +
// tail-anchor re-insert). The record field itself is absent at zero, so the cost
// is resume-module code, not payload; joins the bundler-diet clawback above.
// 68,440 -> 69,100 (2026-08-24): measured 69,083 - the @empty arm client mint
// (defect 84 half 2a): mint/removal logic + a LOCAL census-splice copy (the
// leanness guard forbids importing resume-locators here). This demo has no
// @empty arm, so the whole +643 is dead weight here - clawback named for
// bundler-diet: demand-gate the mint (load only when a repeat record carries
// emptyArm) and lift the splice into a shared leaf module (resume-census.ts)
// both resume-locators and resume-keyed-repeats import.
const MAX_SHIPPED_JS_GZIP_BYTES = 69_100;

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
