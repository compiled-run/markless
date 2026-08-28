# An `@if` arm now tells a roster to count again — and the shipped-byte wall says no

The carried-forward limit U719 recorded is half closed. `wireRosterRevisions`
subscribed keyed-repeat collection writes and nothing else, so a page with no
repeat anywhere never re-derived a position after paint. Arm application and
removal is now the second channel, and it lands: **positions renumber both ways,
CSR and SSR, on a page with no keyed repeat.** What does not land is the count,
and what blocks the change from shipping is a bundler gzip wall.

## The witness

`packages/vitest-browser/browser/item-collections/ic-arm-page.tsrx` — two
instances, flat items, **no keyed repeat anywhere on the page**. The first
instance's leading roster member is gated by an `@if` arm a handler in the family
flips (`IcArmToggle` → `w.toggleArm()`), so the arm applying or dropping is the
only thing that moves the collection.

Six new rows in `item-collections.test.ts`, on a suite that is now **52 passed,
2 expected fail (54)**, up from 48:

| row | before | after |
| --- | --- | --- |
| CSR/SSR: an @if arm joining the roster renumbers the flat items behind it | `['0','1','2']` | `['1','2','3']` green |
| CSR/SSR: dropping the @if arm renumbers the flat items behind it | stuck at `['1','2','3']` | `['0','1','2']` green |
| CSR/SSR: the count follows an @if arm applying and dropping | `['3','2']` | `['6','2']`, wanted `['4','2']` — pinned `test.fails` |

The arm's member carries **no** `ui-pos` of its own: the compiler refuses an
attribute binding inside a flippable arm
(`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`, "it holds an attribute binding"), and
refuses a component in one for the same reason ("`<IcItem>` has to run to produce
its content"). So the arm holds `<div data-ic-extra el={w.itemEls}>`, which is
the shape `aeh-arm.tsrx` already proves compiles, and the flat items *behind* it
are what renumber. That is the same fact under test either way.

## Two id spaces, measured rather than assumed

Instrumenting the arm's registration and the roster's re-derive printed:

| what | id |
| --- | --- |
| arm handle record (registration) | `handleId: "shared:<abs>/ic-widget.tsrx#ic/element:itemEls"`, `name: "itemEls"`, `plural: true`, `hostNodeId: "h4"` |
| roster node (`wireRosterRevisions`' `rosters`, and the count reader's argument) | the same string |
| the count computed asking | `c0:computed:IcArmRoot.total`, instance path `c0:` |

So the two ends already agree: an arm record's `handleId` **is** the element
binding's graph node id, `<definitionId>/element:<name>`, which is exactly what
`isElementBinding` gates on and exactly the cell `wireRosterRevisions` bumps.
No respelling is needed on the arm side, unlike U719's host/symbol fold.

## The fix

`fns/roster-resume.ts` (demand-loaded, named by no eagerly-loaded module) gains
two exports, and `wireRosterRevisions`' inline loop becomes a call to the first:

- `bumpRosterRevisions(graph, ids)` — the write, shared with the keyed-repeat
  channel.
- `bumpArmRosterRevisions(graph, branches)` — folds every `elementHandles`
  record across every arm of each flipped branch into an id set and bumps it.
  The whole set, not just the arriving arm's: which of them are registered is
  exactly what a flip changes, and a bump on a binding no derivation depends on
  is a number written into a cell nobody reads.

`resume-branches.ts` collects the flipped branches inside
`materializeFlippedBranchArms` and calls through `resume-arm-records.ts`. The
call sits AFTER the loop, which is the one correct moment: `resume-runtime-start`
runs `disposeRemovedRangeHosts` (removed hosts unfiled) → `applyDomJournal` →
`materializeFlippedBranchArms` (arriving handles filed), so the registry has
settled when the parts are asked to count again. One bump per journal
application, no polling, no rAF.

`resume-arm-records.ts` holds only the global lookup, because it is already
dynamically imported from `resume-branches.ts` twice and is deliberately kept out
of resume's static closure.

## What does NOT land: the count, and why

`ui-max` answers **6** — every item on the page — instead of 4. Measured at the
moment of the arm-driven re-derive:

```
computed c0:computed:IcArmRoot.total | instance path c0: |
widget registry {"rootPaths":{},"rowRooted":{}} | roster length 6
```

The widget registry is **empty**, so `marklessWidgetHandleId` returns the
unqualified id, `marklessInstanceScopedElementHandle` takes its
`scoped === handleIdOrName` fallback, and the reader counts both instances.
The positions are right only because instance one stands first in the document.

This is not the arm channel's bug — it is `createRosterCountReader`'s scoping,
and the flat and mutating pages never reach it (their counts are answered by the
render/row-mint path, which is why `createRosterCountReader` never ran once
across the whole suite before this card). Qualifying that read means
`fns/instance-scope.ts` or the composition registry, both outside this card's
contract. The two count rows are pinned `test.fails` with the measurement in a
comment beside them.

## Bytes: the resume wall holds, the bundler wall does not

**`event-only-resume-closure.test.ts` is green (9 passed).** `resume-branches.ts`
is one of the governed on-demand entries and its closure had ~242 bytes of
headroom against the 20,970 wall — the first shape of this change spent 1,342 and
measured **22,277**. Paid down to a net **20,449 → 20,445 (−4)** by moving the
fold into the demand-loaded module and dropping two comments the file did not
need: the IDREF/painted-arm note, restated in full by `syncBranchIdrefSites`'s
own doc comment, and one sentence off `isDecidedBranch`.

- `fns/roster-resume.ts` 9,113 → 10,781 (+1,668), inside its own headroom;
  nothing eagerly loaded reaches it.
- `resume-arm-records.ts` 12,354 → 12,885 (+531); deliberately outside resume's
  closure, which the same test still asserts.

**The bundler fixture wall is red, and it is the blocker.** `pnpm exec vitest run
--project node packages/bundler`:

```
@fixtures/vite-csr   emitted runtime gzip wall exceeded: 23715 > 23644  (+71)
@fixtures/vite-plus  emitted runtime gzip wall exceeded: 23670 > 23583  (+87)
```

Those are attributed bytes — the bump's own emitted code, reached from
`resume-branches.ts`, which every page with a branch ships. Both fixture rows
were GREEN at the tip (baseline of the three bundler budget files run alone: 1
red, 9 green; with this change: 6 red, 4 green — the four extra are these two
plus the two music-player staged-budget rows that count the same chunks).

Raising the wall is forbidden and was not done. The two shapes tried:

1. bump reached through `resume-arm-records.ts` (current): resume closure green,
   fixture wall +71/+87.
2. bump reached straight off `globalThis.__marklessRosterResume` from
   `resume-branches.ts`: keeps the roster module out of the branch chunk, but the
   loader's type costs ~200 raw bytes in `resume-branches.ts` and the resume
   closure goes **21,167 > 20,970**.

Neither fits. Landing this needs either a byte repayment inside
`resume-branches.ts`'s closure to afford shape 2, or the branch runtime handed a
roster loader it does not have to type itself — and that slot is built in
`resume-runtime.ts`, outside this card's contract.

## Carried forward

- The count's widget-instance scoping at re-derive time (empty registry), owner
  of the two `test.fails` rows.
- The fixture gzip wall repayment, which is what stands between this and green.
- A prop-tested arm inside a projected component fails a different way, worth its
  own card: `Unknown async symbol symbol:13` from `replaceArmRange`, the arm's
  update symbol missing from the module's symbol table, hit while shaping this
  witness.

## Verification

- `pnpm typecheck` — clean for every file this card touches. Three
  `packages/headless/components/src/rating/*` errors are pre-existing on the
  pilot tip and untouched here.
- `pnpm exec vitest run --project node packages/web packages/bundler` — 1,152
  passed, 6 failed; all six in `packages/bundler`, five of them caused by this
  change (see above), `packages/web` fully green including the closure wall.
- `pnpm exec vitest run --project browser packages/vitest-browser/browser/item-collections`
  — 52 passed, 2 expected fail, exit 0. `browser/handle-in-arm` does not exist,
  so it was dropped from the command.
