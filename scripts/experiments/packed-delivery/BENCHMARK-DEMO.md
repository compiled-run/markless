# Public framework interaction benchmark

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md

## Owner direction and deliverable

Compare Markless with Octane, React Router, Remix 3, SolidStart v2, Qwik v2, Svelte 5, and Ripple using equivalent applications. Octane replaces standalone React; React Router remains included. Make this a public Markless demo/benchmark, hosted on Vercel, with reproducible measurements and source. This note adds the deliverable to GOAL.md; no implementation or new deployment exists yet.

The public benchmark is useful even where Markless loses. It must not suppress a framework, operation, failure, or slower result to satisfy the separate optimization goal. It complements the existing JS Framework Benchmark guard, which does not cover the complete server-rendered loading and interaction experience.

## Shared application

Use one small dashboard with three routes and a common behavior contract:

- Overview: static content, nested sidebar disclosures, tabs, a filter, and multiple independent interactive panels. Exercise the first interaction with each panel and rapid repeated actions.
- Records: a deterministic keyed list with search, sorting, selection, editing in a dialog, and shared summary state. Fix visible row counts and interaction order; do not compare a virtualized list against an unvirtualized one in the same case.
- Settings/details: a form with validation and derived values, a deterministic asynchronous response, pending/error UI, and navigation with history restoration. Keep local state updates separate from server round trips in the results.

Share fixtures, data generation, assets, styling intent, and expected outcomes. Each framework implements its own rendering, reactivity, events, and routing using supported idioms. Do not share an imperative DOM implementation that bypasses the frameworks. Match visible layout, content, behavior, and accessibility semantics; allow framework-owned markers and serialization to differ and count their bytes.

## Entrants and versions

| Entry | Planned implementation | Required validation before benchmarking |
| --- | --- | --- |
| Markless | Existing router and native modulepreload; packed/unpacked variants for diagnosis | Pin working-tree/build identity and preserve current correctness tests. |
| Octane | Octane's Vite application integration | Use octanejs/octane, pin its compiler/runtime and Vercel adapter versions. |
| React Router | Framework mode with its normal React dependencies | Pin router, React, compiler configuration, and deployment integration; there is no separate React-only entry. |
| Remix 3 | Remix 3's own UI/runtime and server model | Pin the current release candidate or release actually tested; do not substitute Remix 2 or React Router. Verify server and asset delivery on Vercel. |
| SolidStart v2 | The requested SolidStart v2 integration | Pin its actual Solid runtime and router. SolidStart v2 and Solid 2 are different version axes; do not silently substitute a Solid 2 start-mode implementation. |
| Qwik v2 | Qwik v2 and its router | Pin versions and production preloading/bundling choices; include reasonable optimized grouping. |
| Svelte 5 | Svelte 5 with SvelteKit for the routed SSR application | Pin both packages and the Vercel adapter. |
| Ripple | Ripple-TS/ripple with supported SSR/hydration and routing integration | Verify the current app/server and Vercel integration; do not use the unrelated legacy ripplejs project. |

Use the same behavior contract, with separately labeled SSR, prerendered, or CSR configurations. Do not silently replace unsupported SSR with a static hand-authored HTML shell or treat unsupported functionality as a slow timing. Record unsupported cases and adapter blockers explicitly. Prefer recommended production configurations and permit documented, ordinary application optimizations equally across entries. Record default and tuned variants when a tuning choice materially affects the comparison; no framework-specific benchmark-detection paths.

## Public site and automated measurement

The landing page provides a framework/version selector, direct demo links, per-operation charts/tables, dated results, source/build IDs, protocol, and downloadable raw records. The compare-and-contrast view explains rendering, activation, delivery, and measured tradeoffs with links to the implementation. It must show uncertainty and failures, not a single unexplained winner score.

Run one implementation at a time in an isolated top-level browser context. Do not derive official scores from competing live iframes, a busy comparison page, or a visitor's uncalibrated machine. The public demo is for exploration; official results come from the reproducible external runner visiting the actual production URLs and equivalent controlled-host builds.

Use the GOAL.md sampling and correctness protocol. Measure navigation to the first correct visible response, earliest-input latency during downloads, first-use latency after downloads settle, independent-control activation, rapid repeats, and navigation. Report rendering timings, CPU/long tasks, compressed and decoded JS/HTML bytes, requests, and delivery failures. Keep DOM mutation, presentation estimates, and browser-observed presentation timings distinguishable.

Retain failures and report their counts beside successful latency distributions. Record scripted interaction durations rather than labeling a short lab sequence as field INP. No code-size or coverage-byte proxy may be called executed CPU time.

## Vercel delivery and fairness

Deploy each framework's build independently and link the immutable deployments from one results site. This prevents one build from pulling other framework runtimes into an entry. Configure equivalent regions, resource classes, data, and response policies where adapters permit it; show unavoidable differences. Verify production response bodies match recorded build identities and that benchmark URLs do not land on deployment-protection screens.

A cold browser is not a cold CDN or cold function. Disable browser-cache reuse for the primary cold runs, record the actual response cache/protocol/compression evidence, and publish controlled warm-origin runs separately from cold-start observations. Do not claim to force a cold server instance without evidence. Keep TTFB/server effects visible rather than attributing them to client activation. Run the same behavior locally or on a controlled host as well, so Vercel deployment differences do not become universal framework claims.

Use each framework's normal compatible production toolchain. Within the Markless repository follow its Vite/Rolldown guidance; isolate competing framework applications so their required dependencies and transforms cannot alter Markless's workspace toolchain. Do not route those applications through the Markless compiler.

## Delivery sequence and verification

1. Freeze the behavior contract, comparison configurations, correctness assertions, and result schema. Pin versions and validate a small production deployment for each named entry before assuming adapter support.
2. Build the shared workload and external runner with Markless and Qwik, establishing that both pass the same behavior checks. This is a first milestone, not permission to omit other named frameworks.
3. Complete the other implementations, review equivalence and idiomatic usage, deploy them, and run the full recorded comparison. Keep implementation review open to upstream maintainers without sending unsolicited messages.
4. Publish the runnable demos and honest results; use the measurements to select and verify Markless optimizations. Keep earlier immutable results available when publishing a newer run.

Before each write package, declare exact allowed files and verification commands including `pnpm run typecheck`. Require the package's build/typechecks, shared browser correctness suite, deployment smoke checks, and the uninstrumented measurement protocol appropriate to the change. The current change is documentation only: root typecheck and document inspection verify it, and no behavior test is added for prose.

## Primary references inspected September 22, 2026

- [Octane source and Vercel adapter](https://github.com/octanejs/octane): documents the Vite integration and `@octanejs/adapter-vercel`; actual deployment still needs verification.
- [Octane SSR](https://github.com/octanejs/octane/blob/main/docs/ssr.md): streaming/hydration and production build output.
- [Remix 3 release candidate](https://remix.run/blog/remix-3-release-candidate) and [current quickstart](https://guides.remix.run/start-here/): distinct runtime and asset model; older Remix deployment guidance is not proof of Remix 3 support.
- [SolidStart v2 overview](https://docs.solidjs.com/solid-start/v2): identifies Solid v1 and Vite v8+ as its foundations; do not equate this with Solid 2.
- [Qwik v2 migration](https://next.qwik.dev/docs/upgrade/) and [Vercel adapter](https://next.qwik.dev/docs/deployments/vercel-edge/): validate actual supported versions before pinning.
- [SvelteKit Vercel adapter](https://svelte.dev/docs/kit/adapter-vercel): routed Svelte 5 deployment surface.
- [Ripple source](https://github.com/Ripple-TS/ripple): current SSR/hydration capabilities; Vercel app integration remains to be proven.
- [Vercel CDN behavior](https://vercel.com/docs/how-vercel-cdn-works) and [cache controls](https://vercel.com/docs/caching/cdn-cache): browser-cache state does not identify CDN or function state.

React Router deployment/version selection and the unresolved Remix 3/Ripple adapter checks are implementation prerequisites. These references establish planning inputs, not measured cross-framework results.
