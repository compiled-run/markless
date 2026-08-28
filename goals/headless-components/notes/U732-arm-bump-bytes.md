# The arm channel lands for nothing, because the journal already reports the flip

U727's arm-roster bump was correct and unshippable: it cost +94 / +85 gzip on
the two fixture walls it had to fit under. It ships here at **zero measured
bytes on both**, because the channel moved into the one module that was already
demand-loaded and already knew the rosters.

The four position rows are green. The two `test.fails` count rows stay pinned.

## What actually changed

Thirteen lines in `packages/web/src/fns/roster-resume.ts`, and nothing else in
`packages/web`. `resume-branches.ts`, `resume-arm-records.ts` and
`resume-runtime-start.ts` are byte-identical to the pilot tip.

`wireRosterRevisions` already holds `rosters` — the element() binding node ids
some computed on the page depends on — and already holds a `bump()` that writes
each one's revision. It gains a second trigger beside the keyed-repeat
subscription:

```ts
input.storeContainerSubscription(
	input.graph.subscribeJournal((entries) => {
		if (entries.some((entry) => entry.locator.startsWith('branch:'))) bump();
	}),
);
```

Plus one type member, `subscribeJournal: RuntimeGraph['subscribeJournal']`,
imported from the graph that owns it rather than restated.

**The ordering is the whole reason this is allowed to be this small.**
`notifyJournalListeners` awaits its listeners in registration order
(`packages/runtime/src/graph.ts`), and `resume-runtime-start.ts` registers its
own journal listener — the one that runs `disposeRemovedRangeHosts` →
`applyDomJournal` → `materializeFlippedBranchArms` — before it calls
`wireRosterRevisions`. So this listener is second, and it runs strictly after the
arriving arm's handles are filed and the removed ones unfiled. That is exactly
the settled moment U727 identified, reached without the branch runtime having to
call anything.

Writes made here land in `dirtyPaths` and `runFlush`'s `finally` re-arms
`scheduleFlush()`, so the re-derive is applied by the follow-up pass. No polling,
no rAF.

`branch:` matches both halves of a flip (`removeRange branch:<id>` and
`insertRange branch:<id>:start`), so applying and dropping are one predicate.

### What it bumps, and why that is the tighter set

U727 folded each flipped branch's `armRecords[*].elementHandles[*].handleId`
into an id set. This bumps `rosters` instead: the bindings a derivation on the
page actually depends on. Broader in one direction (a branch flip unrelated to
any roster still bumps), narrower in the direction that matters (it never writes
a cell no derivation reads, which is the cost U727's own note names). The bump is
a revision counter, so a redundant one re-derives positions and writes nothing
else.

## Bytes, measured

Every number below is a local build of the fixture, gzip of the runtime-heavy
emitted chunks, on this worktree.

| shape | vite-csr (wall 23,644) | vite-plus (wall 23,583) |
| --- | --- | --- |
| pilot tip `f506b7c7`, nothing applied | 23,600 | 23,556 |
| U727 as merged (bump via `resume-arm-records.ts`) | 23,694 **red** | 23,641 **red** |
| bump handed back to `resume-runtime-start.ts` | 23,603 | 23,556 |
| **journal listener inside `fns/roster-resume.ts` (shipped)** | **23,600** | **23,556** |

The shipped shape is the tip to the byte. Neither wall was touched.

Two facts made this possible, and both were measured rather than assumed:

- **`fns/roster-resume.ts` growth is free on these fixtures.** Putting U727's
  whole `+1,668` bytes of roster-module growth in with the branch files reverted
  measured 23,600 / 23,556 — the tip exactly. The module's added exports do not
  survive into the emitted set for a fixture that never reaches them. So any code
  that can live in this module costs nothing here.
- **The cost was the branch path.** The `+94 / +85` was `resume-branches.ts`
  collecting the flipped branches and reaching `resume-arm-records.ts`, whose
  wrapper it pulled along. The middle row above prices the intermediate shape:
  moving the trigger to `resume-runtime-start.ts` recovers all but 3 bytes, and
  moving it into the roster module recovers those too.

**The resume closure wall (20,970) is untouched**, because `resume-branches.ts`
is untouched. `packages/web/test/event-only-resume-closure.test.ts` is green.
U727 had to spend and then repay ~1,342 bytes inside that closure; this shape
never enters it, so the repayment U727 owed does not exist.

## A merge defect the two cards only have together

U727's four position rows are red on the merge of U727 and U731 **regardless of
which bump shape is used** — confirmed by running U727's own shape on this tree.
Neither card has the bug alone.

U731 gave `IcItem` a dependent derivation, `char = w.code.slice(pos, pos + 1)`.
U727's witness page roots its first instance in `IcArmRoot`, the root holding the
flippable `@if`. On that instance `w.code` reads **undefined** on the client, so
`char` throws inside `refreshSyncComputed`, which throws out of `runFlush` — and
the flush it kills is the one carrying the renumbering. The rows failed with
`['0','1','2']` and a `TypeError: Cannot read properties of undefined (reading
'slice')` unhandled rejection, and went green the moment the read was guarded.

This is the same root cause U727 pinned for the count: the arm-rooted instance's
widget registry is empty (`{"rootPaths":{},"rowRooted":{}}`), so nothing
qualifies that instance's reads. It is not only the roster count reader — the
instance's own shared state cells read undefined too.

Measured, not assumed: giving `IcArmRoot` a handler that reads `w.code` (the same
`data-ic-write` button `IcRoot` carries) does **not** seed the cell, so this is
not the "served only where a handler reads it" payload rule. The read is not
being qualified at all.

The witness keeps one item part — the arm rows exercise the exact item every
other page uses — and the read is guarded at the site with a one-line pin. The
arm rows assert positions; `ui-mine` is asserted on the pages whose instances
resolve.

## Still red, and not this card's bytes

`packages/bundler/test/music-player-csr-budget.test.ts` "page-load download"
fails, and it fails identically with this card's whole change reverted:

```
pilot tip f506b7c7, packages/web/src reverted   137,637   (anchor 137,243 + 128 = 137,371, over by 266)
this card                                       137,637   (+0)
```

This card adds **zero** bytes to it, so there is no remainder to attribute and no
anchor raise is taken. The 266 arrived on the pilot tip before this card. U731
measured the same overrun at 137,558 against an earlier tip and also left it
un-raised, naming +41 of it as its own `resume-runtime-start.ts` gate; the rest
accrued elsewhere in the pilot and bisecting it is its own card's work. Raising
an anchor by bytes nobody has attributed is the move the anti-bloat doctrine
exists to prevent, so it was not made.

Everything else in the ordered lanes is green: `pnpm typecheck` clean;
`--project node packages/web packages/bundler` 1,159 passed / 1 failed (the row
above); `--project browser` item-collections + single-component-family 72 passed,
2 expected fail.

## Carried forward

- **The empty widget registry on an arm-rooted instance** now owns three
  symptoms, not one: the count (`ui-max` answers 6 for 4), and the instance's own
  shared cells reading undefined after resume. Both the pinned `test.fails` rows
  and the `char` guard in `ic-widget.tsrx` come off when it is fixed.
- **The music-player page-load anchor is 266 over on the pilot tip**, unattributed.
- U727's third finding stands: a prop-tested arm inside a projected component
  fails with `Unknown async symbol symbol:13` from `replaceArmRange`.
