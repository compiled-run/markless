# Scalar interaction propagation

The MDX scalar path now validates the matching authored event path before invoking handlers, then executes eligible handlers from the child outward. An unsupported required ancestor hands the untouched event to full resume. Unrelated sibling handlers stay dormant. Repeats and two handlers sharing one scalar retain the latest value.

A real Chrome test caught a second defect: native dispatch clears `cancelBubble` before a lazy handler receives the event. The inline handoff now preserves its stop decision. Both the MDX scalar dispatcher and its full-runtime fallback consume it. Native stopped clicks leave the parent unchanged across three repetitions in each tested path.

A small packed build also exposed a verifier false rejection. Rolldown can retain a symbol in a local namespace inside the same pack without publicly exporting that symbol. Direct routes now accept the exact symbol module's `renderedExports` metadata when the source and symbol occupy the same chunk. Cross-chunk and serialized-table routes still require public exports. Positive and negative fixtures pin that distinction.

Preview: http://localhost:3000/markless/concepts/state. Immutable output: `/private/tmp/markless-docs-scalar-path-final-1Bv7ML/.output`, server session 9132. Existing tabs need a reload after the build switch. Fresh isolated Chrome page 14 confirms two trusted clicks produce count 2 without starting the full runtime. Five framework scripts and three site scripts return 200; there are no error-console messages and no service worker controller. The old `chunk-DOTqkIfD.js` reference belonged to an earlier build.

## Measured docs behavior

The final production Nitro output passes 18 cold coverage visits / 57 control actions plus three unrelated header presses. Before input and on the unrelated header, measured framework pack execution is zero. Module initializer counts remain:

| Action | First action | Additional initialization on repeats |
| --- | ---: | ---: |
| Counter | 15 | 0 |
| Independent second scalar control | 3 additional | 0 |
| Computed total | 56 | 0 |
| Mode selector | 72 | 1 on second, 0 on third |
| Accordion | 117 | 0 |

Coverage counts executed source ranges and initializer bodies, not CPU time. These unchanged counts do not establish that complex interactions execute only their minimum required code.

Six docs scenarios pass: unrelated header/closed menu; scalar state handed to complex controls; keyboard and rapid queued clicks; navigation/history/offline controls; delayed packs; observable failed packs. The separate generated fixture passes five native-browser scenarios with five client requests each: two differently shaped bubbling parents, a stopped scalar child, a complex ancestor, and a stopped complex child. Its working host uses the production Vite SSR entry and emitted client files, as explained below.

## Latency comparison

Forty fresh Chrome visits / 120 actions, ten visits per build and condition. Previous verified preview ran first, then the candidate. Both use CDP HTTP cache disabled, service workers blocked, streamed HTML and JS Brotli quality 5 over local HTTP/1.1. Constrained visits use 150 ms latency, 5 Mbps download and 4× CPU slowdown. Chrome 153.0.8010.53 on the developer laptop, with other applications open. No owned build, test, or profiler overlapped these measurements. Timing ends at the expected DOM mutation, not compositor paint.

| Condition | First click, previous → candidate | Second | Third |
| --- | ---: | ---: | ---: |
| Normal | 32.50 → 32.80 ms | 14.95 → 14.75 ms | 15.00 → 15.05 ms |
| Constrained | 76.35 → 70.45 ms | 11.35 → 9.95 ms | 11.20 → 10.70 ms |

No difference clears max(10 ms, 10% of the previous median, twice the larger MAD). The constrained first-click threshold is 10.60 ms. There is no demonstrated latency improvement or regression.

Both builds make five framework requests, with no HTTP cache hits, failed actions or page errors. Constrained first clicks still had a pending script in 9/10 previous and 10/10 candidate visits. This preserves modulepreload and visible controls; it does not eliminate the early network race. First-visit framework encoded transfer is 234,975 → 235,009 bytes, +34 bytes including response overhead.

## Verification and remaining failures

Root `pnpm run typecheck`, 895 shared framework tests, 29 focused scalar tests, 64 docs tests, docs Markless-aware typecheck and actual docs doctor/production build pass. The focused cases first failed for skipped ancestors, lost stop decisions and incorrectly required public exports. The docs test process still prints its existing shutdown warning, then exits successfully.

Four application byte-budget tests remain red; their five over-limit stages now measure:

| Stage | Previous | Current | Limit |
| --- | ---: | ---: | ---: |
| CSR download | 140,827 | 140,841 | 140,187 |
| CSR startup | 14,916 | 14,931 | 14,696 |
| SSR download | 84,882 | 84,909 | 84,771 |
| SSR startup | 4,327 | 4,328 | 4,327 |
| SSR navigation | 25,717 | 25,720 | 25,502 |

No ceilings changed. The SSR startup measurement is one byte over its previous passing boundary. These failures block calling the larger change complete.

The small generated app's default final Nitro rebundle emits an undefined `ssr_exports` export and returns 500. Its preceding production Vite SSR entry renders 200. Isolating its node_modules directory did not fix the error; an attempted server splitting override did not fix it either. The retained probe defaults to the failing Nitro host. `SCALAR_PATH_DIRECT_SSR=1` runs the browser behavior checks against the working production SSR entry. This is an explicit test-host limitation, not a passing default Nitro fixture or an established upstream diagnosis. The real docs application uses its normal Nitro output and passes.

Complex-control minimum execution, remaining byte budgets, the generated-app rebundle failure, and exact per-module execution-byte accounting remain open. No new commit, push or goal closure occurred. [SCALAR-PROPAGATION.json](./SCALAR-PROPAGATION.json) lists the raw evidence, with copies under ignored `results/scalar-propagation-2026-09-22/`.
