# The 24-Hour Framework Window: What We Tried To Fix, Why, And What Happened

Written 2026-07-09 at the owner's request, before reverting the window.
Scope: every framework change on `scoped-errors-t003-wip` (15 commits,
`a2b2f5d..ddbafbe`) plus the two immediately preceding landings the owner
asked for by name. The app-side work (path-URL migration, gate, console
guard) is NOT part of the revert — it lives in the DSM repo and is
gate-green.

## Why the window existed at all

Three owner reports started it, each real:

1. **"The ref picker should not be breaking the entire app… we definitely
   need scoped errors."** A half-written component crashed during CSR render
   and the ENTIRE app died: deep links showed stale home content, every
   route appeared broken. Root causes found: two compiler emission bugs
   (sync computed reading an async computed emitted a raw identifier →
   ReferenceError; a bare state alias emitted a missing initializer →
   PARSE_ERROR), and — architecturally — **no containment**: one throw
   escaped through double fire-and-forget (`void renderRoute(...)`, a
   try/finally with no catch) and poisoned everything downstream.
2. **"11 KB executed with zero interaction… at max ~1 KB"** plus the
   music-player interaction "doubling." Attribution found the music player
   was innocent (accounting became honest, and 48% of the number was the
   dev logger measuring itself) but the dashboard violation was real and
   *worse* than reported — and the meter was lying (prod builds printed
   "0 executed" while ~19.6 KB ran).
3. **"We should know immediately if something is wrong so the agent fixes
   it instead of being oblivious."** Nothing failed loudly: dead handlers,
   never-settling boundaries, and byte regressions were all silent.

## What each landing was for

| Landing | Why |
|---|---|
| Emission fixes (T002) | The two crash shapes above are legal plain JS/TSRX; the compiler emitted broken code for both. Fixed red-first; proven end-to-end (the picker crashes on published 0.1.1, runs on fixed tarballs). |
| Containment (T003) + spec D9 | The owner's scoped-errors demand: throws contain at nearest `@try/@catch` → component slot → page scope; handler throws report once and never kill other handlers; one subscription can't poison a flush wave; one arm can't kill a stream; boot holds can't hang forever on a settle error. All browser fixtures green. |
| Honest meter (T006) | Prod hook coverage, summary-after-quiet, chunk dedup, tooling split — the console number became true. Identity hash boots stopped demanding the render path. Budgets seated as gates (music-player 2.0 KB box, oracle exec phase). |
| Wiring fixes | Two proven silent gaps: pure-state composed children's events never wired; handlers inside nested `@switch` arms in settled `@try` arms never fired (the branch picker's dead tags/close buttons). |
| Commit-dispatch race | A click landing between an arm's DOM swap and event re-registration was silently swallowed. Swap+rewire became synchronous. |
| Loud diagnostics (D2 campaign) | `MARKLESS_EVENT_HOST_MISSING`, `MARKLESS_EVENT_DISPATCH_UNMATCHED`, region errors — every formerly-silent failure now reports. |
| T007 violations sink + sentinel | The agent-loop feature: dev violations stream to `/__markless/violations`; a sentinel exits with the payload the moment one appears. |
| Anchor rebinders (final day) | Range replacements (arm commits, branch flips) recreate nested boundaries' anchor comments; live records pointed at detached nodes and threw ANCHORS_MISSING on every re-settle. |

## What went wrong — honestly

1. **The loudness campaign inverted the owner's experience.** The old
   framework failed silently; pages "worked" while handlers were dead and
   boundaries never settled. The new framework reports everything — so the
   owner's console filled with errors that had always been there as
   silence, PLUS new ones we introduced. Correct engineering, terrible
   rollout: loudness should have landed **after** the underlying failures
   were fixed, not before.
2. **Each fix revealed the next stratum.** Deferred nested anchors → flip
   path also eats anchors → rebinder needed in two places → still one
   `c3:boundary:0` producer unfixed at revert time. The composed/nested
   boundary machinery has more coupled invariants (anchors, locator
   spaces, event re-registration, settle bookkeeping) than any single fix
   respected. This is the strongest argument that the subsystem needs a
   designed rework, not another patch.
3. **Verification failures cost a full night**: a stale preview served old
   builds (three rounds of false verdicts), tracked gate artifacts blocked
   a branch checkout (false convictions of innocent patches), and the
   battery asserted outcomes but never console cleanliness. All three are
   now structurally fixed (gate with served==disk assertion and build
   hashes; `.gate/` ignored; console guard in every spec) — those fixes
   survive the revert because they live in the DSM repo.
4. **The visible items lost to the invisible ones.** Branch selector, dark
   mode, PR tabs — all built, none landed, because each relanding hit the
   next framework stratum. The owner asked for five visible things and
   received one (path URLs) plus a cleaner architecture they never asked
   to see this week.

## Owner ruling on PR #15 — and the deeper cut (added 2026-07-09)

The owner's diagnosis, accepted after review: **PR #15's refresh fixes were
themselves a root cause of the window.** Each was verified in isolation
(red-first, property-tested, oracle-gated) — but in composition they
deepened coupling in the navigation/settle subsystem that then churned for
24 hours: the boot-hold introduced an unbounded wait whose hang-forever
edge drove the containment urgency; the identity-skip decided too late and
spawned the T006 boot-trim; the hijack guard added the
`data-async-container` coupling that surfaced in the wall forensics.
"Verified in isolation" and "destabilizing in composition" were both true.

Disposition: PR #15 **closed unmerged** (comment links here). The stable
base was cut deeper, to the released `0.1.1` state (`99a8885`) plus only
the 4-line router `lang.ts` build shim, this report, and spec 13. The app
was pair-reverted to its pre-migration state. The restored pair is
gate-green with the console guard active (stable, two consecutive runs).

The line held at `99a8885` after a deliberate audit of everything earlier:
the pre-window/pre-PR-15 framework is released on npm, judge-audited per
tranche, and field-tested by a full day of real app use — its defects are
known and pinned, not latent. Nothing earlier meets the bar for reverting.

## The rebuild base (GPT-5.6 workers)

- Framework: `app-stable` = `99a8885` + build shim + docs. App:
  `feat/markless-dashboard` @ the pair-reverted, gate-green state.
- Every window diff preserved: branches (`scoped-errors-t003-wip`, crew
  branches for picker/dark-mode/PR-tabs) + patches in the session job dir.
- Verification the window lacked, active from commit one: the
  deterministic gate (`pnpm gate:app`, stale-preview guard, `--specs`
  bisection, build hashes) and the console guard (any pageerror or
  console.error fails the spec).
- Reland order stands as below, with one amendment from the ruling: the
  refresh fixes are re-derived LAST, on top of a settled containment
  design, not first — their receipts are the spec, not the patch.

## What the revert keeps and loses

**Keeps (not in the revert):** the app's path-URL migration (gate-green),
the deterministic gate, the console guard, the boards/receipts, all crew
branches (picker, dark mode, PR tabs in flight), and every diff from the
window preserved as patches in `~/.claude/jobs/55c14938/tmp/` and on the
`scoped-errors-t003-wip` branch (which is NOT deleted — only no longer
what the app consumes).

**Loses (until deliberately relanded):** containment/scoped errors, the
honest meter, the emission fixes, the wiring fixes, all loud diagnostics,
the sink/sentinel. The console goes quiet again — including the silent
failures it was reporting. The branch picker cannot land on the reverted
base (its component shape crashes on the old compiler).

**Cherry-picked exception:** the 4-line router `lang.ts` query hint —
without it, linked-mode app builds fail outright.

## Recommended path back (when ready)

Reland in this order, each step gate-green with the console guard on:
emission fixes (small, self-contained) → honest meter → containment
WITHOUT the new diagnostics → wiring fixes with the composed/nested
boundary subsystem reviewed as a whole (anchors + locators + events +
settle as one design, not four patches) → diagnostics LAST, once the
console is genuinely quiet.

---

# Appendix: Spec 13 — Resume Snapshot Cache (reconstructed)

The owner asked "where is spec 13 on the resume cache." Exhaustive search
(all git refs, stashes, dangling blobs, reflogs, both repos, Spotlight)
finds no such file ever existed in these repos — but the DESIGN was fully
worked out in conversation on 2026-07-08. Reconstructed here so it is not
lost; move to `specs/framework/13-resume-snapshot-cache.md` when ratified.

## 13. Resume Snapshot Cache (client-persisted settled state)

**Problem.** On refresh/boot, boundaries whose data the client saw moments
ago render `@pending` and refetch. The most-known data in the app (chrome:
actor, repo title, counters) is treated as the least known.

**Design principle.** No new authoring API. This is resumability pointed
at the previous document: the framework already serializes every settled
boundary snapshot into `markless/state`; today that payload only ever
comes from the server.

**Contract.**
1. Settled graph snapshots MAY persist client-side (sessionStorage;
   host-adapter pluggable for native), keyed by route + graph node.
2. At boot, a boundary with a cached settled snapshot resumes
   **settled-stale**: it renders the cached content immediately — no
   pending arm — then re-runs its async computed in the background.
3. Revalidation needs no new UI semantics: **D8's re-settle hold already
   covers it.** A settled boundary whose computed re-runs holds its
   settled content until the new run settles; a cache-resumed boundary is
   just a settled boundary revalidating. It never flashes; it swaps
   in-place only if data changed.
4. Containment interaction (D9): a cached snapshot for a boundary whose
   revalidation REJECTS falls through to `@catch` — stale-forever is
   forbidden.
5. Opt-in surface: app/router-level configuration (shape:
   `router({ snapshotCache: 'session' })`), with per-computed opt-out for
   never-cache data (auth-sensitive). Never a component-level API; `@try/
   @pending/@catch` remain the only authoring vocabulary.
6. Placement: the seam belongs in resume (accept snapshots from a client
   source — the input already exists); the policy in the router adapter;
   the storage in a host adapter. Core stays runtime-agnostic. Prove the
   shape in the app first (plain JS via existing seams), promote to
   `@markless/router` once tests define the public surface — per the
   "tests prove what should be public" doctrine.

**Non-goals.** Not a data-fetching library; no TTLs/queries/invalidation
DSL. Freshness beyond stale-while-revalidate stays application logic.
