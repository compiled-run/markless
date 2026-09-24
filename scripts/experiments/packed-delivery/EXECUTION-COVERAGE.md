# Cold docs execution coverage

This is the original packing comparison. Follow-up attribution, first/repeat fixes and separate-control measurements are in [INTERACTION-COST.md](INTERACTION-COST.md). In particular, the first-use totals below include long export declarations; they must not be described as equivalent amounts of executed handler code.

Separate Chrome precise-coverage visits, fresh context per route, HTTP cache disabled, service workers blocked. One visit and three actions per route per build. Both builds use intent preloading and early input capture. This is execution evidence, not a latency benchmark.

| Route | Before input, unpacked → packed | First action, unpacked → packed | First repeat, unpacked → packed |
|---|---:|---:|---:|
| state-counter | 0 → 0 | 69,081 → 193,067 | 14,743 → 16,498 |
| computed-total | 0 → 0 | 67,693 → 190,919 | 16,506 → 20,129 |
| mode-select | 0 → 0 | 55,878 → 188,312 | 24,541 → 30,930 |
| accordion | 0 → 0 | 244,725 → 380,848 | 38,484 → 53,347 |

Values are UTF-8 bytes of disjoint source regions marked executed by Chrome. Nested untouched function bodies are excluded, and overlapping executed ranges are counted once per window. This is not compressed transfer size, CPU duration, or logical-module initializer attribution. Source-region coverage also counts registration and declarations around dormant functions; a larger number does not imply a proportional CPU increase.

Both builds passed the four interaction scenarios without page errors. No external framework code was covered before input. Packed first-use and repeated-action coverage is larger; do not describe the execution cost as identical to unpacked delivery. The independent unprofiled timing comparison is in PACKING-ONLY.md.

The whole-chunk runtime ledger still needs initializer-level attribution. These coverage results do not complete that requirement.

Unpacked raw: /private/tmp/markless-docs-execution-QAPzdl/results.json

Packed raw: /private/tmp/markless-docs-execution-ik7aLs/results.json
