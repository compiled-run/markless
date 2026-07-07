# T001 — Execution Protocol (Codex CLI × Fable)

PM receipt note for goal `crazy-qa-impl`. Date: 2026-07-04.

## 1. Audit artifacts preserved in version control

`docs/goals/` is gitignored (`.gitignore:23`). The two behavior-contract artifacts were
force-added deliberately and committed on `feat/crazy-qa`:

- Commit `b6b8986` — "docs: preserve crazy-qa audit catalog and implementation backlog"
  - `docs/goals/crazy-qa/notes/catalog.md` (3,937 lines — 105 run-backed scenario entries)
  - `docs/goals/crazy-qa/notes/T900-impl-backlog.md` (826 lines — 23 work packages)

The living boards (`state.yaml`, `goal.md` for both goals) stay unversioned by design.

## 2. Dispatch invocation (established; auth blocker recorded)

Per the owner's fable-codex design rule, **this session never invokes `codex` directly —
all mechanical fan-out goes through `crew run`** (verified on PATH alongside `fable-codex`;
engine at `~/dev/open-source/fable-codex`).

Invocation:

```bash
crew run <packets.json> --run-id <B-task id>
```

Packet shape (per fable-codex README, confirmed against `crew --help`):

```json
{
  "config": { "model": "gpt-5.5", "effort": "medium", "parallel": 1, "timeoutMinutes": 30 },
  "units": [
    {
      "id": "b9xx-slice",
      "title": "…",
      "prompt": "self-contained task packet…",
      "verify": ["pnpm exec vp test …"],
      "worktree": true
    }
  ]
}
```

- Worker result contract enforced via `--output-schema`:
  `{ status: completed|partial|failed|blocked, summary, files_changed, open_questions }`.
  `blocked` is the sanctioned escalation path.
- Completed worktree units land on `crew/<run-id>/<unit-id>` branches; **crew never
  merges** — Fable diff-reviews first.
- Run artifacts: `.fable-codex/runs/<run-id>/` (ledger.jsonl, per-unit prompts/results/logs).
- `parallel > 1` requires `worktree: true` on every unit; default stays `parallel: 1`
  (board rule `max_write_workers: 1`; parallel dispatch only with PM-proven disjoint scopes).

**Dry-run result (run-id `t001-dryrun`):** wiring proven end-to-end — crew dispatched,
codex launched, retries + ledger + per-unit artifacts all functioned. Both attempts failed
with **HTTP 401 `token_invalidated` / `refresh_token_invalidated`**: the Codex CLI login
has been revoked and cannot self-refresh.

**Unblock step (owner action, interactive):** run `codex login` (if it complains, first
`codex logout`). Then re-run the dry run before the first real dispatch:

```bash
crew run <scratchpad>/t001-dryrun-packets.json --run-id t001-dryrun-2
```

## 3. Per-task branch / commit / review protocol

1. **Packaging (PM/Fable):** render the B-task work package from
   `docs/goals/crazy-qa/notes/T900-impl-backlog.md` §B9xx (+ Owner-Ruling re-scopes from
   T003), set the insertion limit, list the catalog entries that become fixtures.
2. **Design notes first** for B903 / B908 / B909: Fable writes or approves
   `notes/design-B9xx.md` before any Codex dispatch.
3. **Red first:** the unit's prompt requires writing the catalog-derived fixtures and
   running the narrowest failing command BEFORE implementation; the red output must appear
   in the worker summary. Alternate-shaped fixtures per the anti-hardcoding guardrail.
4. **Dispatch:** `crew run` with `worktree: true`; verify array carries the package's
   focused test commands (crew gates on them).
5. **Review (Fable):** diff `crew/<run-id>/<unit-id>` against the work package — checklist:
   correctness vs catalog contract, diff minimality vs insertion limit, pass-boundary
   ownership, no sigils, no benchmark/fixture hardcoding, runtime-agnostic ESM, diagnostic
   shape (consequence → why → fix → link). For B908: the pinned-assertion diffs in
   `symbol-modules.test.ts` get line-by-line review (owner signed off on revising them).
6. **Merge:** Fable merges the crew branch into `feat/crazy-qa` (no-ff or squash per diff
   size), one commit per B-task, message style `compiler|runtime|serializer: <what>`.
7. **Broaden:** after merge, run the touched packages' suites + browser baseline
   (constructs-csr/ssr: 32 pass + 2 known-red) when emit/runtime behavior changed.
8. **Receipt:** red-run evidence, changed files, commands+status, review verdict, commit
   hash, pass ID touched.
9. **Escalation:** worker `blocked` status or catalog-claim divergence → PM handles;
   re-dispatch with feedback, take the unit in-session (rare), or block the card.

Recommended hardening (optional, owner call): add `"deny": ["Bash(codex *)"]` /
`"allow": ["Bash(crew run *)"]` to `.claude/settings.json` per the fable-codex README.

## Deviations / caveats

- Codex auth expired: part 2's live proof stopped at 401 (wiring itself verified). First
  real dispatch is gated on `codex login` by the owner. T003 (Judge re-scope) proceeds
  meanwhile — it is read-only and Codex-free.
