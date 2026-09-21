# Jev coverage follow-up

This evaluation repairs the repeated Todo failure/reset loop and compares Jev with random and least-visited selection. It measures semantic browser scenarios, not JavaScript line or branch coverage. The original experiments and their results remain separate.

The harness supplies four starting routes, meaningful action preconditions, persistent failure counts, reset/error explanations and a repeat limit. After two failures, the same route/action/modal context is unavailable. Four decisions without a new state/action combination restrict the next menu to untried combinations when available. Every restriction and single-choice decision is recorded. A broad invariant failure, such as missing modal inertness, does not suppress unrelated actions.

Each policy runs three repeats of four fresh sessions, with twelve decisions per session. The local seed controls menu ordering and random selection; it is not sent as a Jev model seed. Route/action memory persists across the four sessions within a repeat. The Todo source uses current event spelling. A failed action restores its own route and known initial data; this recovery is explicit and is never evidence of a successful SPA transition.

Start the existing fixtures from the workspace root:

```
node scripts/experiments/jev/advanced/setup.mjs
node scripts/experiments/jev/advanced/server.mjs
```

In a separate terminal:

```
node --test scripts/experiments/jev/advanced/coverage-eval/*.test.mjs scripts/experiments/jev/client.test.mjs
node scripts/experiments/jev/advanced/coverage-eval/run.mjs --preflight
node scripts/experiments/jev/advanced/coverage-eval/run.mjs
node scripts/experiments/jev/advanced/coverage-eval/run.mjs --replay
```

Preflight uses a simple policy and eight decisions per route without API calls. Replay runs the recorded first repeat of each policy, also without calls. Archived traces must first be copied to `/tmp/jev-coverage/journeys.json` when replaying after temporary files are removed. Replay checks that recorded actions remain permitted; divergence is retained as a failure rather than silently substituted.

Start `node scripts/experiments/jev/advanced/production.mjs` in another terminal to build and serve the minimal production fixture. After the journey collector finishes, run:

```
node scripts/experiments/jev/advanced/coverage-eval/production.mjs
node scripts/experiments/jev/advanced/coverage-eval/production.mjs --replay
node scripts/experiments/jev/advanced/coverage-eval/metrics.mjs
node scripts/experiments/jev/advanced/coverage-eval/audit.mjs
```

Production policies select without replacement from six declared schedules. This guarantees schedule attempts through the harness, not model intelligence. The final single remaining choice requires no API call. Gate activation, errors and exact-effect checks determine achieved coverage; an attempted but unachieved schedule is not a pass. Production replay covers the recorded Jev schedule order. The corrected held-Back gate starts before preloading.

Results and logs go to `/tmp/jev-coverage`. The evaluation uses its own $1 conservative request-reservation ledger, with no retries, through the unchanged client and existing server-side credential. Earlier experiments' ledgers are retained. A fresh live run overwrites result filenames and continues consuming this ledger's budget; archive results before rerunning. Run collectors sequentially so timing and output files do not interfere.

Checks required for changes: `pnpm run typecheck`, plus `node packages/typescript-plugin/src/tsc.ts -p scripts/experiments/jev/advanced/app/tsconfig.json` and the equivalent production-app config. Collectors retain product assertion failures and can exit successfully with those failures; inspect the result data. No production source, dependencies or CI configuration is changed by this evaluation.
