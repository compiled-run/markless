# Accordion resume scope

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md.

Preparing fewer records improves the real docs accordion's first interaction. With the original HTML retained, a private diagnostic reduces the 4× CPU first-click median from 146.10 to 118.65 ms. This supports implementing narrower resume groups. It is not that implementation: the diagnostic deliberately removes support for other controls and has no dependency-closure proof. Production sources and preview 3020 remain unchanged.

## Current profile

Three fresh Chrome 153.0.8010.53 accordion visits, HTTP cache disabled, service workers blocked, 4× CPU. Captured pointer, click and expected-mutation marks bound the analysis. Nine actions pass.

First-click V8 CompileCode intervals total 54.226/59.297/57.761 ms after unioning overlaps. Their events omit source metadata and the input window includes automation; they cannot be reported as framework-only compile time. Native module-evaluation intervals total only 1.046/1.237/0.914 ms. Repeated scope-adapter preparation costs 2.163–4.995 inclusive sampled ms on repeat actions; nested samples overlap and are not additive.

The trace sometimes supplies a script URL without a line or column. The analyzer previously rejected such a frame as an invalid position. It now retains its sampled time and source hash with an explicit unavailable-position marker, while refusing invalid supplied positions. Three missing-position regressions fail before the fix. Valid-position and invalid-position cases remain covered.

## Record scope

Matching the selected trigger's actual DOM index to its payload locator identifies the m3: MDX boundary. That boundary contains 68 cells, 153 computed records, 184 locators and 226 DOM updates. The page contains 175, 469, 603 and 733 respectively. The boundary also owns element handles, so the existing conservative projection planner refuses it. That refusal remains unchanged.

The experiment adds a separately named unchecked owned-record projection with alternate-prefix tests. It preserves markup and locator indexes, but can leave unresolved outside dependencies and intentionally removes other controls. It must not become a production fallback.

### Smaller HTML payload

Only the chosen boundary's state/view records remain in the private HTML response. Full and projected HTML are both buffered and Brotli compressed; scripts and markup are identical. Ten visits per variant and condition, alternating variant order, give 60 cold visits and 180 actions.

| Condition | First-click median, full → projected |
| --- | ---: |
| Normal | 54.25 → 46.90 ms |
| 150 ms network latency, 5 Mbps, 4× CPU | 154.20 → 227.00 ms |
| 4× CPU, no added network latency | 149.05 → 112.25 ms |

Both the CPU improvement and the network regression exceed the preset threshold. Pending scripts occur on 4/10 constrained first clicks with full HTML and 10/10 with projected HTML. The smaller document exposes an input opportunity sooner, before delivery finishes. Neither variant is a zero-wait design. Repeat differences do not clear the threshold.

Six separate coverage visits pass 18 actions. First-action initializer counts fall 117→113; repeats initialize zero additional modules; external framework coverage before input is zero.

### Original HTML, fewer decoded resume records

A copied build filters the decoded payload immediately before graph construction at the identified startDecodedResume entry. The source SHA-256 and a unique full entry sequence are asserted before patching. HTML rendering, markup, preload URLs and original payloads remain intact. The copy updates only the chosen pack and its Nitro static size/etag metadata. The first copy omitted that metadata update and was truncated by the server, producing syntax errors in three failed coverage visits; it was not timed or accepted. The corrected copy passes three fresh coverage visits/nine actions with no errors or HTTP cache hits.

Unchanged and corrected copies then run in separate groups of ten visits per condition, without overlapping owned builds/tests/profiles. This gives another 60 cold visits and 180 actions. Both use streaming HTML and Brotli quality 5 HTML/JS over local HTTP/1.1. The earlier buffered-HTML numbers are a separate experiment and must not be mixed into this comparison.

| Condition | First, before → diagnostic | Second | Third |
| --- | ---: | ---: | ---: |
| Normal | 54.00 → 48.35 ms | 17.65 → 17.20 ms | 17.95 → 16.40 ms |
| Network + 4× CPU | 261.40 → 233.80 ms | 22.60 → 19.70 ms | 26.00 → 21.15 ms |
| 4× CPU only | 146.10 → 118.65 ms | 23.65 → 20.25 ms | 25.60 → 18.55 ms |

The fixed threshold remains max(10 ms, 10% of the before median, twice the larger MAD). Both throttled first-click differences exceed it; the normal and repeat differences do not. CPU-only first-click reduction is 27.45 ms against a 14.61 ms threshold. The network reduction is 27.60 ms against 26.14 ms, a much narrower margin with already-pending scripts on 8 before and 7 after clicks. Do not extrapolate these samples to population tail latency.

Both builds make five framework requests plus three site-script requests per visit, with zero HTTP cache hits, failed actions or failed requests. No script request starts after a measured click. Encoded framework transfer is 234,730→235,339 bytes. First-action initializers remain 113 in the filtered copy; repeat counts are zero. Timing is captured click to expected DOM mutation, not paint or earliest-exposure input.

## Verification and next implementation

The 26 experiment tests and root pnpm run typecheck pass. No production source change is retained. The worktree docs output still matches accepted GSbudh across 63 client JS filenames/hashes, 19,274,342 bytes. Six earlier bundle-budget failures remain open. No commit, push, preview replacement or goal closure occurred.

ACCORDION-RESUME-SCOPE.json preserves samples, medians, MADs, thresholds, transform hashes and raw paths. Trace, coverage, timing and test copies are under results/accordion-scope-2026-09-22/. create-owned-resume-diagnostic.mjs reproduces only the explicitly nonshipping copied-build experiment.

The next implementation must retain untouched boundary records and activate them on later input. Before integrating, prove ownership for element handles, widget definitions and graph/symbol references, preserving refusal or full-resume fallback for connected scopes. The existing staged trigger-group runtime is a candidate for reuse; its lifecycle, capture authority, scalar handoff and MDX forwarding still need validation. First/second independent-boundary input, shared live state, keyboard/queued input, navigation/disposal and unsupported-scope fallback are required checks. Do not ship the unchecked filter, claim minimal execution from the 113 initializer count, or repeat the rejected scalar-decoding experiment as untested.
