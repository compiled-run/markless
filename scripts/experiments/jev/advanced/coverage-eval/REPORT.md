# Decision after improving the Jev harness

**Keep Jev as a small exploratory workflow-testing tool for Markless. Use deterministic schedules and simple exploration for required coverage.** The repaired harness lets Jev contribute coherent interaction sequences, but these experiments still show no unique confirmed defect or overall coverage advantage that would justify building a large parallel testing service.

The original Todo loop was substantially a harness problem. This comparison establishes that the combined changes improve the observed behavior; it does not isolate which individual change caused the improvement.

## What changed

- Failure feedback now includes timeout details, browser errors, planned recovery and persistent failure counts. Each request explains a reset that occurred before the decision.
- Recovery reloads the failed route and restores its starting data. It no longer always returns to an empty Todo page.
- Ineffective actions are removed: for example, toggling an empty task list or clearing when nothing is completed.
- Two failures suppress that route/action/modal context. Broad invariant failures do not disable unrelated actions.
- Four decisions without a new state/action combination restrict the next choice to untried combinations where available.
- Each run starts fresh sessions on four routes. Mandatory starts, restricted menus and single-choice decisions are recorded separately from model choices.
- Production schedule feedback includes browser errors and actual gate activation. Completed schedules cannot be selected again; the held-Back gate starts before preloading.

The same rules apply to random, least-visited and Jev selection. Three repeats each contain four sessions and 48 decisions, producing 432 primary decisions. The seed controls local random selection/menu ordering, not the Jev model. Replays require no API calls.

## What the comparison showed

These are semantic browser scenarios in the existing experimental app, not framework-wide line or branch coverage. Setup additions and resets are excluded from the decision counts.

| Measure | Random | Least visited | Jev |
| --- | ---: | ---: | ---: |
| Average distinct actions per 48-decision run | 14.7 | 12.7 | 18.3 |
| Average distinct state/action combinations | 31.3 | 33.0 | 28.0 |
| Distinct actions across three runs | 22 | 17 | 21 |
| Chosen navigation attempts across three runs | 90 | 113 | 56 |
| Menus restricted to require new coverage | 2 | 2 | 9 |
| Single-choice decisions supplied by harness | 0 | 1 | 1 |
| Observed select-project → open-confirmation → confirm sequences | 0 | 0 | 7 |

Jev navigated in each repeat, including immediately leaving Todos in the first repeat without a forced choice. It no longer cycled through the former add/edit/reset loop. Its repeat-failure suppression was never needed; its novelty restrictions were needed nine times. The new runs have a different budget and starting conditions from the old runs, so the old/new counts are descriptive, not a controlled causal estimate.

Jev's useful contribution was more consistent action variety and composed workflows. The seven sequences above required observed selection/callback changes, the nested dialog opening and the confirmation counter increment without intervening document recovery. This sequence count was added during analysis, not specified as a statistical success threshold before collection. These local effects worked while the known modal inertness failure remained present. The simpler policies did exercise parts of that workflow, including confirmation without prior selection.

Jev did not win total breadth: random reached one more distinct action across the combined runs, and both simple policies reached more state/action combinations. A deliberately authored workflow policy was not compared and could guarantee the selection/confirmation sequence. The results support an inexpensive exploratory supplement, not general superiority.

## Failures and production coverage

The new runs reproduced the previously documented development SSR task-row failures, route stalls, missing modal inertness/Escape behavior and `__vite_ssr_dynamic_import__ is not defined`. No new independently confirmed failure class was established. Recorded reloads after stalled navigation are recovery, not successful SPA transitions. Development document markers are also reset during recovery; transitions without a recorded recovery are not, by themselves, proof that no document navigation occurred.

Every one of the 18 primary production schedules achieved its declared loading condition. Each policy executed the same six schedules without replacement. This coverage was guaranteed by the harness; Jev selected their order. Random and least-visited had the same order because the untried schedules tied and used the same local random seed.

Leaving a streamed SSR pending page again emitted `MARKLESS_STREAM_ARM_ANCHORS_MISSING: boundary:0`, while the destination remained correct and interactive. The other five schedules passed their recorded checks without browser errors. This again favors a fixed regression schedule over paying a model to choose among six known cases.

## Verification, cost and use

The first repeat of each policy was replayed: 144 recorded after-states and assertion outcomes reproduced. One replay additionally emitted the known development import error. Raw traces retain the difference. The six production Jev schedules also matched their achieved conditions, assertions and errors on replay. The audit checks recorded model menus/choices against API responses and verifies the repeated-failure limit.

Root `pnpm run typecheck`, both fixture authoring checks and 13 focused/offline tests passed. The production fixture rebuilt successfully. Focused tests cover failure suppression, feedback/reset preservation, forced-choice attribution, honest coverage counts and the observed workflow sequence. These checks do not turn the deliberately recorded product failures into a green product suite. Fixture authoring checks retain the earlier scope excluding generated declarations and compiled host adapters.

This evaluation made **148 successful Jev calls**, using **818,398 reported input tokens**, for an estimated **$0.034372716** at the unchanged client's configured rate. That excludes local compute and engineering effort. There were 143 model choices in the app runs and five in production scheduling; final single-choice decisions used no API. The evaluation used a separate $1 conservative cap, leaving earlier ledgers unchanged. The credential stays outside requests, browser state and the archived evidence.

Use this harness for a bounded exploration when changing composed UI behavior or app lifecycle handling. Keep required routes and loading cases deterministic, and promote useful sequences into permanent tests. The API is cheap; maintaining meaningful actions, assertions and recovery is the real work. There is no evidence here to justify a large parallel rollout or to replace existing release checks.

[Run instructions](README.md), [source and evaluation scope](TASK.md), and [recorded evidence](results/2026-09-19). The local worktree already contained unrelated modifications; no framework implementation, dependencies or CI configuration was changed for this evaluation. No product fixes were attempted.
