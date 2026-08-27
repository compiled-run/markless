# A shared() method reading a factory computed on a served page

**Date:** 2026-08-27
**Reported by:** the ink build (`goals/headless-components/notes/U611-ink.md`,
"framework walls", finding 1). The row that caught it there was
`a drawing served whole takes a stroke once the page resumes`.

Status: **fixed in the compiler.** Witness written, red on the tip, green after.
No diagnostic was needed — the read is legitimate and now answers.

---

## 1. The witness

`packages/vitest-browser/browser/method-reads-computed/` — a widget family in
ink's shape and nothing else:

- `family/tally.tsrx`: cells `{ seed, own, busy }`, three computeds over those
  cells (`marks`, `label`, `count`), and two factory methods that append to the
  list. `addViaComputed` reads the computed declared beside it —
  `const before = marks; board.own = before.concat(mark)` — which is exactly
  ink's `finish()`. `addViaCells` rebuilds the same list from the cells and is
  the control.
- Parts: `TallyRoot` (seeds `board.seed` from a prop), `TallyArea` (a click
  handler calling `addViaComputed`), `TallyControl` (`addViaCells`),
  `TallyReadout` (renders `label`).
- `tally-page.tsrx` — one root seeded `['a']`. `two-roots-page.tsrx` — two roots
  on one page, seeded `['a']` and `['p','q']`.

Eight rows, four shapes in CSR and SSR. On the tip: **CSR all green, three SSR
rows red.** The read of the computed answered `undefined`, so `before.concat` threw
outright — `TypeError: Cannot read properties of undefined (reading 'concat')`,
raised inside `packages/web/src/fns/instance-scope.ts` on the resume dispatch.
Ink read empty rather than `undefined` only because its `heldPaths(undefined,
undefined, undefined)` answers `[]`; the underlying value is the same nothing.

## 2. What it actually was

None of the three candidates the packet listed. The lowering of the method body
is correct on both paths, and the seed pass does put the computed's served value
where it is told to. The two halves simply disagreed about **where** that is.

A `shared()` method call is spliced into the handler that makes it, so a computed
the method reads is collected as a handler read (`symbol.reads` carries
`shared:…/computed:marks`). A sync computed is not re-derived on a resume until a
dependency is written, so `marklessSsrServeComputed` has to put its render-time
value into the payload for the handler's first read to answer. That part worked:
`TallyArea`'s SSR function derived `marks` and called the serve with its id.

But a payload record can only be written where it lives. Each component's SSR
render selects the payload nodes **it owns**, through
`marklessSelectStateNodes(clone(payloadState), cellIndexes, computedIndexes)`, and
the factory nodes of a widget-scoped family belong to the **widget root**, not to
the part beside it (`resolvePayloadNodeOwners` → `widgetRootComponents`). So:

- `TallyArea` selected computed indexes `[3]` (its own body computed) and served
  `computed:marks` into a payload with no record for it. `marklessSsrServeComputed`
  skips an id it finds no record for — silently, by design, since it cannot know
  a caller meant a record that is not there. The value went nowhere.
- `TallyRoot` owned computed indexes `[0,1,2]` — including `marks` — but its own
  markup names none of them, so `componentDeriveGraphNodeIds` left them out and
  it emitted no derive line and no serve call at all.

The value was therefore derived by a component that could not serve it, and
serveable by a component that never derived it. Nothing was red because both
halves are individually well-formed; the gap is only visible on the page.

## 3. The fix

`packages/compiler/src/passes/public-render/derive-set.ts` gains
`payloadServedComputedGraphNodeIds(input, componentName)`: the sync computeds a
handler reads **narrowed to the ones this component's own payload selection
carries**. `ssr-module.ts` uses it twice, and those are the only two edits:

- the shared-computed derive gate is now
  `componentGraphNodeIds.has(id) || servedComputedGraphNodeIds.has(id)` — the
  owner of a served record derives it even when its own markup never names it;
- the serve list is filtered by the same set instead of by the module-wide
  handler reads — a component that owns no record for an id stops emitting a
  serve line that could never have landed.

A graph node the payload indexes no computed record for at all (a template
expression, a state cell) keeps its old treatment, so no existing serve list
loses an entry.

The served value stays per widget instance, because each root render writes into
its own payload clone — pinned by the two-roots rows, which are among the three
that were red.

No diagnostic and no docs page: reading a factory computed from a method beside it
is a legitimate thing to write, and it now answers. `pnpm docs:errors:check`
reports the catalogue unchanged at 198 codes.

## 3a. What it moves across the 32 shipped families

Every `packages/headless/components/src/*/<family>.tsrx` was compiled on the tip
and again with the fix, and the emitted SSR modules diffed. **30 of 32 are
byte-identical, ink among them.** Two move, and both moves are the bug:

- **numberbox, +980 bytes — a second live instance of this defect, now closed.**
  `NumberboxInput`'s keydown handler reads `numberbox.hasMin` / `hasMax` directly
  (no method involved: `event.key === 'Home' && numberbox.hasMin`). It derived
  both and served them into a payload selection of `[], [10,11,12,13]` — neither
  computed is in it, so the write vanished exactly as ink's did. On a served page,
  before any dependency was written, both read `undefined`, so **Home and End did
  nothing until the first other write**. The root, which owns computed indexes
  `[0..9]`, now derives and serves them. Its 63 ui rows are green either way,
  which is the point: nothing was testing that key on a resumed page.
- **slider, −692 bytes — dead bytes removed, behaviour unchanged.** Three parts
  emitted serve calls for `start` / `end` into selections holding no record for
  them. `SliderRoot` owns and already derived both and already served them, so the
  page was correct all along and the three lines were waste. `SliderThumb` keeps
  serving `computed:now`, which is its own body computed and genuinely its.

So the byte claim is measured, not argued: a family whose handlers and methods
read cells only is emitted unchanged, and the only families that move are the one
that was silently wrong and the one that was paying for nothing. The compiler's
own `emit-byte-equality` suite is green.

## 4. Evidence

- `pnpm exec vp test --project browser packages/vitest-browser/browser/method-reads-computed`
  — 8 passed. On the tip, with only the two compiler files stashed: **3 failed | 5
  passed**, the three being the SSR rows.
- `pnpm exec vp test --project browser …/seeded-write …/nested-widget-outer-write`
  — the two neighbouring shared-seed suites, 32 passed together with the new one.
- `pnpm exec vp test packages/compiler/test` — 217 files, 1720 passed, 1 expected
  fail, including the whole `emit-byte-equality` suite.
- `packages/compiler/test/method-reads-computed/served-method-computed.test.ts` —
  4 rows pinning the mechanism at the emit: the root derives and serves, the part
  serves nothing, the served id is one the root's selection carries, and a
  cells-only method moves no bytes.
- `pnpm exec vp test --project ui` over ink, tour, numberbox and select — 214
  passed. (numberbox's `enter commits and the form still submits` failed once in a
  four-package run and passed alone both with and without the change, twice each;
  it is flake, not this.)
- All 32 shipped families compiled on the tip and with the fix and their SSR
  modules diffed: 30 byte-identical, numberbox +980, slider −692 (§3a).
- `pnpm typecheck`, `pnpm docs:errors:check` (198 codes, in sync), and
  `pnpm exec vp lint --deny-warnings` (0 warnings, 0 errors) — clean.
- `pnpm test:sr-real` and the real-reader lanes were **not run**, per the owner
  rule.

## 5. Can ink's `heldPaths` workaround be retired?

**Yes — with one thing to check on the way, and ink was deliberately not edited
here.**

The workaround is the rule at the top of `ink.tsrx`: every method rebuilds the
drawing from `pad.given` / `pad.strokes` / `pad.seed` through
`heldPaths(given, own, seed)` rather than reading the `paths` computed beside it.
The witness reproduces that shape precisely — a prop-seeded cell, an
`own === null ? seed : own` computed over it, and a method that reads the computed
and writes back — and it is green in SSR now, including across two instances on
one page. `finish()` may go back to `const before = paths; … before.concat(drawn)`.

What retiring it costs, measured on ink as it stands: **today the fix moves ink
not one byte** — its methods read no computed, so nothing enters the handler-read
set and its SSR module is emitted character-for-character as before. `InkRoot`
derives `empty` and `countText` (its own markup), `InkArea` derives `empty`,
`rows` and `current`, `InkField` derives `value`, and no serve call is emitted
anywhere in the family.

The cost appears when the workaround comes out. `InkRoot` will then additionally
derive and serve exactly the factory computeds ink's methods read — `paths` for
`finish`, `undo`, `redo` and `clear`, and whatever else those bodies name once
they are rewritten — at root render time, whether or not the root's own markup
needs them. `paths` is a `heldPaths` call and cheap; `rows`, `value` and
`countText` each walk into `ink-stroke.ts`, so if a rewritten method reads one of
those, a page with a large served drawing pays that walk on the server where it
previously paid none. That is correctness rather than waste — those values are
what the method reads back — but it is a real change in server work, so the
rewrite should prefer `paths` over the heavier computeds where either would do,
and should be checked against the ink browser suite's timings rather than assumed.

Two things the fix does **not** change, so they stay as ink has them:

- cross-module `shared()` method calls are still refused
  (`MARKLESS_SHARED_METHOD_CROSS_MODULE`); ink's quarantined `scenarios/method.tsrx`
  and its pinning row stand.
- a state read nested under a call still has no name to lower to, so the
  "read cells into locals before calling anything" half of ink's rule is
  untouched. Only the "no method reads a computed" half is retired.

## 6. Follow-up for the board

**numberbox has no served-page row for Home / End.** §3a found the key silently
dead on a resumed page and its 63 ui rows never noticed, before or after. The fix
makes it work; nothing pins that it keeps working. A row in
`numberbox.browser.ts` pressing Home and End on an SSR-rendered page as the first
gesture — no other write first, which is what made the read answer `undefined` —
belongs to whoever owns numberbox next. Nothing outside the compiler and the new
witness was edited here, numberbox included.

**The class, stated once so it can be looked for elsewhere.** Any handler on a
part that reads a factory computed of a widget family — through a `shared()`
method or directly — was affected, not only a method read. The emit-level pin in
`packages/compiler/test/method-reads-computed/` covers both, and the family sweep
in §3a is the receipt that ink and numberbox were the only two shipped instances
at this tip.
