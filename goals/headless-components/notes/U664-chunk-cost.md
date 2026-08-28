# U664 — the ~20% runtime-chunk jump, priced and recovered

## What the jump was

`fixture-builds` (vite-csr, vite-plus) and the music-player CSR budget went red with
`largest runtime chunk gzip budget exceeded: 6202 > 5162` (vite-plus 6201 > 5165).

U661 restated those anchors at 5,162 / 5,165 on a base without U659. U659
(`arm-registration-qualified`, commit `d943efef`) is the only merge between.

**Priced by revert-measurement, not by reading the diff.** Reverting U659's three web
files on the tip (`resume-branches.ts`, `resume-locators.ts`, `fns/instance-scope.ts`,
everything else untouched) and rebuilding vite-csr returns the largest runtime chunk to
**13,945 raw / 5,151 gzip** — byte-identical to what U661 measured. So the whole
**+3,007 raw / +1,051 gzip** was U659's.

## What made it eager — and it was not new code

Not one byte of the growth is code U659 wrote. Diffing the two chunks' string-literal
sets turns up exactly one new string: an import specifier. The chunk map says the rest:

| | pre-U659 | U659 tip |
|---|---|---|
| dispatch core | `serializer:protocol, fns/instance-scope, resume-events, ssr-data/awaitable` — 13,945 raw / 5,151 gz | the same **plus `resume-locators` and `resume-census`** — 16,952 raw / 6,202 gz |
| locator chunk | `resume-census, resume-locators` — 2,970 raw / 1,282 gz, demand-loaded | *gone — absorbed* |

The mechanism, end to end:

1. `resume-events.ts` — the always-loaded dispatch core — statically imports
   `fns/instance-scope.ts`. That edge predates U659 and is why instance-scope is in the
   eager chunk at all.
2. U659 added `fns/instance-scope.ts` → `resume-locators.ts` so the composed-arm gate
   could install the element-handle qualifier.
3. The bundler's capability groups (`chunking.ts`) run with rolldown's
   `includeDependenciesRecursively` default. `markless-resume-events` is listed *before*
   `markless-resume-locators`, so the earlier group captured resume-locators through the
   new dependency edge and its own group never got it. Two chunks became one.

So a plain click on a page with no `@if` arm paid for the whole locator registry. That
is a genuine progressive-execution regression, and re-partitioning the chunks would not
have fixed it — a static import is loaded either way.

## The fix

Move the qualifier's install slot from `resume-locators.ts` to `resume-arm-records.ts`
(`installElementHandleQualifier` / `qualifiedElementHandleId`), beside the
`ComposedArmRecordQualifier` slot that already serves exactly this pay-per-use pattern.

The direction is the whole point:

- `fns/instance-scope.ts` → `resume-arm-records.ts` — **edge already existed**, so the
  dispatch core takes on nothing new.
- `resume-locators.ts` → `resume-arm-records.ts` — new, but it points *away* from the
  eager side, so instance-scope no longer reaches resume-locators at all.

`register`'s extra arguments stay as U659 left them (`ownerRecordId`, `graph` — one
string and one object reference, no module state). `resume-branches.ts` is unchanged.

## Measured, after

| | before | after | vs pre-U659 |
|---|---|---|---|
| vite-csr largest runtime chunk | 6,202 gz | **5,149 gz** (13,933 raw) | −2 |
| vite-plus largest runtime chunk | 6,201 gz | **5,147 gz** (13,933 raw) | −6 |

The dispatch core is back to exactly its pre-U659 module set, and two bytes *smaller*
than before the qualifier existed — the slot's own text left it too.

### The split the packet asked for

**Recovered: 1,053 gz (vite-csr) / 1,054 gz (vite-plus).** The whole absorption.

**Unavoidable: +40 gz (vite-csr) / +31 gz (vite-plus) on the emitted wall.**
`resume-locators` + `resume-census` standing as their own demand-loaded chunk gzip
worse than they did merged into the dispatch chunk — two dictionaries, not one — plus
the ~330 chars of the slot itself. That is the price of those bytes not being eager,
and it is the entire residue.

Anchors restated to measurement: vite-csr `5_162 → 5_160` (measured 5,149, margin 11)
and emitted `23_604 → 23_644`; vite-plus `5_165 → 5_159` (measured 5,147, margin 12)
and emitted `23_552 → 23_583`. Both largest-chunk walls **tighten**.

### The one debt this leaves — and it is real

`event-only-resume-closure.test.ts`'s source-closure wall went **20,983 → 33,510**:
`resume.ts` now reaches `resume-arm-records.ts` (13,633 chars) through resume-locators,
less the 791 chars of slot text that left resume-locators. Exactly +12,842, one file.

**This proxy over-prices the edge, and the measurement says so.** The wall exists to
predict chunk bloat; the shipped number moved the other way. arm-records' chunk is
loaded on every page regardless (instance-scope statically imports it), and
resume-locators' chunk already imported that same chunk via `inline/resume-errors.ts`.
`resume.ts` fetches zero extra bytes.

The slot is ~330 chars. In its own module it would have cost this wall ~350 instead of
12,842. The file contract allowed exactly four web files and the smallest of them that
instance-scope already imports is 13,633 chars, so the slot went into a module 40×
bigger than it needs. **That module is the repayment and it is owed.**

## Second item: the build was not reproducible

U661 found the music-player CSR `page-load download` stage moving run to run —
135,182 / 135,982 / 135,788 gzip, and the chunk **count** with it (106 / 107 / 107).

Reproduced here: three builds of `demos/music-player` on one unchanged tree emitted
**111, 109 and 108** chunks, with different content hashes and different code. The
size-mapped chunk composition was identical every time, so the variance was in how the
symbol facades collapsed on top of it.

**Cause:** `forceImportedModules` in `packages/bundler/src/link-driver.ts` loaded each
module's claim sources through `await Promise.all(plan.claimSources.map(...))`. Module
registration therefore landed in *completion* order, so an unchanged tree produced a
different module order, different facade collapsing, and a different chunk graph.

**Fix:** the loads are sequential. Three consecutive builds now emit byte-identical
manifests (111 chunks, same hash).

**Pinned:** `packages/bundler/test/build-determinism.test.ts` builds the demo twice and
compares both the chunk file names and the module set per chunk (keyed by module set,
never by file name — the name is a content hash). Verified non-vacuous: with the
link-driver fix reverted the test fails, 109 vs 107 chunks.

### What that means for the music-player anchor

The old `page-load download` anchor of 135,982 was the highest of three *nondeterministic*
samples. With the build settled, the reproducible value is **136,775**, and a
revert-measurement of the three qualifier web files on this tree puts ~77 B of that on
the qualifier family — the same order as the +40 / +31 residue the vite fixtures show.
The rest is the graph settling: the old anchor was not a smaller build, it was a luckier
sample.

This lane modulepreloads nearly every chunk it emits, so the 1,053 B recovered from the
fixtures' largest runtime chunk does **not** come back here — splitting one eager chunk
into two eager chunks costs this stage a little rather than saving it. Anchor restated
`135_982 → 136_775`, margin 128 unchanged.

## Behaviour

U659's behaviour is untouched and proven: `handle-in-arm` (all rows including
`two-widgets`), `enclosing-family-read`, `own-instance-handle`, `idref-per-instance`,
plus the progressive-execution gates — 12 files, 56 tests, all green. No raw-id fallback
reintroduced.

## Not mine

`packages/bundler/test/inline-resumer.test.ts` and
`packages/bundler/test/self-route-recursion.test.ts` fail with 4 tests red on this
branch, from a compiler error in `packages/headless/components/src/tree/scenarios/deep.tsrx`
(`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`). Confirmed pre-existing: the same 4 failures
reproduce with every change in this unit stashed. That file belongs to another live unit.
