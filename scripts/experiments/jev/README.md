# Jev experiments for Markless

Exploratory research harness, outside normal CI. No production package changes.

Workflow guidance: .ruler/skills/markless-implementation/implementation.md

The predeclared comparisons use the current worktree, a pinned Jev model, fixed action budgets, separate healthy observations and explicitly executed fault controls. Jev receives observations and legal choices; deterministic assertions decide contract violations. Model calls, timing and costs are recorded in `/tmp/jev-experiments/api.jsonl`. A shared conservative $1 input-cost admission limit counts uncertain attempts and disables retries. The key stays in the Node process.

Experiments:

1. SSR music-player persistent sessions: three seeds, sixteen actions per policy, comparing Jev, seeded random and least-visited state/action pairs. Measure states/transitions reached, assertion failures, time and replay. A deterministic YouTube test double isolates Markless state and foreign DOM replacement; real video playback is outside the claim.
2. Composed headless UI: existing nested modal fixture, legal pointer/keyboard choices and focus/inertness/dismissal assertions. Compare the same policies under equal action budgets. CSR and SSR results are separate; Vitest SSR mounts do not prove a completely cold runtime.
3. Compiler/serializer/runtime observations: capture actual accepted/rejected inputs and runtime transitions. Evaluate whether Jev distinguishes compliant behavior, expected refusal, violation and insufficient evidence. Negative controls must execute an isolated faulty transport/adapter; no invented failure logs or claim of new framework bugs.
4. Resume timing: controlled initial input and delayed module loading on a standalone SSR page, with exact event-effect checks. Separate browser-fresh from server/compiler-cold conditions, and compare rapid gestures with model-paced interactions.

Preserve failing runs and deduplicate by mechanism. Follow-up probes prompted by results are labeled as follow-ups. Small samples establish observations about these fixtures, not general model superiority. No model call is made during replay.

Run the client checks with `node --test scripts/experiments/jev/client.test.mjs`. Start the local demo with `node scripts/experiments/jev/server.mjs`; its selected URL is saved in `/tmp/jev-experiments/server.json`.

## Reproduction

Run commands from the repository root, with installed workspace dependencies and Chromium. The client reads `TYPESAFE_API_KEY` or the existing local key file. Do not put the key in a browser module. Live calls append to the existing budget ledger; exceeding the cap stops execution rather than resetting it.

- Music: start `node scripts/experiments/jev/server.mjs`, then run `node scripts/experiments/jev/music.mjs`; replay with `node scripts/experiments/jev/music.mjs --replay`.
- Nested dialogs: `pnpm exec vitest run --config scripts/experiments/jev/vitest.config.mjs`; replay with `JEV_REPLAY=1 pnpm exec vitest run --config scripts/experiments/jev/vitest.config.mjs`. Inspect recorded `failure` fields: a successful collector process is not proof that modal assertions passed.
- Observations: `node --experimental-transform-types scripts/experiments/jev/observations.mjs --live`.
- Standalone: start separate `node scripts/experiments/jev/server.mjs --counter` and `node scripts/experiments/jev/server.mjs --modal` processes, then run `node scripts/experiments/jev/standalone.mjs`. The settled-focus follow-up is `node scripts/experiments/jev/modal-followup.mjs` and makes no API calls.
- Recompute archived metrics: `node scripts/experiments/jev/summarize.mjs scripts/experiments/jev/results/2026-09-19`.

Run browser lanes sequentially. Dev-server caches remain warm; these commands do not establish production or server-cold behavior. New experiments overwrite temporary run files; preserve a dated copy before another run. Read [REPORT.md](REPORT.md) for the current conclusions and uncorrected product finding.
