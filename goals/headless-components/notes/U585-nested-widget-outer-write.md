# A part inside a nested widget writes to the enclosing instance

## What was broken

A widget-scoped `shared()` factory is seeded before any of its parts render: the
projecting child that roots the family runs its own seed and every projected
part's seed into one map, and the whole widget renders from that map. That is
how `otp.item` registers the code's length with `otp.length = index + 1`.

The seed phase ran once per projecting child, and it re-ran **every** seed it
could reach, whatever family the seed belonged to. So when a part of family A
rendered inside a widget of family B, B's own seed phase ran that part's A-seed
again, into B's private copy of the map. One copy per B instance, each holding
only what the parts under that one B wrote.

Measured on the witness page `deep-page.tsrx`: three `Note` parts of the outer
family, each inside its own `Step` widget, registering 0, 1, 2. The outer root
read `count` as 3 — correct — while the reader inside each step read 1, 2 and 3.
Three forked copies of one widget's state.

## What changed

Rooting is per family, not per component. A component that roots family B is
still an ordinary part of family A when an A root encloses it, so B's seed phase
must not mint a copy of A.

The seed map already carries the running instance's token twice: once under a
plain key, and once per family that instance roots. That is enough to answer the
question without any new data. A seed write now runs only when its family's filed
token is the one this pass roots — either the family has no filed token yet
(nobody owns it, so the write starts it) or the filed token is this pass's own.
A family whose filed token names some other instance is one this pass does not
root, so its value is inherited untouched.

Both halves of the framework ask that same question:

- `packages/web/src/fns/shared-seed.ts` — `seedFamilyOpen`, checked in
  `applySharedSeeds`, for the client render path.
- `packages/compiler/src/passes/public-render/shared-seed-pass.ts` —
  `seedFamilyOpenSource`, emitted as a guard around each seed write in
  `sharedSeedPassLines`, for the server render path.

`sharedDefinitionIdOf` in `passes/semantic-graph/collect-shared.ts` reads a
seed's family off its graph node id, beside the `sharedDefinitionId` that builds
those ids, so the two spellings stay together.

No rooting order changed, no prop was added, no family source was touched.

## A correction to the measurement this unit was cut from

The tour note says a family's widget root is the first component in the module
that **resolves** the factory. It is the first component that **seeds** it. The
witness caught this: an `Outer` that only read `outer.count` rooted nothing, and
the compiler handed the family's cells to `Inner`, the first writer — so `Inner`
became the root and forked on every render. Once `Outer` seeded a prop of its
own, as every shipped family's root does, it rooted the family and the remaining
failure was the one described above.

Four of the six rows red on the untouched tip were that fixture mistake, not a
framework defect. The two that survive a correct fixture are the real gap, and
they are the ones this change turns green.

## What this unlocks

**Tour.** `tour.count` now has a writer. A card is a plain part of the tour that
happens to render inside `tour.item`'s own widget, so `tour.count = index + 1`
from the card reaches the tour instance the root reads. The tour keeps
`tour.title` and `tour.description` as parts with per-step IDREFs, keeps
`tour.valuelabel`, and needs no `count` prop on the root. The blocking gap in
`packages/headless/components/src/tour/note.md` is closed at the mechanism, and
the owner decision it asked for is not needed.

**Recursive menu.** A nesting `item` roots its own instance while staying a part
of the enclosing menu, so a submenu's parts can register with the menu that
contains them instead of forking a copy per level.

## Pins

- `packages/vitest-browser/browser/nested-widget-outer-write/` — new, 12 rows,
  CSR and SSR resume: registration by index reaches the enclosing instance from
  a nested widget root and from a part one component deeper; an outer write still
  flows down to both; two sibling outers count only their own parts; a nested
  widget's own write stays local. Two rows are red without this change.
- `packages/compiler/test/nested-widget-outer-write/` — new: each family is
  rooted by the component that seeds it first, and every emitted seed write
  carries the family guard.
- `nested-widget-instances.test.ts` — unchanged, green.
- `own-instance-handle` — the three `pair` rows are still red, exactly as they
  were before this change. Nothing about them moved; they are a different gap.
- The `ui` lane for otp, tree, select, accordion and radio-group — 236 passed,
  6 skipped, no change.
