# 13. Resume Cache: Refresh-Stable Boundaries via Persisted Settled Snapshots

Status: SPECIFIED, NOT IMPLEMENTED (POC-validated 2026-07-08 — goal
`snapshot-resume-poc`, commit `196da51` on branch `snapshot-resume-poc`;
measured matrix: `goals/snapshot-resume-poc/notes/comparison.md`;
adversarially reviewed 2026-07-09 via two cross-model critique lanes +
owner talk-out — the boot contract, failure table, and observability
sections below reflect that adjudication).
Charter after the scoped-errors tranche clears: rejected-revalidation
containment (`@catch` fallthrough) is a hard dependency.

## Motivation

A refresh of a page whose content lives in async boundaries replays `@pending`
for data the user was just looking at. On suspense-heavy pages this is a
full-page flicker and CLS event on every reload. Resumability already
serializes every settled boundary's state into the payload protocol; this
feature points that same payload at the previous document: persist settled
boundary snapshots client-side, seed them into the next document as
settled-stale, and revalidate in the background. Because entries are keyed by
route and the seam is graph-construction input (shared by resume and CSR),
the same entries also seed RETURN NAVIGATIONS (A -> B -> back to A) through
the CSR render path. `@pending` becomes something a user sees only on a
genuinely first visit.

One sentence: the resume cache persists settled GRAPH DATA — computed
snapshots and boundary records, keyed by session scope, build, and route —
and any render path boots its graph from those snapshots and immediately
re-verifies them.

## What is cached: graph data, not pages

Cache entries are serialized graph state (the payload protocol's own
computed-snapshot and arm-record shapes), NOT documents, pages, or component
output. The cached boundary HTML is the resume path's materialization
fast-path only (fill the range without a boot-time symbol fetch); on the CSR
path the cache is pure data and the HTML field is unused.

"Resume" names the operation, not the transport: in the unified
runtime/render model, resuming means constructing the graph from serialized
snapshots instead of re-deriving them. The snapshot source can be the server
payload (classic resume), a streamed patch, or this cache (the previous
session's own graph) — a CSR mount seeded from the cache is resuming from
the previous session. This is the same client-side serialized-state posture
sync engines are built on, restricted to the read half: local snapshots are
a render seed with the server always authoritative, never a writable
replica.

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

## Default posture and configuration contract (router plugin)

The resume cache is ON BY DEFAULT (owner ruling 2026-07-09: the framework
ships the best defaults with a way to opt out; opt-in features are never
found). Config is build-time on the router Vite plugin and travels to the
browser through the existing virtual-module mechanism:

```ts
router()                                          // default: on, session-scoped
router({ resumeCache: { exclude: ['ticker*'] } }) // never-cache regions
router({ resumeCache: false })                    // kill switch: zero cache code emitted
```

- Default-on is made safe by SESSION SCOPING (below), not by configuration.
- `exclude` lists graph-node names (the compiler's name-based
  `computed:<name>` ids; glob suffix allowed) that must never be persisted.
  An entry that matches no graph node in the build is a BUILD ERROR
  (fail-closed), so renaming a state/computed local cannot silently change
  caching behavior. The diagnostic must name the unmatched entry and list
  near-miss candidates.
- `resumeCache: false` emits zero cache code (entry-level split, not a
  runtime branch).
- Serializer secret tiering remains deferred DEFENSE-IN-DEPTH for `exclude`
  mistakes; it is not the safety mechanism.

### Session scoping (the default-on safety invariant)

Every cache entry is scoped to an opaque SCOPE TOKEN minted server-side by
the router's server entry and shipped in the payload. The token participates
in every cache key. Invariant: THE CACHE ONLY EVER RE-SHOWS CONTENT TO THE
SESSION THAT ALREADY SAW IT. A login, logout, or user switch rotates the
session, which rotates the token, which makes prior entries unreachable by
construction — no cleanup code, no auth API, no framework knowledge of what
auth is. Sessionless apps get a constant token (their content is sessionless
by definition). Within one session, unconditional boot revalidation bounds
staleness.

Charter-blocking open questions:
- Default scope-token derivation (candidate: server-side digest of the
  session-identifying request state; must not rotate on every request).
  Apps may override via config (an app-provided token function).
  Serverless/static CSR deployments have no server entry to mint the token:
  the rule is FAIL CLOSED — no derivable scope token means the cache
  disables itself (every lookup misses) until the app provides `scope` in
  config. Default-on holds wherever the framework controls the server;
  elsewhere the default is safety.
- Graph-node name scoping when two components declare the same local name.
  If payload ids can collide, `exclude` entries must gain a component
  qualifier.

## Cache entry and keying

A cache entry is the SAME protocol shape the streaming path emits when a slow
boundary settles after the shell was sent: the boundary's arm-record set, the
computed's fulfilled snapshot (`markless/state-patch` shape), and the settled
HTML of the boundary range. No new serialization format is introduced.

Key: `markless:resume:<scopeToken>:<buildHash>:<route>:<boundaryId>`.

- `buildHash` is a new OPTIONAL, ADDITIVE payload field stamped at build time.
  Boundary/symbol ids are compiler counters that renumber on structural edits;
  keying by build hash makes every deploy a cache miss by construction, so a
  stale entry can never produce a matching-but-wrong seed. Decoders MUST
  tolerate its absence (protocol version stays 1).
- Storage is a per-tab Web Storage target behind an injected
  `{ getItem, setItem }` capability (the `MarklessExecutionLogStorage` idiom),
  guarded with try/catch. `sessionStorage` per-tab scoping is a design choice:
  tabs never share seeds, which removes multi-tab consistency from scope.
- EVICTION IS BYTE-PRESSURE MANAGEMENT, NOT FRESHNESS POLICY (TTL remains a
  non-goal): a per-entry size cap plus a total byte budget with LRU eviction.
  Over-cap captures are skipped silently in production and logged with a
  reason in dev, so "works on small pages, not big ones" is bounded and
  diagnosable rather than mysterious.
- Dev builds key by the HMR `devRenderStamp` instead of `buildHash`: every
  dev edit is a cache miss, so stale seeds can never survive an HMR update.

## Capture contract

- Capture happens ONLY when a non-excluded boundary settles `fulfilled`.
  Pending and rejected snapshots are never persisted.
- Capture happens AFTER settle commit (save must not race restore or persist
  mid-revalidation state). While a revalidation is in flight, the previous
  entry remains valid.
- Capture serialization is coalesced to idle time — never on the settle hot
  path — so interactive apps that settle boundaries continuously (search,
  filters, pagination) do not pay per-settle serialization cost.
- Any capture failure (quota, blocked storage, serialization error) is a
  silent no-op in production and a dev diagnostic naming the boundary and
  cause. Capture must never affect rendering.

## Boot contract (seed + revalidate)

The cache seeds GRAPH DATA, not documents. Initial render and browser resume
are two phases of one unified runtime/render model, so the adoption seam is
the graph-construction input shared by both paths: entries matching the
current scope + `buildHash` + route patch the computed snapshot (and arm
records) in that input before the graph is constructed. The resume path
reaches this seam through the same mechanism streamed arm patches use today
(`markless/arm` + `markless/state-patch` merging into the decoded payload);
the CSR path patches its own graph-construction input directly. After
adoption, each path materializes a settled boundary the way it already does:

- Resume does not execute components: the boundary range is filled from the
  cached HTML (fast path — no update-symbol fetch at boot, preserving the
  preload-integrity doctrine).
- CSR executes components: it renders the `@try` arm from the seeded value;
  the cached HTML field is unused on this path.

The refresh contract, stated once: a refresh ALWAYS refetches; the cache
changes what the user sees WHILE that happens, never WHETHER it happens.

Boot sequence for both paths:

1. HIT PRECONDITIONS: scope token + `buildHash` + route match, AND the fresh
   boundary's dependency key must equal the entry's stored key (the computed
   snapshot's own `key` identity). A changed dependency — e.g. a search param
   the computed reads — is a MISS, so seeding stale results for a different
   query is structurally impossible. On a hit, the boundary is settled in the
   graph-construction input and materialized per path (above): immediate
   paint, no `@pending` frame, no layout shift, interactive without component
   execution.
2. ONE REVALIDATOR PER BOUNDARY. If the served document promises a stream
   patch for the boundary (streamed pending documents), THE STREAM IS THE
   REVALIDATOR: the seed fills the wait, the arriving patch is fresher than
   the cache and commits through the same swap discipline, and the demand set
   must NOT double-run the computed. A deadline fallback demands the computed
   if a promised patch never arrives. Every seeded boundary with no promised
   stream enters a per-node DEMAND SET and its async computed is demanded at
   start. On the resume path this is a deliberate, scoped deviation from the
   demanded-execution doctrine (SSR-resumed pages stay lazy): POC measurement
   proved seeded boundaries never revalidate on their own, and unconditional
   revalidation is a non-negotiable guardrail. The mechanism generalizes the
   existing CSR `demandOnStart` flag to a node set; on the CSR path
   demand-at-start is already the rule, so a seeded CSR mount is simply
   "demand at start with a starting value".
3. While the re-run is pending, the re-settle hold keeps the seeded content
   visible (no `@pending` flash — the D8 hold behavior for boundaries whose
   `@pending` arm was never shipped is the CONTRACT here, not a gap; a pinning
   test must protect it). COMPATIBILITY INVARIANT: any future
   compiler-emitted pending renderer (the fix the resume-resettle-hold module
   comment requests) MUST exempt boundaries that already show settled
   content — seeded or server-settled — so this contract survives that fix.
4. Re-run fulfilled with equal data: no visible change (a refresh where
   nothing changed is pixel-identical). Fulfilled with different data:
   in-place atomic boundary swap with no intermediate frame. Rejected: the
   `@catch` arm replaces the seeded content through containment.
5. bfcache restores bypass this boot entirely, so a `pageshow` listener
   (`event.persisted === true`) re-runs step 2's revalidator selection —
   "revalidation is unconditional" must hold on the browser-controlled
   restore path too.

## Failure contract

Every failure path is a cache miss, never a new failure mode:

| Situation | Required behavior |
| --- | --- |
| First visit / no entry | Normal `@pending` -> settle |
| Deploy (buildHash changed) | Key miss -> normal behavior |
| Id-skewed entry (well-formed, unknown ids) | Skipped at adoption (POC-proven: no locator crash, no corruption) -> normal behavior |
| Malformed entry (truncated/invalid JSON) | MUST be caught, treated as a miss, and the entry purged. NOTE: today's adoption path THROWS on malformed patch scripts (resume-stream-patches.ts: "a malformed patch script throws — never half-adopt") because streamed patches are compiler-emitted and trusted; cache entries are client-written (quota truncation, interrupted writes) and are NOT trusted input. The cache adoption wrapper must add this catch — a required behavior change the POC did not cover |
| Storage unavailable/full | Capture and lookup silently no-op |
| Excluded boundary | Never persisted, never seeded |
| Scope token rotated (login/logout/user switch) | All prior entries unreachable -> normal behavior |
| Revalidation rejects | `@catch` arm (never stale-forever) |

## Observability (the 2am contract)

Historical review of comparable systems (Next.js caching, service workers,
Turbo, bfcache) shows the dominant hate-generator is not caching defaults but
the missing answer to "why is my page showing old data RIGHT NOW". This
feature's answer must be inspectable in production:

- Every seeded region carries a `data-markless-seeded` attribute from paint
  until its revalidation commits. Inspectable in devtools on any production
  page, assertable in tests, removed on swap/`@catch` — zero telemetry.
- Dev mode logs one line per SEED (boundary id, key, which revalidator owns
  it) and one line per SKIP with the reason (over-cap, malformed-purged,
  excluded, dependency-key mismatch, scope miss) — silence is never
  ambiguous. Follows the existing `marklessLog` dev-log precedent.
- The storage key prefix is documented so "clear the resume cache" is a
  one-liner. No production telemetry is added by this feature.
- Documentation must ship the a11y guidance (aria-live for volatile cached
  regions) and analytics guidance (seeded paints are distinguishable via the
  attribute) alongside the feature.

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
secret tiering (defense-in-depth for `exclude` mistakes), and
response-header-driven (`Cache-Control: no-store`) exclusion — headers are
gone by capture time, so the framework's no-store equivalent is DECLARED
(`exclude`), not sniffed; the deferred header-driven variant would require
fetch-layer visibility. Consent gating needs no new mechanism: `scope`
returning null fail-closes the cache off until consent exists.

Superseded decision record: a v1 opt-in `include` allowlist was specified on
2026-07-08 (DX-review reasoning: no secret tier + blocklists fail open) and
overruled on 2026-07-09 by the default-on ruling; session scoping replaced
identity-keyed opt-in as the safety mechanism. Do not reintroduce opt-in.

## Validation strategy

POC evidence (browser-mode, production packages untouched):
`packages/vitest-browser/browser/snapshot-resume-{cross-doc,a,b,skew}.test.ts`
on branch `snapshot-resume-poc` — cross-document seeding, zero-pending-frame
sampling, box stability, write-demanded revalidation swap, `@catch`
fallthrough, skew skip, tested opt-out, and the plain-JS baseline's measured
authoring traps.

The production slice must add: capture-at-settle unit tests, demand-set
wiring tests, the D8 hold pinning test for seeded boundaries, fail-closed
exclude diagnostics tests, scope-token rotation tests (rotated token must
make prior entries unreachable), sessionless constant-token tests, buildHash tolerance tests (absent field), a
real streamed-document seed test (the POC synthesized pending documents;
production must prove the streaming path end-to-end), a CSR seed test (the
POC validated document-path seeding only; graph-input seeding on a CSR mount
must prove @try-with-cached-value first paint, demand refetch, and the D8
swap), scope-token derivation tests against real cookie configurations
(stable within a session; rotates across login/logout; fail-closed when
underivable), a malformed-entry test (truncated JSON must be caught, treated
as a miss, and purged — current adoption throws on malformed patches, so
this is a required behavior change), a multi-boundary scale measurement
(capture cost and boot adoption cost on a page with dozens of boundaries),
and a `pageshow persisted` demand test (bfcache restore must revalidate).
