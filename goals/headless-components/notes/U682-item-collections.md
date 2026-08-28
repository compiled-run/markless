# A family cannot count its own items while rendering

The ruling is that no consumer ever passes a family an index: a repeated part's
position is its place in the family's own collection, in render order, in both
CSR and SSR.

Three families take one today — `tour.item`, `otp.item`, `toaster.item`. One of
them could give it up immediately. The other two cannot, and the reason is not
in the families at all. It is two compiler gates that between them leave a
rendering item with no expression that knows how many items came before it.

## What shipped

`toaster.item`'s `index` was dead surface. It was declared on
`ToasterItemProps` and mirrored on `ToasterItemInstanceState`, seeded to `0` in
the item factory, and read by nothing: not by `ToasterItem`, which never
destructured it, not by any part inside a row, not by any scenario. A row's
place already comes from `positionOf(toaster.queue, item.id)` — the queue's own
order, which is the order the consumer's repeat renders. Both declarations and
the seed are gone; the toaster lane is unchanged at 18 passed / 1 expected fail.

(Checked for readers: every file under `packages/headless/components/src/toaster`
including its scenarios, and a repeat-wide search for `toaster.item` with an
`index` attribute. This is not a guessless receipt, so it is what those sites
show rather than a claim about every reference in the repo.)

The general witness is at `packages/vitest-browser/browser/item-collections/`,
and it is **red on purpose** — 11 failed, 9 passed. It is deliberately not
marked `test.fails`, because a green file would hide a capability the library
does not have.

## Why tour and otp are blocked

Both need the ordinal while RENDERING, not after a gesture. `otp.item` paints
`value.slice(i, i + 1)` as its character and the field's `maxlength` is the box
count; `tour.item` decides `hidden` from `step === mine`. First paint is the
whole job.

Three routes were built and run. Each is refused by a different named gate.

**A render-order counter on the widget instance.** `item.pos = w.count` then
`w.count = w.count + 1` in the item's body. Refused with
`MARKLESS_SHARED_SEED_UNSUPPORTED`, from `isUnloweredSharedSeed` at
`packages/compiler/src/passes/state-lowering.ts:570`. That function is the whole
answer: a component-body write into a shared instance is turned into a
per-instance initial value, and it admits only this component's own props plus
the literals `true`, `false`, `null`, `undefined`, `NaN`, `Infinity`. A sibling's
count is neither. This also refuses `otp`'s existing `otp.length = index + 1`
the moment `index` stops being a prop.

**A factory method called from the body.** `const mine = w.register()` with the
method bumping and returning the old value. This one compiles, then throws at
run time: `ReferenceError: mine is not defined` in CSR and
`ReferenceError: w is not defined` in SSR. The body's seed is lifted into a
symbol module where neither the local nor the instance exists.

**The roster, read while deriving** — the route the packet suggested. Refused
with `MARKLESS_ELEMENT_HANDLE_UNBOUND` from
`packages/compiler/src/passes/semantic-graph/diagnostics.ts:983`: *"element()
handles are DOM-bound and readable only in event handlers, so `itemEls` is
undefined on every derivation."* Both the plural roster and the item's own
handle are refused, so an item cannot find itself in a list it cannot read.

A counter would have been wrong anyway. It only ever grows, so removing the
first of three items leaves the survivors numbered 1 and 2. The roster is the
correct source precisely because it is live — and the witness's nine passing
rows prove that: walked from a handler, it gives document order within the
instance, unchanged by keying, unchanged by projection through a consumer's
wrapper, renumbered correctly after a removal, and counted per instance rather
than globally when two collections share a page.

So the roster is right and the gate is the reading of it. The missing capability
is a render-time reading of an ordered element roster, or an ordinal the
compiler hands an item the way it hands one a prop.

## A second defect the witness caught

Adding a row to a keyed repeat after resume, where the row holds a part that
reads the enclosing family's widget instance, is refused outright:
`MARKLESS_REPEAT_ROW_COMPONENT_WIDGET_UNRESOLVED`, thrown by
`assertRowWidgetsResolved` at `packages/web/src/fns/row-component-mint.ts:433`.
The repeat's collection is the consumer's own cell, which sits outside the
widget, so the minted row resolves no enclosing instance and is refused rather
than forked.

Removing a row is fine; only adding one is refused. This is independent of the
index question and will block "items added at runtime" for every family with a
repeated part, not just these two.

## Not done

`packages/headless/components/SPEC.md` was left alone. The sentence it asked for
says positions are derived from render order and families never take an index
prop. Two families still take one, and will until the gate above moves, so
writing that sentence now would put a rule in the spec that the code does not
keep.

## Owner question

Which of these should move?

`isUnloweredSharedSeed` could admit a render-order ordinal — the compiler already
knows the order it emits items in, and handing an item its own ordinal is the
same shape as handing it a prop.

Or `element()` rosters could become readable while deriving, at least for the
document-order position of a handle the same instance bound.

The first is narrower and answers exactly the ruling. The second is broader and
would also close a class of "which of us am I" questions other families work
around today.
