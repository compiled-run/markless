# Known priming record: measured and rejected

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/performance.md, .ruler/skills/markless-implementation/bundler.md.

The candidate removes redundant scalar payload reads on the real docs menu and accordion, but no measured latency difference clears the preset threshold. It is reverted. The accepted combined loader optimization and preview at localhost:3020 remain unchanged. Exact minimum execution and the six earlier bundle-budget failures remain unresolved.

## What was tested

The inline hover/focus primer already knows the matching event record. Forwarding that record lets the scalar path check whether it supports the handler before decoding state/view. Unsupported handlers then proceed to full resume without those two redundant reads. Unknown or newly minted controls retain their fallback; actual events retain their own records.

Failing-before regressions cover alternate records, hover/focus, unsupported priming and supported priming without handler execution. The first version exceeded the unchanged inline ceiling. Reusing the existing event lookup and calling the standard script-element getAttribute method directly brings it to 1,090 gzip bytes, within the existing limit. Fake script elements needed that standard method added. Comment removal also exposed a source-length-ratio assertion; the candidate replaced it with an absolute 839-byte prerender limit, with identical prerender/self-wake function syntax after excluding comments. These supporting test edits are also reverted, not retained as unrelated cleanup.

The candidate passes root/docs typechecks, 896 web/router-vite/inline tests, the overlapping 249-test router suite, 64 docs tests and docs doctor/build. Eighteen cold coverage visits and six navigation/delivery cases pass, including independent controls, keyboard input, queued clicks, live state handoff, history, offline controls and delayed/failed pack delivery.

Source-identified scalar reader entry counts fall from two to zero on the first menu and accordion action in each of three visits. Counter and computed examples remain at two; repeat actions remain at zero. This measures this reader, not every JSON parse. Initializer counts stay 13/56/72/117 for counter/computed/menu/accordion. The second menu action initializes one additional module; counter and accordion repeats initialize zero. The tested pages execute no external framework code before input. Coverage and initializer counts are not CPU timings or proof of minimal execution.

## Cold Chrome comparison

Chrome 153.0.8010.53; four controls; ten fresh visits per build and condition; three actions per visit; 240 visits and 720 actions total. HTTP cache disabled, service workers blocked, identical Brotli quality 5 HTML/JS over local HTTP/1.1. Unchanged and candidate builds run in separate groups, without overlapping owned builds/tests/profiling. Timing is captured click to expected DOM mutation, not compositor paint.

A difference must exceed max(10 ms, 10% of the before median, twice the larger median absolute deviation). No row exceeds it.

| Control, 4× CPU without added network latency | First median, before → candidate | Second median | Third median |
| --- | ---: | ---: | ---: |
| Counter | 45.75 → 47.20 ms | 10.05 → 9.75 ms | 9.90 → 9.80 ms |
| Computed total | 82.35 → 83.80 ms | 11.20 → 10.80 ms | 11.05 → 10.55 ms |
| Menu | 91.05 → 90.65 ms | 13.10 → 12.35 ms | 11.90 → 12.75 ms |
| Accordion | 150.35 → 149.80 ms | 23.25 → 23.45 ms | 25.65 → 23.25 ms |

Accordion first-click medians are 54.70 → 54.85 ms under normal conditions and 154.80 → 153.20 ms under 150 ms latency, 5 Mbps and 4× CPU. Neither is meaningful by the same criterion.

Both builds make five framework requests plus three site-script requests per visit, with zero HTTP cache hits, failed actions or failed requests. Already-pending scripts occur on 31 before and 26 after clicks; no script request starts after a measured click. This does not establish that preloading always finishes before input. Encoded framework transfer increases about 119–123 bytes per route in the candidate.

## Restored state and evidence

Seven scoped source/test files are restored from exact pre-experiment copies. Root pnpm run typecheck, 956 web/router/inline tests and pnpm --dir website run doctor pass. Rebuilt client output matches the accepted GSbudh build across 63 filenames and SHA-256 hashes, totaling 19,274,342 bytes. The six earlier size/negative-budget failures remain open; these checks are not a full-suite green claim.

KNOWN-PRIMING.json contains samples, medians, variance, thresholds and raw paths. Copies of timing, coverage, navigation, initializer, test and restoration evidence are under results/known-priming-2026-09-22/. Seven known-prime-*-rejected.patch files preserve the rejected changes. No preview replacement, commit, push or goal closure occurred.

This rules out duplicate scalar decoding as a useful next latency optimization for these tested routes. A next investigation should isolate a larger input-triggered compilation or evaluation cost before changing another path.
