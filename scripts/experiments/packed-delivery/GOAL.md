# Faster usable interactions

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/compiler.md

Incoming agents should read [HANDOFF.md](HANDOFF.md) for the retained code changes, evidence, rejected experiments, verification steps, and continuation instructions.

## Purpose

Make Markless controls usable sooner and make first and subsequent interactions faster than a comparably optimized Qwik implementation, while retaining low request counts, nonblocking rendering, and lazy module initialization.

The owner extended the comparison to a public, runnable cross-framework demo and benchmark on Vercel. The named set is Markless, Octane, React Router, Remix 3, SolidStart v2, Qwik v2, Svelte 5, and Ripple. Octane replaces the previously suggested standalone React entry. [BENCHMARK-DEMO.md](BENCHMARK-DEMO.md) defines this deliverable and its comparison rules.

The owner asked for actually better time to interactivity and state-of-the-art performance. Five files, a successful preload, or a smaller network waterfall is not completion. Packing is a technique to retain, change, or partially undo according to measured user-visible results.

This is the current working charter, revised September 22, 2026. It supersedes conflicting objectives in the original blocking-script attachment and historical notes in IMPLEMENTATION.md. The host goal tracker was observed paused; editing this charter does not resume or replace that host goal.

## What must improve

- From navigation: elapsed time until an early trusted input produces the correct visible response. Attempt input as soon as the control is visibly hittable; do not wait for preloads.
- During loading: input-to-visible-response latency while required downloads remain pending.
- After downloads: first-use input-to-visible-response latency, including module evaluation, runtime activation, state restoration, and DOM work.
- Later use: repeated actions, the first use of a different control, and client navigation remain fast and correct.

Record navigation-to-response and input-to-response separately so delayed painting cannot manufacture a win. Record first contentful paint and largest contentful paint as rendering checks. A DOM mutation is a useful diagnostic, but final user-visible claims need presentation evidence or a clearly labeled presentation estimate. Do not relabel existing click-to-mutation measurements as a formal TTI score.

## Evidence required for completion

Use two complementary checks: the actual Markless docs and the equivalent public benchmark application implemented in the named frameworks. The existing public docs comparison remains a real-site check; it cannot establish framework superiority because the applications differ. Keep the current JS Framework Benchmark guard as a complementary update-throughput check; the new application benchmark measures loading, first activation, and navigation as well.

Before implementation, fix the benchmark versions, behaviors, transport, compression, preload policy, and reasonable Qwik bundling configuration. Include disclosures/navigation, forms with derived/shared state, and dynamic lists/dialogs. Include normal and constrained network/CPU conditions, cold visits without warm-cache reuse, immediate input, and first input after loading. Test at least Chromium and WebKit for the final claim; record browser versions.

Publish individual cases, failures, median, p95, and variance. Use at least 30 fresh visits per comparison cell for exploratory acceptance and 50 for final tail-latency comparisons, alternate build order, and run profiling separately from timing. Preserve raw measurements and immutable build identities. Missing responses are failures, never successful samples removed without accounting.

The working performance target is at least a 20% median reduction against both the current Markless build and the comparably optimized Qwik build for each of the during-download and after-download first-use categories. Predeclare aggregation over the matched workloads; require the gain to exceed measured noise, show the individual results, and reject meaningful regressions in a workload, p95, rendering, or repeat interactions. Already-fast cases can be equivalent rather than forced into meaningless submillisecond wins. State-of-the-art is an outcome to demonstrate against the named comparison set, not a universal claim or a guarantee of zero delay.

The Qwik target is an optimization milestone, not sufficient evidence for a leading-framework claim. Compare the best eligible implementation in each workload/rendering category, disclose Markless losses, and leave the performance outcome incomplete where it misses the acceptance criteria. Finishing and publishing an honest benchmark does not require Markless to win; completing the performance goal requires the stated improvements. Framework versions, prerelease status, rendering modes, and supported capabilities must appear beside results.

Keep request counts low, but do not impose exactly five packs. Record compressed and decoded bytes, initial requests, requests added by each action, first-use CPU, and startup execution. Before retaining a candidate, set workload-specific byte/request/CPU limits from the recorded current build and justify any changed limit with actual latency results; do not hide excess bytes behind a smaller file count.

Correctness, root `pnpm run typecheck`, relevant framework tests, and the consuming application's typechecks/tests/production build must pass. Preserve keyboard/focus behavior, rapid and queued inputs, shared state across controls, navigation/disposal, live exports, cycles, and delivery failure/retry behavior. The six recorded fixture-budget failures remain unresolved gates, not permission to raise their limits. An explicit owner directive is required to close the goal.

## Constraints

- Native ESM and nonblocking modulepreload; no parser-blocking packs or delayed/hidden controls to improve scores.
- No Markless service worker, warm-cache dependency, hydration, VDOM, or eager application initialization to move click costs before measurement.
- Preserve fine-grained initialization; prove any narrower activation includes the state/effect dependencies needed by later interactions.
- Use compiler analysis only where it can establish the required dependencies; handle uncertainty conservatively and report the cost.
- Preserve unrelated work. No shared-branch push, package publication, or goal closure is implied.

## Current evidence and next work

PACKING-ONLY.md shows useful same-app packing wins in an earlier build. ROUTE-MODULE-REUSE.md establishes improved repeated interactions. LIVE-QWIK-COMPARISON.md shows that current Markless first-use behavior is not consistently faster than Qwik. None satisfies the full outcome above.

Next establish the shared demo behavior and runner, validate the named frameworks' actual versions and deployment adapters, and profile the latest docs first-use path after downloads finish. Attribute import scheduling/evaluation, payload decoding, DOM discovery, activation, dispatch, and presentation before choosing a production change. Evaluate smaller activation scopes and dependency-based pack partitioning against that evidence. Do not repeat rejected micro-optimizations without new evidence.

Implementation requires a bounded task naming its allowed files, workflow guidance, hypothesis, correctness oracle, performance limits, and verify commands including `pnpm run typecheck`. Until the acceptance measurements pass, the performance goal remains incomplete.
