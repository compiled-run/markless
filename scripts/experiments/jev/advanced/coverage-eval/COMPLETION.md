# Completion audit

Original objective: Improve the harness then have Jev do coverage then decide.

| Requirement | Current evidence | Result |
| --- | --- | --- |
| Repair the harness's feedback and repetitive exploration | `policy.mjs`, `run.mjs`, seven policy contract tests; recorded reset explanations, restricted menus and decisions in `journeys.json` and `api.jsonl` | Implemented and exercised |
| Have Jev perform coverage with a fair simple-policy comparison | Nine primary runs, 432 decisions; 143 Jev app choices, one harness-only Jev app choice; six production cases per policy, including five further Jev choices | Executed, with forced coverage distinguished |
| Verify the run instead of trusting collector exit codes | `audit.json`: model menus and choices match API responses; repeated-failure cap respected; 18 production conditions achieved | Verified |
| Replay representative app and production behavior | 144/144 semantic states/assertions match; 143/144 browser-error lists match; one extra previously known development error retained. Six production replays match conditions/checks/errors | Verified with explicit discrepancy |
| Check authored changes and consuming fixtures | `verification.json`, three typecheck logs, 13 passing offline tests, `static-checks.json`, successful production build | Passed within stated authoring scope |
| Make an evidence-backed decision | `REPORT.md`: retain bounded exploratory workflow use; deterministic required coverage; no unique confirmed defect or overall coverage advantage | Decision delivered |
| Preserve results, spending and credential boundaries | `archive-manifest.json`, `metrics.json`, 148 successful API results, estimated $0.034372716, credential exclusion scan | Archived and checked |
| Preserve unrelated work and clean up | Changes confined to experimental harness/docs; owned development and production server handles terminal | Complete |

Evidence files are in `results/2026-09-19/`. The source folder was renamed from `coverage` to `coverage-eval` because the existing ignore rule treated the former as generated output. Tests and audit passed after the rename. Initial hashes omitted that ignored source folder; final provenance includes it. This limitation is retained rather than claiming an immutable initial snapshot.

Product defects remain intentionally recorded and unfixed. No full product-suite, clean-release, framework-wide coverage or statistically established model-superiority claim is made. There is no remaining work required by this experiment's objective.

full_outcome_complete: true
