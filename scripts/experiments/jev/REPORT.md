# Jev experiments on Markless — 19 September 2026

**Recommendation: keep Jev as an optional experiment selector; invest first in deterministic exploration and stronger assertions. These runs do not justify adding Jev to the release gate.** We found a reproducible modal focus-containment gap, but random and least-visited exploration also found it. No unique defect was established for Jev.

Four experiments used the current dirty worktree, Chromium, and Jev `jev-1.13.0`. The shared ledger contains **154 successful calls, 100,399 input tokens and $0.004216758 estimated input cost** at the configured documented rate. This is under half a cent, excluding machine/browser cost and engineering time; it is not an invoice measurement. The conservative admission reservation was $0.423886848 against a $1 cap. There were no API errors or retries. Mean observed API latency was 196 ms; this small local run is not a provider latency benchmark.

Raw results, requests, validated responses, replay traces and source hashes are in [results/2026-09-19](results/2026-09-19). Recompute the numbers with `node scripts/experiments/jev/summarize.mjs scripts/experiments/jev/results/2026-09-19`.

## 1. Music-player SSR exploration

Three runs per policy, sixteen actions each, fresh browser contexts, interleaved policy order. The browser clicked real controls; a deterministic YouTube double exercised foreign DOM replacement without real video/network variability. Assertions checked track, playing state, library, selected item, rotation, video ID and command-version changes. State coverage means combinations of track/playing/library, not whole-program coverage.

| Policy | Mean distinct states | Mean distinct transitions | Mean run duration | Violations |
|---|---:|---:|---:|---:|
| Seeded random | 9.33 | 14.33 | 3.82 s | 0 |
| Least-visited state/action | 10.33 | 16.00 | 4.43 s | 0 |
| Jev action selection | 8.33 | 13.00 | 6.04 s | 0 |

All nine traces replayed without model calls and matched the complete post-action observations. These are equal action budgets, not equal wall-time budgets. Jev seeds label runs/history; they do not control provider randomness. Three runs per policy do not establish statistical superiority. Here, least-visited exploration was simpler and covered more transitions. Real YouTube integration remains untested.

## 2. Nested modal: one useful finding, no Jev-only discovery

Twelve runs combined CSR/SSR, three policies and two seeds, with up to twelve legal actions. Seven runs stopped on the same symptom: activeElement became BODY while the inner dialog remained open and background remained inert. Random and least-visited each encountered this in two of four runs; Jev in three of four. These counts are repeated manifestations, not seven bugs or a fair coverage comparison: runs stop at the first assertion failure. All twelve traces replayed with identical actions, before/after observations and failure points, without API calls.

A separate standalone SSR fixture imported the existing nested modal component. After explicitly waiting for focus on inner-content, physical Playwright keyboard input reproduced containment exits in nine of nine follow-ups:

- Open outer, open inner, wait for inner focus, Shift+Tab: BODY.
- Same opening, Tab to the inner close button, Tab again: BODY.
- Same opening, Tab to the inner close button, Shift+Tab: BODY.

Each sequence ran three times, without page errors. The document lost focus; this does **not** demonstrate interaction with inert background controls. It reproduces outside Vitest's iframe and challenges the component note's assumption that inert alone contains Tab. The [WAI-ARIA modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) calls for both forward and backward tabbing to stay inside the dialog. This establishes a Chromium focus-containment gap, not a cross-browser or comprehensive accessibility audit.

Source inspection: `modal-focus.ts` focuses the surface; `modal.tsrx` gives it tabindex=-1; `packages/web/src/fns/overlay.ts` handles Escape without Tab wrapping in the inspected handler. The existing modal Tab test excludes the background control but permits BODY. The first standalone probe did not explicitly await opening focus and produced mixed observations; it is preserved separately and superseded for attribution by `modal-followup.json`.

**Next product work:** add a focused regression asserting top-dialog containment at both tab boundaries, then address the mechanism and verify CSR, standalone SSR, nesting, dismissal and restoration. No production fix was made in this experiment scope.

## 3. Compiler, serializer and runtime observation classification

Twenty-three related executed cases covered compiler acceptance/refusal, serializer values/identity/typed views/refusal, and settled data during runtime refresh. Controlled negative cases used lossy JSON transport or isolated faulty reader/copy adapters. They are executed fault controls, not newly discovered Markless defects.

Each case was presented as an original observation, a version without the observation, and a version with misleading application text: 69 questions, **66 expected answers**. Scores were 21/23 original, 23/23 missing-observation and 22/23 misleading-text.

All three mismatches were abstentions: two variants of a healthy refresh case and the original faulty refresh reader. Jev did not falsely declare that controlled faulty reader compliant, but failed to identify its violation. Treat abstention as unresolved, never passing. Requirements and compact observations were supplied; this does not measure whether Jev can infer contracts from arbitrary applications. Labels/fault provenance were withheld, but the unsupported-function case retained diagnostic code/docsUrl, so the corpus is not uniformly diagnostic-blinded. Repeated variants are correlated. One misleading-text perturbation is not a prompt-injection robustness evaluation; it even removed one abstention.

**Use:** optional triage of unfamiliar observations, with abstention and human review. **Avoid:** replacing exact compiler diagnostics, serializer roundtrip/identity tests or runtime state-machine assertions with probabilistic verdicts.

## 4. Standalone SSR resume under gesture/load schedules

The existing SSR counter fixture was opened in fresh browser contexts. Four deterministic schedules tested one click, two rapid trusted clicks, two clicks while the first post-click script response was held, and two clicks separated by the first state update. All produced the exact expected counts without page errors. Held-response runs recorded count zero before release and two afterward, confirming the intended loading condition occurred.

Jev then received the prior deterministic results and selected four additional schedules. It chose the held pair every time; each passed. This is a follow-up selection probe, not an independent blind comparison. It shows repetition under this prompt, not an inability to diversify. No model call occurred between the clicks of a schedule. This avoids model latency masking rapid-input conditions, but does not quantify the causal effect of model-paced clicking. Fresh browser contexts do not imply a cold dev server/compiler or production bundle.

**Use:** author explicit loading and gesture schedules and execute them deterministically. Ask Jev to select whole schedules only if the space becomes large; track novelty and retain a random/least-visited exploration quota.

## What makes sense for Markless

1. Strengthen deterministic browser invariants first: focus containment, nested overlays, exact event effects during resume, preserved async state and navigation cancellation. The modal finding demonstrates the value of the assertion, not dependence on a model.
2. Use bounded random/least-visited walks on a few composed UI and real-app fixtures. Keep exact action traces and promote minimized failures into ordinary regressions.
3. Keep Jev outside required CI for now. A future opt-in or nightly trial should select among legal semantic actions or predeclared multi-action schedules. Browser assertions decide failures; replay makes no API calls. Isolate session state before attempting massively parallel execution.
4. Evaluate the next trial by reproducible **additional distinct defects per browser minute and maintenance effort**, compared with the simple policies. Low token cost alone is not evidence of value. These experiments were serial and do not validate massive parallel scaling.

The most promising untested extensions are async-navigation cancellation, portal/overlay composition, combobox/typeahead schedules, and route transitions in consuming apps. Those are hypotheses for a later trial, not coverage claims from this run.

## Verification and limits

`pnpm run typecheck` passed. Three offline API-client tests passed, checking persistent conservative admission, no retries, redirect prevention and malformed responses. Music assertions and replay passed. Counter expected effects passed. The headless Vitest process completed, **but seven recorded component assertion failures remain**: the harness deliberately captures exploratory failures rather than failing the collector. No claim is made that Markless's full product suite is green, or that the modal defect is fixed. Production code, dependencies and normal CI were not edited.

The initial harness needed fixes for Vite package aliases and a watcher limit; the first immediate focus assertion was repeated with a three-second poll and still failed. These setup failures are not counted as product findings. Existing staged framework/config changes and unrelated website work were retained. Source hashes were captured at the end, so this is evidence about the observed dirty worktree and long-lived dev servers, not a clean-commit certification. Costs, classifications and browser observations are persisted; credentials are excluded and were checked against the archived output.
