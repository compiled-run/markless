# 13. Client Snapshot Resume: Refresh-Stable Boundaries via Persisted Settled Snapshots

Status: SPECIFIED, NOT IMPLEMENTED (POC-validated 2026-07-08 — goal
`snapshot-resume-poc`, commit `196da51` on branch `snapshot-resume-poc`;
measured matrix: `docs/goals/snapshot-resume-poc/notes/comparison.md`).
Charter after the scoped-errors tranche clears: rejected-revalidation
containment (`@catch` fallthrough) is a hard dependency.

## Motivation

A refresh of a page whose content lives in async boundaries replays `@pending`
for data the user was just looking at. On suspense-heavy pages this is a
full-page flicker and CLS event on every reload. Resumability already
serializes every settled boundary's state into the payload protocol; this
feature points that same payload at the previous document: persist settled
boundary snapshots client-side, seed them into the next document as
settled-stale, and revalidate in the background. `@pending` becomes something a
user sees only on a genuinely first visit.

One sentence: the snapshot cache is resumability's own payload, keyed by build
and route, replayed into the next document's pending regions and immediately
re-verified.

## Authoring contract

Component code does not change. A cached region is a normal async boundary
with the normal arms vocabulary:

- `@try` renders cached content on refresh exactly as it renders settled
  content today.
- `@pending` is skipped entirely on a cache hit and behaves normally on a
  miss.
- `@catch` renders when background revalidation rejects. Cached content MUST
  NOT outlive a failing data source (no stale-forever).

There is no per-component cache API, no status read, and no new grammar. The
arms ARE the freshness UI.

## Configuration contract (router plugin)

Opt-in is build-time config on the router Vite plugin and travels to the
browser through the existing virtual-module mechanism:

```ts
router({
  resumeCache: {
    storage: 'session',
    include: ['repo', 'header*'],
  },
})
```

- `include` is an ALLOWLIST of graph-node names (the compiler's name-based
  `computed:<name>` ids; glob suffix allowed). Only allowlisted boundaries are
  ever persisted. Blocklist polarity is rejected: the serializer has no secret
  tier yet, and a forgotten exclude entry would persist sensitive data at
  rest. Allowlist misses fail safe (nothing cached).
- An `include` entry that matches no graph node in the build is a BUILD ERROR
  (fail-closed), so renaming a state/computed local cannot silently change
  caching behavior. The diagnostic must name the unmatched entry and list
  near-miss candidates.
- `resumeCache` absent or `false` emits zero cache code (entry-level split,
  not a runtime branch).

Open question that blocks config-schema freeze: graph-node name scoping when
two components declare the same local name. If payload ids can collide,
entries must gain a component qualifier.

## Cache entry and keying

A cache entry is the SAME protocol shape the streaming path emits when a slow
boundary settles after the shell was sent: the boundary's arm-record set, the
computed's fulfilled snapshot (`markless/state-patch` shape), and the settled
HTML of the boundary range. No new serialization format is introduced.

Key: `markless:snapshot:<buildHash>:<route>:<boundaryId>`.

- `buildHash` is a new OPTIONAL, ADDITIVE payload field stamped at build time.
  Boundary/symbol ids are compiler counters that renumber on structural edits;
  keying by build hash makes every deploy a cache miss by construction, so a
  stale entry can never produce a matching-but-wrong seed. Decoders MUST
  tolerate its absence (protocol version stays 1).
- Storage is a per-tab Web Storage target behind an injected
  `{ getItem, setItem }` capability (the `MarklessExecutionLogStorage` idiom),
  guarded with try/catch. `sessionStorage` per-tab scoping is a design choice:
  tabs never share seeds, which removes multi-tab consistency from scope.

## Capture contract

- Capture happens ONLY when an allowlisted boundary settles `fulfilled`.
  Pending and rejected snapshots are never persisted.
- Capture happens AFTER settle commit (save must not race restore or persist
  mid-revalidation state). While a revalidation is in flight, the previous
  entry remains valid.
- Any capture failure (quota, blocked storage, serialization error) is a
  silent no-op. Capture must never affect rendering.

## Boot contract (seed + revalidate)

At resume boot, before graph construction, entries matching the current
`buildHash` + route are adopted through the SAME adoption seam streamed arm
patches use today (`markless/arm` + `markless/state-patch` merging into the
decoded payload):

1. On a hit, the boundary's payload becomes settled and the cached HTML fills
   the boundary range. The region paints immediately with no `@pending` frame
   and no layout shift. Cached content is interactive without component
   execution (lazy symbols; no hydration).
2. Every seeded boundary enters a per-node DEMAND SET and its async computed
   is demanded at start. This is a deliberate, scoped deviation from the
   demanded-execution doctrine (SSR-resumed pages stay lazy): POC measurement
   proved seeded boundaries never revalidate on their own, and unconditional
   revalidation is a non-negotiable guardrail of this feature. The mechanism
   generalizes the existing CSR `demandOnStart` flag to a node set.
3. While the re-run is pending, the re-settle hold keeps the seeded content
   visible (no `@pending` flash — the D8 hold behavior for boundaries whose
   `@pending` arm was never shipped is the CONTRACT here, not a gap; a pinning
   test must protect it).
4. Re-run fulfilled with equal data: no visible change (a refresh where
   nothing changed is pixel-identical). Fulfilled with different data:
   in-place atomic boundary swap with no intermediate frame. Rejected: the
   `@catch` arm replaces the seeded content through containment.

## Failure contract

Every failure path is a cache miss, never a new failure mode:

| Situation | Required behavior |
| --- | --- |
| First visit / no entry | Normal `@pending` -> settle |
| Deploy (buildHash changed) | Key miss -> normal behavior |
| Corrupted or id-skewed entry | Skipped at adoption (POC-proven: no locator crash, no corruption) -> normal behavior |
| Storage unavailable/full | Capture and lookup silently no-op |
| Boundary not allowlisted | Never persisted, never seeded |
| Revalidation rejects | `@catch` arm (never stale-forever) |

## Observability

- Dev mode logs one line per seed: boundary id, build hash, and that
  revalidation was demanded (follows the existing `marklessLog` dev-log
  precedent).
- The storage key prefix is documented so "clear the snapshot cache" is a
  one-liner. No production telemetry is added by this feature.

## Non-goals (sync-engine tripwires)

The cache is boot-read-only, per-tab, and revalidation is unconditional. The
following are explicitly out of scope and must trigger a re-charter, not an
extension: application reads of the cache, optimistic or offline writes,
write logs and conflict resolution, cross-tab propagation, record-level
identity or normalization, suppressing revalidation, TTL policy. A future
record-id cache is a separate package that plugs into the same
snapshot-source seam as a smarter source.

Deferred within this feature (see 08-deferred-decisions.md): a
`revalidate(computed)` core API for manual refresh (returns void — no status
reads; the bump-a-state alias idiom is the documented interim), serializer
secret tiering, per-identity cache keying, and response-header-driven
(`Cache-Control: no-store`) exclusion.

## Validation strategy

POC evidence (browser-mode, production packages untouched):
`packages/vitest-browser/browser/snapshot-resume-{cross-doc,a,b,skew}.test.ts`
on branch `snapshot-resume-poc` — cross-document seeding, zero-pending-frame
sampling, box stability, write-demanded revalidation swap, `@catch`
fallthrough, skew skip, tested opt-out, and the plain-JS baseline's measured
authoring traps.

The production slice must add: capture-at-settle unit tests, demand-set
wiring tests, the D8 hold pinning test for seeded boundaries, fail-closed
allowlist diagnostics tests, buildHash tolerance tests (absent field), and a
real streamed-document seed test (the POC synthesized pending documents;
production must prove the streaming path end-to-end).
