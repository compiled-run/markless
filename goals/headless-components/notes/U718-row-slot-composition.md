# U718 — a row's outside read now lands on the composed instance, and costs bytes three walls notice

U716 built the whole path — protocol channel, compiler emit, runtime mint — and stopped one step
short: the row template's slot ids crossed the wire in the child module's own id space while
composition qualified only the repeat's `collectionGraphNodeId`, so the mint read a node the live
graph does not hold and the attribute came back `undefined`. That step is now taken. **The functional
goal is green; three staged byte anchors are not, and raising them is owner-priced.**

## What landed

`marklessCsrRemapChildKeyedRepeat` (`packages/web/src/fns/composition.ts`) now answers with the
repeat's mapped collection read **and** its mapped `rowTemplate`, so the two cannot drift: one call
maps both, and the two child keyed-repeat composition sites in `packages/web/src/fns/ssr.ts` each
write `rowTemplate: mapped.rowTemplate` beside the `collectionGraphNodeId` they already wrote. The
function grew an explicit `mapped` binding because it previously returned from three places and now
has one exit.

`composedRowTemplate` (same file, module-private) walks `textSlots` and `attributeSlots` and puts
every slot carrying a `graphNodeId`/`graphPath` pair through `marklessCsrRemapChildGraph` — the same
helper `marklessCsrRemapChildDomUpdate` uses. A slot reading the repeated item carries no graph id
and rides through untouched.

The arm-scoped record set (`packages/web/src/fns/instance-scope.ts`, inside
`composedBoundaryArmRecords`) takes the qualification that site already applies to
`collectionGraphNodeId`: `marklessComposedGraphNodeId` through the existing `qualifyLooseRead`, not
prop routing. That is the right decision for that site — its comment already says the child's nodes
were merged into the page graph under this path, and its `domUpdates` qualify the same way.

**The cockpit's ruling for an unmappable slot is implemented as ordered.** When
`marklessCsrRemapChildGraph` answers `null` — a read of a prop the invocation site never passed live
— the WHOLE `rowTemplate` is dropped and composition warns, naming the slot (the attribute's name, or
`its text`). No literal third channel, no silent empty value. A slot cannot be dropped on its own:
the mint would then write nothing where the server wrote a value. Dropping the template returns the
repeat to what it did before templates existed — it keeps its served rows and mints none.

`ComposeRowTemplate` is an alias of `MarklessRowTemplate`, newly exported from `instance-scope.ts` and
derived from `ProtocolViewPayload` through `ResumeKeyedRepeatRecord`. The slot shape is not restated
in composition.

## Witnesses flipped

- `packages/vitest-browser/browser/taglist-form-value/taglist-form-value.test.ts` — "a row whose
  attribute reads a cell outside the item still mints", CSR and SSR, is a plain `test` and passes.
  The file's header no longer claims two pinned rows; the method-call row is the one that remains.
- `packages/headless/components/src/taglist/taglist.browser.ts` — "the form field hands back one
  entry per tag under one name", CSR and SSR, is a plain `test` and passes. taglist's real
  `name={taglist.name}` row now mints with the name the served rows carry.

Still pinned, untouched, and unrelated: the expression that CALLS a method on the collection, in both
files. That is U711's second owner question.

## Verification

- `pnpm typecheck` — green.
- `pnpm exec vitest run --project node packages/serializer packages/compiler packages/web` — 344
  files, 2618 passed, 1 expected fail. The resume closure wall
  (`packages/web/test/event-only-resume-closure.test.ts`) is inside this run and holds.
- `pnpm exec vitest run --project browser .../taglist-form-value .../item-collections
  .../repeat-owner-path` — 3 files, 33 passed, 3 expected fail.
- `pnpm exec vitest run --project ui packages/headless/components/src/taglist` — 91 passed, 2
  expected fail, and "the cap refuses the tag past it and says so" red. **That row is a baseline
  flake, measured, not a regression:** stashing this branch's edits and running the same suite on the
  merge base failed the same row twice — once in CSR, once in SSR on the next run. It fails in either
  mode, on the base tree, with nothing of this unit applied.

## The bundler anchors do NOT hold, and this is the open owner question

Three staged budget stages go red. Measured on this tree, `NODE_ENV=test`,
`MARKLESS_CONSUMER_BUILD=1`, repeated and stable to the byte across runs:

| stage | measured | ceiling (anchor + margin) | over |
| --- | --- | --- | --- |
| CSR `page-load download` | 137,362 | 137,256 (137,128 + 128) | 106 |
| SSR `page-load download` | 69,858 | 69,850 (69,722 + 128) | 8 |
| SSR `first-navigation marginal` | 23,515 | 23,461 (23,333 + 128) | 54 |

The base is genuinely under: with these edits stashed, both budget files pass. So the cost is this
unit's, and it is real rather than the nondeterminism the CSR lane's own comment documents — that
comment warns off sub-800 B readings because chunk count moves run to run, but these numbers repeat
exactly, and the delta survived four different codings of the same feature.

**Leanness was pursued before reporting, and the measurements are the evidence:**

- First working version: CSR 137,450.
- Folding the slot map into `marklessCsrRemapChildKeyedRepeat` (one exported symbol instead of two,
  no branching at either `ssr.ts` call site): 137,434.
- Cutting the warning text and the slot descriptor to their short forms: 137,368.
- Hoisting one shared walker into `instance-scope.ts` and calling it from both files: **137,430 —
  worse by 62.** The two files land in different chunks, so the cross-chunk export binding costs more
  than the duplicated inline walk. Reverted; this is a landmine worth remembering.
- Final shape (local walk in each file, protocol-derived types): 137,362.

That is roughly 90 gzip bytes recovered from the first working version, and the wall is still 106
short on the CSR lane. The remaining code is the feature: two array walks, one graph remap per slot,
one warning. There is no further shave that keeps the ruling's warning and the drop behaviour.

**The decision this packet does not carry:** the packet forbids raising an anchor because anchors are
owner-priced, and no coding of this feature fits under the current ones. Either the three anchors rise
by the amounts above (the honest reading: a row that reads outside its item is new behaviour and it
costs), or the feature is paid for differently — for example by moving row-slot qualification out of
the page-load closure entirely, which would need a different design than composition-time remapping
and is not a small edit. Nothing here should land over a wall without that call.
