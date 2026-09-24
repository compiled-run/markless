# Interaction-demand follow-up

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/performance.md.

Two follow-ups were rejected. The accepted combined loader optimization and the port-3020 preview remain unchanged. This investigation narrows the next action; it does not complete the broader goal or establish exact minimum execution.

## Empty preload helper

The emitted Vite helper still dispatches cancelable `vite:preloadError` events when its dependency list is empty. An isolated copy of the measured docs output bypassed that branch, directly invoking its callback. This deliberately removes error-notification and scheduling semantics; it is a diagnostic ceiling experiment, not a shippable implementation. The source SHA-256 and unique replacement were checked before changing the copy. Production sources and preview files were not edited.

Eighty fresh Chrome visits and 240 trusted interactions compare accepted output GSbudh against the copy W1N7Vp. Four controls, ten visits per build, 4× CPU, no artificial network latency, fresh contexts, HTTP cache disabled, service workers blocked, identical Brotli quality 5 HTML/JS over local HTTP/1.1. Before and after run in separate groups without overlapping owned builds or profiling. The measurement is click to expected DOM mutation, not paint.

| Control | First median, before → bypass | Second median | Third median |
| --- | ---: | ---: | ---: |
| Counter | 44.30 → 47.80 ms | 10.20 → 10.45 ms | 11.00 → 10.95 ms |
| Computed total | 78.75 → 79.40 ms | 11.30 → 11.45 ms | 12.15 → 12.25 ms |
| Documentation menu | 85.60 → 84.60 ms | 13.20 → 13.65 ms | 12.05 → 12.70 ms |
| Accordion | 141.25 → 141.65 ms | 22.10 → 22.75 ms | 24.20 → 23.95 ms |

No difference clears the unchanged max(10 ms, 10% before median, twice the larger MAD) threshold. Five framework requests and three site scripts remain per visit, with zero HTTP cache hits, failed actions, failed requests or pending scripts at measured input. Removing these empty helper calls is not supported as the next latency optimization. It is not safe to infer a large cost from their invocation count.

## Dispatch row scope

`dispatchViewEvent` prepares row/widget scope before knowing whether a symbol uses it. Only bound symbols consume its scoped context. A candidate kept symbol classification in dispatch using the serializer's instance-path parser and loaded the existing scope adapter only for bound handlers, including a bound callback reached through an ordinary handler.

Three ordinary-handler/callback regressions fail before the change because they scan shared definitions unnecessarily. The candidate passes those plus alternate row graph/handle reads and error reporting: six focused tests. Root/docs typechecks, 64 docs tests and docs doctor/build pass. Both previously failing fixture chunk ceilings also pass.

The consuming applications expose the tradeoff:

| Stage | Accepted gzip bytes | Candidate gzip bytes | Existing limit |
| --- | ---: | ---: | ---: |
| Music player CSR download | 140,854 | 141,243 | 140,187 |
| Music player CSR startup | 14,927 | 15,559 | 14,696 |
| Music player SSR download | 84,855 | 85,273 | 84,771 |
| Music player SSR navigation | 25,702 | 25,708 | 25,502 |

The split reduces one chunk by moving work into another but worsens total transfer and CSR startup. It is rejected before a browser timing comparison. The broader web/runtime candidate run has 802 passes and two failures: one source-layout assertion expecting the old eager import, and a system Git/Xcode license failure. These were not silently counted as passes or rewritten to rescue the candidate. No bundle limit was raised.

The exact dispatch patch, helper and regression tests remain in `row-demand-events-rejected.patch`, `row-demand-helper-rejected.ts.txt` and `row-demand-test-rejected.ts.txt`. Its built docs are retained separately under `/private/tmp/markless-docs-row-demand-5GPzJP/.output`. They are not the accepted preview.

## Restored state

The experiment's dispatch change is reverted from its pre-edit snapshot, and its new production/test files are removed. Existing unrelated work and the accepted combined loader changes are preserved. Root `pnpm run typecheck`, 798 web/runtime tests with Homebrew Git first on PATH, and docs doctor/build pass. The restored docs match GSbudh across 63 client JavaScript filenames and SHA-256 hashes, totaling 19,274,342 bytes.

Rebuilt fixture/music-player checks reproduce the same six earlier size/negative-budget failures and their original measurements. They remain open. No new commit, push, preview replacement or goal closure occurred. Detailed samples, hashes, rejected-build paths and restoration receipts are in DEMAND-FOLLOWUP.json; logs and raw result copies are under ignored `results/demand-followup-2026-09-22/`.

One inspected next candidate addresses the earlier scalar-eligibility failure at its caller: the inline `prime` path already has a host/event table but forwards only the element, so the scalar attempt re-reads payloads to rediscover the event record. Passing a known matching record could let unsupported scalar plans decline before that decoding. It must preserve unknown/minted controls, focus and pointer priming, propagation, and scalar-to-full-runtime handoff. This is an untested candidate; neither the caller nor scalar code was changed in this follow-up.
