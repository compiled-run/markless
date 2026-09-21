# Rich composition, navigation and app journeys

Workflow guidance: .ruler/skills/markless-implementation/implementation.md

Run from the workspace root with installed dependencies and Chromium. `node scripts/experiments/jev/advanced/setup.mjs` creates a local dependency symlink to the existing router fixture's installed dependencies; it does not change package manifests or install dependencies.

Start `node scripts/experiments/jev/advanced/server.mjs` in a separate terminal. Then run browser lanes sequentially:

```
node scripts/experiments/jev/advanced/composition.mjs
node scripts/experiments/jev/advanced/journeys.mjs
```

Append `--replay` to replay recorded choices without Jev calls. Runs write to `/tmp/jev-advanced`; archive that directory before another live run. These collectors record assertion failures and may exit successfully with product violations; inspect `violations`, `checks`, `errors`, `actionError`, `conditionAchieved` and `recovery` fields.

For independent controls, also start `node scripts/experiments/jev/advanced/control-server.mjs` and `node scripts/experiments/jev/advanced/control-server.mjs --modal`. Then run `node scripts/experiments/jev/advanced/followups.mjs`. These controls make no API calls.

The key stays in Node via the existing Jev client. Requests share its existing `/tmp/jev-experiments/api.jsonl` admission ledger and $1 cap. Replays never create a Jev client. API history contains only synthetic fixture state, available actions and observations.

The initial comparison imported the existing TodoMVC demo. The final routed app uses an experiment-owned copy with current `onKeydown`/`onDblclick` spellings and unchanged demo data helpers. The tested original source is archived with results. Run `node scripts/experiments/jev/advanced/canonical-control.mjs` for fresh routed SSR versus direct CSR controls. Run `node scripts/experiments/jev/advanced/journeys.mjs --replay --sample --canonical --jev-only` for the representative normalized-fixture replay; its output has a separate filename.

Failures may trigger explicitly recorded document-reload or dialog-focus recovery so later behavior can be explored. Recovered journeys must not be described as successful uninterrupted SPA sessions. The known focus-containment gap, intentional combobox clear callbacks, and harness setup failures are not new discoveries.

For production timing, start `node scripts/experiments/jev/advanced/production.mjs` separately; it builds the three-route fixture and starts preview on port 4394. Then run:

```
node scripts/experiments/jev/advanced/production-navigation.mjs
node scripts/experiments/jev/advanced/production-navigation.mjs --replay
node scripts/experiments/jev/advanced/production-navigation.mjs --held-followup
```

The last command specifically holds the compiled pending-route asset before preloading can defeat the gate. The older `navigation.mjs` development probes failed to achieve their intended conditions and are retained as diagnostic attempts. The composed UI and Todo controls use development SSR; only the separate minimal timing fixture was production-built. Browser contexts are fresh, servers are reused, and execution is sequential. No model call occurs between timed gestures.

Authoring checks: `pnpm run typecheck`, plus `node packages/typescript-plugin/src/tsc.ts -p scripts/experiments/jev/advanced/app/tsconfig.json` and the equivalent `production-app/tsconfig.json`. Fixture configs check authored views and Vite config, excluding generated-route declarations and compiled Node SSR adapters. No production source or normal CI is changed. Read [the findings and limitations](REPORT.md) before interpreting the collected failures.
