# Jev on Markless composition, navigation and app journeys

Executed September 19, 2026 against the current local worktree. These targets were worthwhile: they exposed a production streaming error and reproducible development SSR integration failures. Jev was useful for repeated stateful interactions, but did not demonstrate a unique discovery over deterministic controls and simpler exploration.

## Markless findings

| Target | Observed failure | Evidence and scope |
| --- | --- | --- |
| Interrupted SSR streaming | Leave the pending report before it finishes; its late result raises `MARKLESS_STREAM_ARM_ANCHORS_MISSING: boundary:0`. | Built production preview, four fresh contexts across enumerated/Jev runs and their replays. The destination remains correct and interactive; this is an uncaught late-stream error, not demonstrated destination corruption. |
| Modal composition | Routed SSR opens the modal without making the background inert. Background clicks are accepted; Escape fails to close the composed example. | Three repetitions each of composed and flat routed modal controls. Existing direct SSR nested-modal control blocks background clicks and closes on Escape in three repetitions. This distinguishes the router SSR symptom from the earlier focus-containment finding. |
| Stateful Todo rows | Add succeeds; a row checkbox changes natively but task data stays incomplete. Double-click does not enter editing. | With current event spellings, three routed SSR contexts fail both operations while three direct CSR contexts perform both correctly. Original demo also fails row toggling in three direct SSR contexts. Exact compiler/runtime cause is not minimized. |
| Composed route transitions | Link changes URL while old page content remains, including a 15-second probe without outstanding requests. | Development routes with imported navigation/components; a plain route control can commit. Longer walks also record `__vite_ssr_dynamic_import__ is not defined`. Treat these as unresolved integration symptoms, not several proven independent bugs. |

The streaming throw is emitted in `packages/web/src/render-to-stream.ts`. Modal and Todo findings have not been verified in a production bundle. No framework fixes were made.

## What Jev added

Composition used three policies, three seeds and 24 decisions per run: 216 actions. App journeys used the same policies/seeds with 32 decisions: 288 actions, plus three initial task additions per run. Decision budgets were equal; elapsed time was not. Policies shared action menus, state observations and assertions.

In each of its three app runs, Jev stayed on Todos, attempted editing repeatedly and exposed row failures. Random and least-visited exploration each reached the four app routes in their runs; each also hit an editing failure in seed 43. Jev therefore made the row problem more consistent within this budget, while sacrificing route coverage. It repeated an established failure despite an instruction to prefer unexplored interactions. The fixed preflight had already exposed the row problem.

Each policy encountered the modal integration failures. For production timing, six schedules were enumerated and Jev made six selections: five distinct schedules, repeating the ineffective held-Back schedule and omitting cold-click-then-leave. Both enumerated testing and Jev found the streamed-navigation error. Browser errors were captured for analysis but were not included in Jev's production schedule feedback; that limits the adaptive comparison.

**Recommendation for Markless:** retain this as a bounded exploratory lane around consuming fixtures. Require route/action coverage first, let Jev choose interactions within each workflow, and turn minimized failures into deterministic regression cases. Keep fixed browser-loading and stream-cancellation schedules. These results do not justify replacing existing tests or making Jev the sole release gate. No compiler fuzzing or parallel execution speedup was evaluated here.

## Reproduction and interpretation

Commands are in [README.md](README.md). Raw state traces, model requests, responses, logs and source provenance are under [results/2026-09-19](results/2026-09-19). The API key is excluded.

- `production-navigation.json` and its replay contain the production stream error. Nine of twelve primary runs achieved their timing conditions; the three held-Back attempts did not because the asset was preloaded. A targeted asset gate in `production-held-followup.json` achieved the condition and passed in three fresh contexts.
- Cold two-click effects, cold click/navigation, SPA-pending cancellation and history roundtrip checks passed when their conditions were reached. Those bounded checks do not imply general correctness.
- Initial development timing attempts did not achieve the intended loading/pending conditions. They are diagnostic attempts, not passing robustness evidence.
- Composition replay matched corrected semantic states and violation labels in 215 of 216 steps. One random-run document reload did not repeat; focus recovery could leave the browser unfocused, so this is not counted as a new product bug.
- Original-fixture random/Jev seed-17 journey replays matched their 32-step semantic states and violation labels. Failed SPA transitions and row actions trigger recorded reload/reset recovery; these are interrupted explorations, not successful uninterrupted SPA journeys.
- Three initial composition labels incorrectly rejected the intentional callback when clearing a selected combobox. Corrections are archived; none of those labels reached Jev's requests.
- Initial Todo comparisons used legacy demo event spellings. The original source is preserved. Final fixture normalizes only event spelling, changes its helper import path and removes comments. Fresh controls above confirm the SSR/CSR difference survives normalization. The normalized Jev seed-17 replay matches 32/32 semantic states and violation labels. The normalized random replay aborted while observing a changing document; its partial trace is retained, not counted as a replay pass.

## Cost and checks

This task used 180 successful Jev calls and 347,736 reported input tokens. Estimated API cost is **$0.014604912**, using the unchanged client's configured input rate; this is not an invoice and excludes local compute/engineering time. The earlier experiment's 154 calls are excluded. Replays and independent controls made no API calls. Requests used synthetic fixture state, not user data.

Root `pnpm run typecheck`, the final two fixture authoring checks and the existing offline client tests passed. The production fixture built successfully. Initial overbroad fixture checks exposed generated-route/compiled-adapter typing mismatches and the stale demo spellings; those logs are preserved. Final authoring configs follow the existing demo include pattern and exclude those generated/compiled surfaces. This is not a full product-suite pass: the exploratory browser assertions explicitly contain the failures above.

This was the existing, modified local worktree with installed dependencies, reused servers and serial Chromium contexts. End-of-run hashes document provenance; they are not certification of a clean release commit. Setup errors, oracle corrections, partial replays and unachieved timing conditions remain visible in the evidence.
