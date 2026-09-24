# Markless performance goal: agent handoff

Prepared September 22, 2026 for an incoming Claude Opus/Fable agent, with Codex available as an independent verifier or browser operator where configured. This handoff is model-independent; it does not assume a particular model, CLI flag, or computer-use tool is available.

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/compiler.md

## Read this first

The owner wants Markless to become usable sooner and respond faster than leading frameworks, with few requests and fine-grained lazy initialization. Packing is a means, not the goal. We have useful improvements, an updated Vercel docs preview, and extensive measurements. We have not established consistently better first-use performance than Qwik, globally minimal execution, or a completed performance goal.

The latest requested deliverable is a public, runnable benchmark of the same application in **Markless, Octane, React Router, Remix 3, SolidStart v2, Qwik v2, Svelte 5, and Ripple**. Octane replaces standalone React. React Router remains included. This benchmark is planned, not implemented or deployed.

Read in this order:

1. [GOAL.md](GOAL.md): current outcome, constraints, measurement requirements, and working acceptance targets.
2. This handoff: retained implementation, evidence, rejected experiments, and verification priorities.
3. [BENCHMARK-DEMO.md](BENCHMARK-DEMO.md): public benchmark design, framework identity/version checks, and Vercel plan.
4. [ROUTE-MODULE-REUSE.md](ROUTE-MODULE-REUSE.md) and [LIVE-QWIK-COMPARISON.md](LIVE-QWIK-COMPARISON.md): latest accepted optimization and deployed comparison.
5. Relevant focused reports below. [IMPLEMENTATION.md](IMPLEMENTATION.md) is the long chronological ledger, not a uniformly current plan.

Historical reports contain superseded preview ports, temporary failures subsequently fixed, and candidates later rejected or combined. Current source establishes what is retained; each measurement applies only to its recorded build. Do not carry a historical status sentence forward without checking its later follow-up.

## Working tree, authority, and goal status

- Repository: `/Users/jacksm5pro/dev/open-source/markless`.
- Observed HEAD: `d5107ae06c7b608f374706885e9a530a330a46e7`, `chore: checkpoint framework and docs work before packed delivery`.
- That owner-approved checkpoint preserved substantial earlier work. The packing/performance implementation described here is still in the working tree, including numerous untracked production files, tests, and this experiment directory. There has been no subsequent commit or push in this goal work.
- Do not reset to the checkpoint, discard untracked files, or assume every working-tree change belongs to this task. Inspect status and preserve unrelated work. Ordinary `git diff` does not include untracked file contents.
- The host goal tracker was last observed **paused**, with an obsolete objective pointing at `/Users/jacksm5pro/.codex/attachments/865e3830-a32d-47c8-a925-46dbaa08eb53/pasted-text-1.txt`. That attachment proposes blocking IIFE scripts and a synchronous registry. The owner explicitly rejected that approach afterward. **Do not implement the attachment instead of GOAL.md.**
- Documentation changes did not resume, replace, or close the host goal. A new execution run should explicitly use the current charter and accurately report the host state.
- Local investigation/fixes and the requested docs preview deployment were authorized. The old checkpoint hook bypass is not reusable permission. Shared-branch pushes, package publication, production promotion, and goal closure require their own applicable owner directive. No secrets belong in reports.

Repo rules are generated from `.ruler/`; edit their sources rather than generated AGENTS.md files. Read the base implementation guidance and applicable compiler/bundler/performance overlays before changes. Every write package must name allowed files, workflow guidance, and verification commands including `pnpm run typecheck`. A consuming-app change must pass that application's checks. Structural completeness claims about JS/TS require a guessless receipt; a text search supports only the sites actually checked.

## What has changed since the checkpoint

This is a mechanism-level inventory supported by the current files inspected and the goal's reports. It is not a claim that every dirty line belongs to this goal or an exhaustive symbol-reference audit.

### 1. Native ESM module packing and lazy facades

Main files under `packages/bundler/src/`:

- `build/native-packing.ts`, `build/route-pack-groups.ts`, `build/lazy-module-facades.ts`.
- Integration in `rolldown.ts`, `vite/index.ts`, `types.ts`, compiler/virtual-module wiring, and build cleanup helpers.
- Symbol validation/accounting in `build/symbol-table.ts`, `build/execution-log-hooks.ts`, and `execution-log.ts`.

The planner groups emitted modules by route ownership, following static/dynamic imports and related source artifacts. Shared ownership enters a conservative shared pack. This is not yet an interaction-semantic pack partitioner.

Native ESM and `modulepreload` remain. `strictExecutionOrder: true` preserves Rolldown lazy module bodies. Supported tiny facades are replaced with lazy namespace getters that preserve live exports, namespace identity, and initialization-error behavior. Hashing/source-map integration was hardened after an early post-hash prototype; verify the actual output contracts before further edits. Unsupported shapes and top-level-await/cross-pack cases must retain correct native behavior.

The retained combined optimization also turns supported imports back into the executing pack into deferred calls to its existing initializer. It does not eagerly initialize unrelated wrappers. Keep `minifyInternalExports: false`: the attempted alternative broke generated symbol-table export-name resolution on the real docs.

Compiler symbol resolvers can emit literal lazy imports. URL compaction and namespace handling must preserve logical symbol identity. Same-chunk symbol validation uses the exact source module's rendered exports where appropriate; cross-chunk/serialized symbol routes still require valid public exports.

The actual website configuration enables `experimentalNativePacking: true`; `website/vite.native-packs.config.ts` delegates to the normal docs config. The inspected docs build emits 63 client JS files across the site, while tested routes request five framework files. Build-file count, per-route request count, source coverage, and execution cost are different measurements.

Tests to inspect include `native-packing.test.ts`, `route-pack-groups.test.ts`, `lazy-module-facades.test.ts`, `lazy-module-output.test.ts`, `symbol-table-integrity.test.ts`, `execution-log-symbols.test.ts`, and compiler `literal-symbol-imports.test.ts`.

### 2. Preload planning, intent navigation, and deterministic publication

Main paths: router `src/vite/route-preload-data.ts`, `link-intent.ts`, `entries/client-entry.ts`, `runtime/create-server-entry.ts`, `index.ts`, `virtual-modules.d.ts`; bundler `build/bundle-graph.ts`, `source-module.ts`, `plugin-state.ts`, and transform hooks.

- Current-route preloads remain eager; destination-route preloads use link intent. The docs set `router({ linkPreloading: 'intent' })`. Delegation survives client-side route replacement.
- Preload traversal handles cycles and avoids pulling foreign route-owned destinations into the current route. Acyclic graph reduction remains; cyclic graphs preserve static dependencies rather than rejecting valid ESM.
- Preload encoding sorts route keys while preserving each route's URL order and duplicates.
- Provisional symbol code can resolve during linking but cannot be loaded as finalized output. A sibling first pass cannot overwrite finalized code/accounting; finalized render-data publication remains independent of claiming an interaction route.

Evidence: [STABLE-PUBLICATION.md](STABLE-PUBLICATION.md), [INLINE-AND-CYCLES.md](INLINE-AND-CYCLES.md). Three recorded docs builds had identical client hashes; that is not proof of universal determinism.

### 3. Early input, propagation, and overlay wake correctness

Main paths: web `src/inline/early-events.ts`, `src/inline/resumer.ts`, `src/render-to-string.ts`, `src/resume-events.ts`; queued MDX resume emission in router `src/vite/mdx.ts`.

- A small document-level capture path retains native events that arrive while HTML is streaming before the ordinary resumer is installed. It avoids shifting the resumed container's DOM indexes and starts no module fetch of its own.
- Async handoff preserves the native stop-propagation decision; relying on the later value of `cancelBubble` was incorrect.
- Scalar dispatch validates the authored ancestor event path before invoking anything. Unsupported required ancestors receive an untouched full-runtime fallback rather than a partially executed event.
- The window overlay primer checks for a shown overlay before an unrelated header press or Escape wakes the runtime.
- Inline lookup simplification recovered the existing 1,090-byte gzip budget: a recorded output was 1,089 bytes. Comment/source-length reductions are not executable-byte savings.

Tests: `early-stream-events.test.ts`, `inline-propagation.test.ts`, `overlay-primer.test.ts`, `pointer-primed-inline-resumer.test.ts`, plus actual Nitro-hosted native propagation fixtures. Early replay cannot retroactively prevent a browser default action that already occurred. Custom resumer/prerender paths must not be assumed covered by ordinary inline-event tests.

### 4. Compiler-proven scalar MDX interactions

Main paths: compiler `passes/runtime-demand-map.ts`; bundler `scalar-plan-loader.ts`, `scalar-plan-source.ts`, `virtual-ids.ts`, source/transform wiring; router `src/vite/runtime/mdx-scalar.ts`, `mdx.ts`, and `mdx-route.ts`.

The existing compiler action plans now support eligible plain-SSR scalar actions, including trailing text preservation. MDX requests metadata through an explicit source variant; ordinary consumers omit unused scalar-plan exports. Nested metadata and handler loads use the same requested variant.

The small path validates the served event, cell, text updates, and locators, invokes the actual handler, commits live state, and updates the proven text targets without constructing the page graph. Unsupported shapes, storage/computed dependencies, additional updates, missing targets, shown overlays, and streamed patches retain general resume. Later full resume must adopt live scalar values.

Pointer/focus priming and native keyboard activation preserve this smaller path where eligible. Ancestor handlers, stopped events, sibling controls, shared scalar values, and retries have focused and browser regressions.

Evidence: [SCALAR-DISPATCH.md](SCALAR-DISPATCH.md), [SCALAR-METADATA.md](SCALAR-METADATA.md), [SCALAR-PROPAGATION.md](SCALAR-PROPAGATION.md), [OVERLAY-PRIMER.md](OVERLAY-PRIMER.md). The original counter reduction was 48 to 15 initializers; a subsequent dependency change reduced it to 13. Initializer counts are not CPU milliseconds or proof of minimality.

### 5. Smaller runtime work and dependencies

- MDX static prose/render-data construction is deferred to its render-data loader rather than performed merely to resume an event.
- Web containment checks use the native DOM `contains()` path, retaining structural-host fallback, instead of thousands of recursive JS descendant checks. See `resume-events.ts`, `resume-locators.ts`, `fns/instance-scope.ts`, and [INTERACTION-COST.md](INTERACTION-COST.md).
- Runtime `graph-computed.ts` skips dependency inspection for records without a compute function. The larger subscription-index experiment was rejected; only the smaller eligibility guard remains.
- Arm qualifier registration slots share the existing lightweight `resume-handle-qualifier.ts`; callback types live in `resume-types.ts`, with compatibility re-exports from `resume-arm-records.ts`. This avoids pulling arm materialization/error dependencies into a scalar handler. See [ARM-QUALIFIER.md](ARM-QUALIFIER.md). Its 15-to-13 initializer improvement did not demonstrate a latency win.

### 6. Accepted symbol/route module reuse

Two distinct retained improvements must not be confused:

1. **Combined loader change:** generated MDX component loaders share an import promise between scalar-plan and symbol lookups, together with deferred same-pack initializer calls in the facade transform. These remove successive layers on the same loading path. Individually they did not clear the timing threshold; together they improved throttled accordion interactions. See [COMBINED-DEMAND.md](COMBINED-DEMAND.md).
2. **Latest route reuse:** `packages/router/src/vite/entries/resume-entry.ts` keeps import promises by route-loader identity in a WeakMap. Generated MDX resume code in `mdx.ts` also reuses its full-resume import promise after the scalar attempt. Failed imports release the promise for retry. Each event still uses its current root/state; handler errors do not invalidate successfully loaded code. See [ROUTE-MODULE-REUSE.md](ROUTE-MODULE-REUSE.md).

The latest route change materially removes repeat-click scheduling waits. It does not establish a first-click win or change semantic pack placement. Tests include `resume-entry.test.ts`, `mdx-resume-demand.test.ts`, and `mdx-module-demand.test.ts`.

### 7. Compiler dependency correctness for future selective activation

Main paths: compiler `artifacts.ts`, `compile-module.ts`, `pass-registry.ts`, `passes/capture-analysis.ts`, and `passes/trigger-groups.ts`.

Trigger groups consume capture analysis and follow bound/forwarded callbacks, including hidden state written without a read. `ExtractedCaptureSymbol.graphWrites` preserves imported handler writes through composition. Local writes are qualified by instance; page-shared identities remain shared. Tests cover alternate names/shapes, input versus click, sibling instances, callbacks, and write-only state.

These are correctness prerequisites, not the finished semantic packing/activation implementation. Recorded real accordion compiler output still had no usable trigger groups for the proposed selective MDX activation. The linked compiler graph and rendered callback/physical-state identities must be reconciled before enabling it.

Evidence: [RESUME-OWNERSHIP.md](RESUME-OWNERSHIP.md), [LINKED-COMPILER-WRITES.md](LINKED-COMPILER-WRITES.md), [RENDERED-CALLBACKS.md](RENDERED-CALLBACKS.md). Rendered callback evidence resolved an earlier unknown-cell refusal, but did not prove the complete dependency boundary.

### 8. Staged runtime recovery and live-state handoff

Main path: web `src/fns/prerender-trigger-resume.ts`, with related runtime types/row forwarding and focused tests.

Staged activations serialize per container, share duplicate pending requests, release rejected activation promises, dispose failed startup, remove failed graph/registration segments, and restore prior computed ownership. Live scalar values remain current across later groups; unactivated values remain available. The caller's render-data surface is forwarded to staged runtime construction.

These changes are retained, but **the docs MDX route still uses its general fallback**. The staged fixes did not alter the recorded docs client JS or establish a new speedup. Row activation still prepares render data eagerly; the forwarding test does not prove zero row preparation before a write.

The type `Omit<ResumePayloadScriptsInput, 'stateScript' | 'viewScript'>` does not mean state/view records disappeared. The staged path accepts decoded records. The current MDX fallback still reads serialized scripts; compiler-known structure does not replace dynamic SSR state values.

Evidence: [STAGED-RECOVERY.md](STAGED-RECOVERY.md), `prerender-trigger-recovery.test.ts`, and the keyed-repeat component-row tests.

### 9. Build tooling and build-time work

- Workspace/fixture/template manifests moved to Vite Plus 0.3.1 and its bundled Vite alias, with a shared Vitest version. The old Vite Plus engine embedded Rolldown 1.2.5 despite a separate 1.2.7 installation and emitted invalid SSR namespace exports in a Nitro rebundle. The newer engine fixed the recorded reproduction. See [SSR-TOOLCHAIN.md](SSR-TOOLCHAIN.md).
- Fixture scripts use `vp`; the alias is not a standalone `vite` binary. Preserve lockfile/override coherence rather than updating only one manifest.
- Root `vite.config.ts` enables eager declaration loading only for the router; a package-build plus declaration-consumer regression pins the repair. The previous 19 missing declaration exports were fixed, and root package build subsequently passed. The old SSR report's declaration failure is historical.
- Twoslash tooling reuses parsed imported type documents with bounded inactive retention, while preserving isolated fence globals. Router import scans cache with code/filename invalidation. Packed output edits/name scans avoid repeated whole-pack copying. Emitted-JS scans use Rolldown's parser; authored TSRX retains its existing parser boundary.
- The website's typecheck delegates to its Markless-aware checker. Experiment result copies are excluded from ordinary test discovery.

Recorded full build medians, excluding separate SEO generation: ordinary docs 27.38 to 23.22 seconds; then-experimental packed docs 60.56 to 28.23 seconds. These are historical paired measurements, not a promise about today's full build. See [BUILD-TIMES.md](BUILD-TIMES.md).

### 10. Specifications and goal documents

Working-tree changes also exist in `specs/framework/06-runtime-resumer.md` and `10-render-architecture.md`. Verify their current wording against the accepted nonblocking ESM implementation using the spec-maintenance skill before editing or declaring reconciliation complete.

GOAL.md now makes usable-interaction performance primary. Its 20% first-use median improvement is a working target introduced while rewriting the plan, not an achieved result or an owner-supplied numeric requirement. BENCHMARK-DEMO.md expands comparison beyond Qwik. The new benchmark has no implementation or deployment yet.

## Results worth retaining

### Earlier same-app packing comparison

Actual Nitro builds, fresh Chrome contexts, HTTP cache disabled, SW blocked, local HTTP/2, identical Brotli, ten visits per route/condition. Constrained means 150 ms RTT, 5 Mbps down, 1 Mbps up, and 4× CPU. Times are trusted click to expected DOM mutation.

| Constrained control | Unpacked | Packed | Framework requests |
| --- | ---: | ---: | ---: |
| Counter | 68.3 ms | 68.8 ms | 286 to 5 |
| Computed total | 72.6 ms | 70.2 ms | 278 to 5 |
| Mode selector | 1,500.8 ms | 77.8 ms | 370 to 5 |
| Accordion | 4,913.1 ms | 182.4 ms | 582 to 5 |

[PACKING-ONLY.md](PACKING-ONLY.md) is the controlled packing-option comparison. It predates later runtime improvements and does not measure earliest possible input or prove universal packing superiority. Do not substitute the older mixed-change COMPARISON report for this isolation.

### Accepted combined loaders and latest route reuse

The combined loader experiment's 4× CPU-only accordion first-click median fell 196.15 to 151.80 ms; second/third fell 39.85/39.30 to 24.30/25.95 ms. Normal-CPU changes did not clear the threshold. This is an older immutable pair, separate from the latest route reuse.

The route-reuse pair passed 160 visits and 680 clicks. Normal CPU sidebar second/third fell 14.40/13.60 to 0.70/0.60 ms; counter 13.00/13.30 to 0.20/0.15 ms; accordion third 17.15 to 2.45 ms. First-click differences did not clear the threshold. Compressed JS grew 102–104 bytes per tested route; framework requests stayed five. Separate coverage retained zero external framework execution before input, counter first/independent/repeat initializer counts of 13/3/0, and accordion first/repeat counts of 117/0.

### Latest deployed Qwik comparison

[LIVE-QWIK-COMPARISON.md](LIVE-QWIK-COMPARISON.md) and its JSON are the authoritative saved result. Chrome 153.0.8010.53, fresh contexts, browser HTTP cache disabled, each site's normal SW behavior allowed and observed. The sites/controls differ, so this is not equivalent-app framework proof.

| Sidebar measurement | Markless | Qwik |
| --- | ---: | ---: |
| Earliest click, normal | 58.10 ms | 191.30 ms |
| Earliest click, constrained | 3,488.10 ms | 5,567.30 ms |
| First after downloads, normal CPU | 42.85 ms | 20.60 ms |
| First after downloads, 4× CPU | 85.35 ms | 36.20 ms |
| Third click, normal CPU | 0.60 ms | 0.20 ms |
| Main-document framework JS requests | 5 | 306 |
| Encoded framework body bytes | 280,104 | approximately 1,047,000 |

Repeat differences between frameworks did not clear the noise threshold. Both had multi-second early waits in the constrained profile. Qwik's standalone counter was faster under throttling than the counter embedded in Markless's full docs page; do not conceal the workload difference or the result.

Primary visits passed 79/80: Markless 40/40, Qwik 39/40. A Qwik-only follow-up reproduced one early counter timeout in ten visits, giving two observed timeouts in fifteen constrained Qwik counter visits. A second click recovered; cause was not established. These are not production failure rates or a diagnosed Qwik bug. An early incorrect commentary claim of 80/80 was corrected; never repeat it.

Qwik framework JS in the settled visits was not served from disk cache or a SW. The observed SW response was a Partytown analytics sandbox document. Qwik docs logged an `Identifier 't' has already been declared` error while its sidebar still worked; attribution is unknown. Analytics aborts must not be presented as framework failures.

## Rejected or diagnostic work: do not accidentally ship it

| Experiment | Outcome / instruction |
| --- | --- |
| Blocking IIFE/registry before controls | Owner rejected. `superseded-blocking-prototype.patch` is historical. No hidden/delayed controls or parser-blocking packs. |
| Subscription index | Rejected: timing did not clear noise and bytes regressed. Keep the smaller no-compute guard. See GRAPH-DEMAND.md. |
| Computed subscription identity deduplication | Rejected: fewer refreshes did not prove faster interactions. See COMPUTED-DEMAND.md. |
| MDX component import reuse alone / same-pack deferred calls alone | Individually inconclusive; later retained together in COMBINED-DEMAND.md. Do not revert the combination based on standalone reports. |
| Separate client MDX entry; separate arm registration leaf | Rejected intermediate designs. Current lightweight qualifier-slot layout is retained. |
| Internal export minification | Rejected by actual docs symbol-route validation. No valid candidate timing. Do not disable validation to make it pass. |
| Suppressing speculative keyboard/focus symbol initialization | Private diagnostic removed a few initializers but no meaningful latency. Not retained. See INTENT-EXECUTION.md. |
| Empty Vite preload-helper bypass | Private diagnostic changed error/scheduling semantics without useful timing improvement. Not shippable. |
| Lazy dispatch row-scope split | Correctness candidate worsened total download/startup budgets; rejected. See DEMAND-FOLLOWUP.md. |
| Early scalar eligibility / known priming-record forwarding | Early attempt missed the real priming path; later correct mechanism still did not clear timing noise. Reverted. See KNOWN-PRIMING.md. |
| MDX/accordion payload filtering | Diagnostic only; deliberately disables other controls and lacks the complete dependency proof. Do not promote the filter to production. |

The accordion's original-HTML/fewer-decoded-records diagnostic reduced 4× CPU first input from 146.10 to 118.65 ms. This supports investigating narrower activation, not claiming it is implemented. A different experiment with smaller HTML exposed controls earlier and made constrained click latency worse. Faster paint can expose a download race; measure both navigation-to-response and input-to-response. See [ACCORDION-RESUME-SCOPE.md](ACCORDION-RESUME-SCOPE.md).

## What is unresolved

1. **First-use work after preloads:** latest Markless docs sidebar is slower than Qwik's after downloads. Profile the current accepted build before another optimization. Prior traces identify payload decoding, DOM census, widget scope/registration, import scheduling, and compilation as candidates, not a complete cost attribution.
2. **Selective MDX activation:** compiler write/callback metadata and staged recovery are prerequisites only. Resolve linked/rendered dependency ownership, widget-shared physical cells, aliases, element handles, ancestor dispatch, scalar/full/staged state sharing, retries, disposal, and navigation before integration.
3. **Semantic pack placement:** current route/shared grouping is broad. Lazy module initialization does not remove the need to fetch/parse/link a containing ESM file and its static dependencies. Choose size/dependency boundaries by measured latency; five files is not a hard requirement.
4. **Byte-budget failures:** six fixture/negative-budget tests remain recorded red. Last accepted measurements include largest runtime chunk 5,676 gzip bytes versus limits 5,403/5,435; music-player CSR download 140,854 versus 140,187 and startup 14,927 versus 14,696; SSR download 84,855 versus 84,771 and navigation 25,702 versus 25,502. Reproduce current values rather than copying them as fresh results. Checkpoint reproduction exists, but later changes also affected bytes; do not dismiss the current failures as wholly unrelated. Do not raise limits to finish.
5. **Benchmark implementation:** none of the newly requested matched framework applications, public results site, or cross-framework runner has been built yet.
6. **Completion evidence:** the whole goal is not green. Passing root types, narrow suites, docs, or deployment does not erase open tests or establish state-of-the-art performance.

## What the next agent should verify

### First: preserve and identify the current build

Inspect HEAD, tracked changes, untracked files, and active processes. Save an immutable output/source manifest before building over an existing `.output`. Do not assume a port mentioned in a report is still serving that build. Avoid changing a user-owned preview while evaluating a candidate; use a separate port/output.

The Apple system Git currently encounters an unaccepted Xcode license. Homebrew Git works with `/opt/homebrew/bin` first on PATH. Do not change the machine's license/security settings as a workaround. Browser tests may need permission to open local ports; sandbox-denial and EMFILE failures are infrastructure failures until rerun successfully, not passing tests. Docs tests have historically printed a nonfatal Vite shutdown warning after passing; record the exit code.

Useful initial checks, run from the repo root:

```sh
export PATH=/opt/homebrew/bin:$PATH
git status --short
git log -5 --oneline
git diff --stat d5107ae0
pnpm run typecheck
pnpm --dir website run typecheck
pnpm --dir website test --run
```

Then run checks appropriate to the retained source and next change. Do not run builds/tests concurrently with performance measurements:

```sh
pnpm exec vp test --run packages/compiler/test packages/bundler/test packages/router/test packages/runtime/test packages/web/test
pnpm run build
pnpm --dir website run doctor
pnpm exec vp test --run packages/bundler/test/fixture-builds.test.ts packages/bundler/test/music-player-csr-budget.test.ts packages/bundler/test/music-player-ssr-budget.test.ts
```

These are verification commands for the receiving agent, not claims they were freshly rerun for this documentation handoff. Root `pnpm test` also includes the JSFB guard, type-service completion checks, and Witness boxes; inspect its current script and run the required broader gates before declaring the overall goal done. Honor consuming-app tests rather than only framework unit tests.

### Browser correctness checklist

- Counter first/repeat, then an independent control, then return to the original: state remains live and unrelated controls are not discarded.
- Scalar to complex/full resume, and eventually staged/full transitions: no reset, duplicate subscriptions, or stale shared state.
- Keyboard activation, focus, bubbling ancestors, stopped propagation, rapid queued clicks, closed menu/header behavior, and outside/Escape dismissal.
- SPA navigation, history, newly mounted rows/controls, disposal, and offline interactions after readiness.
- A deliberately delayed required pack with visible controls retains input; failed delivery is observable and retry behavior matches the runtime contract.
- Module namespace/live bindings, initialization failures, cycles, top-level await, symbol-table mappings, hashes/source maps, and navigation preload URLs remain correct.

Use actual trusted browser clicks/keys and visible result assertions. A dispatched synthetic event or a successful HTTP response alone is not proof of working interaction. Inspect the actual main-frame network and JS bodies, not only `<link>` tags or total files emitted by a build.

## Reproduction and deployment references

Latest saved docs candidate, confirmed present while writing this handoff:

```text
/private/tmp/markless-route-reuse-before/output
/private/tmp/markless-route-reuse-final/output
```

These are temporary local outputs and can disappear. Preserve their build identities/results before cleanup. Existing reports and companion JSON live in this directory; detailed raw copies often live under ignored `results/` or `/private/tmp`. Verify availability before relying on them.

Correctness and separate coverage examples:

```sh
DOCS_COLD_OUTPUT=/private/tmp/markless-route-reuse-final/output node scripts/experiments/packed-delivery/navigation-probe.mjs
DOCS_COLD_OUTPUT=/private/tmp/markless-route-reuse-final/output DOCS_EXECUTION_SAMPLES=3 node scripts/experiments/packed-delivery/execution-probe.mjs
```

The paired route-reuse harness starts its own isolated servers and records output hashes:

```sh
node scripts/experiments/packed-delivery/route-module-reuse.mjs /private/tmp/markless-route-reuse-before/output /private/tmp/markless-route-reuse-final/output /private/tmp/markless-route-reuse-recheck.json
```

For new attribution, `execution-probe.mjs` supports `DOCS_TIMELINE=1`, `DOCS_TIMELINE_CPU=1`, `DOCS_EXECUTION_CASES=accordion`, `DOCS_EXECUTION_SAMPLES=3`, and `DOCS_CPU_RATE=4`; `timeline-cpu.mjs` analyzes the recorded input windows. Read [INPUT-CPU.md](INPUT-CPU.md) first. Automation compilation, unassigned samples, overlapping inclusive timings, and instrumented elapsed time must not be charged blindly to framework code. Never run instrumentation during a publishable latency series.

Latest docs preview:

- URL: https://markless-docs-j1c0voi9l-jack-shelton.vercel.app/markless/
- Deployment: `dpl_3Nu7gWRVgrzJGZ8sXpVzs7f9ZQCH`; project `jack-shelton/markless-docs`.
- Built in `website` with `NITRO_PRESET=vercel pnpm run build`, then deployed using `vercel deploy --prebuilt --yes`. Vercel reported READY; no production alias promotion was performed.
- The 63 client files matched the saved candidate hashes. A browser additionally compared the five downloaded framework bodies with uploaded files and verified a working counter.
- Preview protection may require the existing CLI login and a fresh authorized cookie. The local cookie jar is `/private/tmp/markless-import-reuse-vercel-cookies.txt`; it contains secrets. **Do not print, copy into this document, commit, or publish its contents.** Refresh through the authorized Vercel CLI if expired.

Live probes use `MARKLESS_PREVIEW_ORIGIN`, `PREVIEW_COOKIE_JAR`, and `COMPARISON_OUTPUT`. Example, only after verifying the cookie file and preview:

```sh
MARKLESS_PREVIEW_ORIGIN=https://markless-docs-j1c0voi9l-jack-shelton.vercel.app PREVIEW_COOKIE_JAR=/private/tmp/markless-import-reuse-vercel-cookies.txt COMPARISON_OUTPUT=/private/tmp/markless-qwik-sidebar-recheck.json node scripts/experiments/packed-delivery/live-qwik-sidebar.mjs
```

`live-qwik-early.mjs` accepts the same three variables, plus optional `COMPARISON_SITES`, `COMPARISON_KINDS`, `COMPARISON_PROFILES`, and `COMPARISON_SAMPLES`. Read the scripts before using different sites: selectors and Qwik URLs are fixed to the recorded comparison. Do not mistake these probes for the forthcoming equivalent-app runner.

The old reported `chunk-DOTqkIfD.js` 404 was consistent with an open document pointing at an obsolete build. Fresh documents requested the current hashes successfully. Start with a fresh document and verify HTML/build identity; do not purge caches or attribute every module-fetch failure to packing without new evidence.

## Upcoming experiment and public demo

The owner wants a benchmark that answers which architecture is faster across representative applications, not a comparison of two unrelated documentation sites. BENCHMARK-DEMO.md specifies a shared dashboard with overview/navigation, searchable keyed records/dialog editing, and forms/async details.

Implementation order:

1. Fix behavior/correctness expectations, input schedules, result schema, version/configuration pins, and a minimal deployment check for each named framework.
2. Build the workload and external browser runner with Markless and Qwik first. This is an initial milestone; the other named frameworks are required deliverables.
3. Complete equivalent idiomatic implementations, run the same behavior checks, and deploy each independently to Vercel. Host one public results site with links, code/build IDs, dated results, raw downloads, and clear configuration labels.
4. Optimize Markless based on attributed costs, rerun paired builds, and keep evidence of losses as well as wins. Publish only claims the tested workload/rendering modes support.

Important distinctions:

- Octane is `octanejs/octane`, not Ember Octane. Ripple is `Ripple-TS/ripple`, not legacy ripplejs.
- React Router still brings its normal React dependencies; only the standalone React entry was removed.
- Remix 3 uses its own runtime; do not substitute Remix 2 or React Router.
- SolidStart v2 and Solid 2 are different version axes. Verify the actual runtime requested rather than silently changing the entry. Svelte 5 uses SvelteKit for the routed SSR comparison.
- Adapter/version feasibility checks remain for the new demo. Primary documentation links and current limitations are in BENCHMARK-DEMO.md; re-check versions at implementation time.
- Show SSR/CSR/prerender modes separately. Do not penalize an unsupported capability by assigning it a fake latency, and do not hand-author an SSR shell to make a missing implementation appear supported.
- One top-level browser context at a time; no competing iframes. Same data, visible workload, browser/device/network profiles, and reasonable production optimization opportunities.
- A cold browser is not a cold Vercel function/CDN. Record server/cache/transport behavior, distinguish controlled warm-origin and cold-start observations, and retain a controlled-host comparison.

GOAL.md introduces larger sample counts for final cross-framework results: 30 visits per exploratory cell and 50 for final tail comparisons, with alternating order and variance reporting. Older ten-sample results remain valid historical evidence but do not satisfy that new final-publication standard. Do not silently rewrite their protocols or call their maximum a robust population p95.

## Using Codex as verifier or computer-use operator

Keep one agent responsible for choosing work and editing production code. Give Codex a bounded, independent verification assignment with the exact source/build identity, selected files, expected behavior, commands, and output location. The verifier should inspect the actual diff/results and actively look for unsupported claims, omitted failures, and regressions; it should not merely repeat the writer's conclusion.

Suggested verifier assignment:

```text
Read scripts/experiments/packed-delivery/HANDOFF.md, GOAL.md, and the report for this candidate.
Role: independent verifier; no production source edits, commits, pushes, or deployments.
Workflow guidance: .ruler/skills/markless-implementation/implementation.md,
.ruler/skills/markless-implementation/performance.md, plus the candidate's declared overlays.
Verify the supplied immutable build identities and scoped diff against the stated hypothesis.
Run pnpm run typecheck and the explicitly supplied affected tests/application checks.
For browser work, use trusted input, assert the intended visible result, and record main-frame
network, pending downloads, failures, and cache state. Keep correctness, profiling, and timing
runs separate. Do not start competing timed work or rebuild the candidate during measurement.
Return: pass/fail/inconclusive, exact commands and exit codes, inspected build/source identities,
measured results and uncertainty, unresolved failures, and the evidence that could falsify the claim.
Put optional logs/results only in the assigned result directory. Escalate needed code changes to
the owning agent rather than editing outside your scope.
```

For manual computer use, open the actual current preview, click real controls as early as feasible, confirm state/focus behavior, inspect network/errors, and capture a short observation record. For repeated latency measurements use the automated harness; manual clicks alone cannot rank submillisecond performance. Discover the tools/CLI capabilities actually available in that session rather than assuming model-specific flags or bypassing permission controls.

If writer and verifier share a machine, serialize heavy builds, browser timing, coverage, and profiling. A background verifier running tests invalidates an otherwise quiet timing comparison. Include `Workflow guidance:` and `pnpm run typecheck` in any subsequent write packet, even one producing only experiment artifacts.

## Suggested first instruction for the incoming agent

```text
Continue the Markless performance work from scripts/experiments/packed-delivery/HANDOFF.md.
Use GOAL.md as the current objective; the old blocking-script attachment is superseded.
First verify the working-tree/build identity, accepted loader optimizations, and remaining
type/test/byte-budget failures. Preserve unrelated and untracked work. Then establish the
matched framework demo and measurements in BENCHMARK-DEMO.md, beginning with the shared
behavior contract and Markless/Qwik runner, while validating the other requested entries.
Use Codex for independent verification and browser work where available. Select production
optimizations from current profiles, retain only measured improvements, and report losses.
Keep native ESM/modulepreload and lazy initialization; do not gate controls or require five files.
Do not claim the broader performance goal complete without the agreed evidence and owner directive.
```

This handoff records prior evidence and current inspected source; it is not a new full-suite or performance run. Documentation verification for this handoff is recorded in the delivering response. Existing unresolved tests and the paused host goal remain unresolved by writing this file.
