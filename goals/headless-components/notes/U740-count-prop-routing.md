# A count handed to a child is still a count there

U734 refused arithmetic on a roster count and U736 made the printed spends
answerable through deferred thunks. Both saw ONE component. A count passed down
as a prop and spent in the child was neither deferred nor refused: the child got
the placeholder string, did arithmetic on it, and painted a wrong number nothing
reported. That was the largest remaining hole, named as open by both cards.

**(a) landed, not (b).** The thunk machinery reaches prop reads with no runtime
change at all, so a spend in the child DEFERS exactly as a spend in the deriving
component does. The refusal is still there for the shapes a thunk cannot reach,
now naming the prop, the child, and where the count came from.

## What was measured, before anything was written

The card was allowed to fall back to a refusal if the deferral could not cross a
component edge. It can, and the measurement is why:

**The prop carries the placeholder itself.** The parent's emitted SSR render
builds the child's props as
`const childProps={total:marklessSsrReadPublicPath(marklessSsrRenderStateValues.get("computed:total"),[])}`
— the VALUE of the count computed, which at render is the placeholder string the
page resolves after composition. `<Child total={total} />` compiles to a
`graph-reference` prop, so both regimes read the same node.

**`marklessCountValue` is value-keyed, not name-keyed.** U736 lowered a count
read inside a thunk to a call because the captured const cannot be rebound. The
call takes the placeholder and answers the number, so it does not care whether
the placeholder arrived in a const or in a prop. Nothing about the lowering had
to change except which NAME it spells: the child's parameter.

**The defer registry already crosses the edge.** The parent invokes the child as
`renderSsr(childProps, {...marklessSsrRenderContext, idPrefix: ...})`, so
`deferCount` is spread into the child's context. On the CSR side the registry
hangs off the `positions` object filed on the render's shared-seed map, which
every component in the render reads through `marklessRosterPositions(seeds)`.

**The child's residue is already an authored expression.** `collect-markup`
lifts a synthetic computed behind an attribute expression that reads the graph —
U736's NaN landmine — but a prop is not a graph binding in the child's own
scope, so `ui-last={total - 1}` in the child arrives as
`{kind:'authored-expression', source:'total - 1'}` with no lift to defeat.

The emitted result, unedited, for a child spending `total - 1`:

```
case "total - 1":return marklessSsrDeferRosterCount((marklessCountValue)=>(marklessCountValue(total) - 1));
```

and its client twin, which binds the prop from the child's own props:

```
(residue,marklessResidueContext)=>{const total=marklessResidueContext.read("prop:total");
switch(residue.source){case "total - 1":return (marklessResidueContext.deferCount??...)((marklessCountValue)=>(marklessCountValue(total) - 1));...
```

## How it works

`passes/semantic-graph/roster-count.ts` no longer walks one component per count.
It builds a map of SCOPES — "this component's local binding holds that count" —
and reaches a fixpoint over it before emitting anything:

- A count read that reaches a printed position with NO operation behind it and
  stands as a child component's named prop is a **route**, not a print. The
  child's signature is looked up in the same module, the local it takes that prop
  out under is resolved through yuku's symbol table, and that local becomes a
  count-holding binding in the child's scope.
- Routing runs to completion first, so a component reached from two parents is
  judged once with every count that arrives at it in hand, and no refusal is
  emitted twice.
- Then each scope is walked once and judged by U734's and U736's unchanged rule:
  a spend a markup text or attribute slot prints defers, everything else is
  refused.

Three smaller facts the shape depends on:

**The count is followed by BINDING, never by name.** `<Child max={total} />`
into `function Child({ max })` carries the count under `max`, so the thunk
lowers `marklessCountValue(max)` and a refusal says `"max"`. The lowering now
takes the read's own identifier rather than the record's `computedName`, which is
the same string in the deriving component and the right one everywhere else.

**Only a BARE pass routes.** `` <Child label={`of ${total}`} /> `` hands the child
a string with the placeholder buried in it. The page still answers that run as
text, but nothing in the child is a number to spend, so the prop is not marked
and the child's local is an ordinary string. Spending the count in the prop
expression itself (`<Child max={total - 1} />`) stays refused, as U736 left it:
the token would cross as a string nobody in the child knows to resolve.

**A deferred entry now says which component prints it.** The entry gained an
optional `componentName`, set only when the count arrived through a prop. Both
consumers key off `entry.componentName ?? record.componentName`:
`deferredRosterCountCases`, so the CHILD's reader carries the thunk, and
`spendsRosterCount` in `collect-markup`, so a child expression that also reads
the graph renders through its thunk rather than through the synthetic computed —
U736's NaN seam, which would otherwise reopen one component over.

## What is still refused, and why

Unchanged from U736, and now enforced wherever the count is rather than only
where it was derived. In the child these are refused by the prop's name:

- **A second `computed()`** off the prop, forwarding or arithmetic.
- **An arm test** (`@if (total > 1)`), which decides whether markup exists at
  all, long before there is a page to resolve against.
- **A local the render carries forward**, an assignment, an update, a composite.
- **The prop expression itself** spending the count at the call site.

The refusal names the innermost operation, as before, plus one sentence saying
where the count came from when it arrived through a prop: `The prop carries
"total", the roster count IcRoot derives.` A bare print of the prop —
`{total}`, `ui-max={total}` — stays legal at every depth.

Handlers are untouched, in the child as in the root: by the time one runs the
count is a number in the graph.

## The hole this card did NOT close

**A child in another module is not routed.** The walk resolves the child's
signature out of the module it is compiling, so `import { Child } from
'./Child.tsrx'` is neither deferred nor refused — it is exactly as silent as
before. This is pinned as a known hole rather than left to be discovered. Closing
it needs a linking-time pass with both modules' graphs in hand: the count would
have to cross as a marked prop on the component edge and be judged when the
child's module is compiled, which is a different pass's contract. Families put
their parts in one file today (`ic-widget.tsrx` is IcRoot and IcItem together),
so the shape that actually occurs is covered.

Two smaller ones, both deliberate: a prop taken out through a REST binding or a
nested pattern is not routed (the walk does not follow the value through that
shape, and routing it wrongly is worse than not routing it), and a count reaching
a child through `{children}` projection carries no name the child's signature can
take it out under.

**One CSR fact this package cannot witness.** `deferCount` answers with a token
only while `positions.counted` is set, which the parent's mint sets before it
renders children. If a child's CSR evaluation were ever handed a seed map WITHOUT
the render's positions object, its thunk would run immediately against the
placeholder and throw `MARKLESS_ROSTER_COUNT_UNRESOLVED` — loud, not silent, and
strictly better than today's wrong number, but a browser witness of a spend in a
child part is what would settle it. That belongs with the family fixtures in
`packages/vitest-browser`, which this contract does not hold.

## Bytes

**Nothing moved.** Measured on this tree and on the untouched pilot tip
(41e1e0da, this card's work stashed), byte for byte:

```
music-player-csr-budget page-load download    138,145 gzip / 108 chunks   both
music-player-ssr-budget page-load download     69,901 gzip /  97 chunks   both
```

Both rows are over their anchors and both were over before this card; neither
overrun is this card's and no anchor was restated. The change is a diagnostic and
a per-component reader case that only exists on a module routing a count through
a prop, so `test/__snapshots__/emit-byte-equality.test.ts.snap` is unmodified.

## Witness

`packages/compiler/test/render-order-ordinal/roster-count-prop-routing.test.ts`
is 12 rows. Run against the unmodified pass, **7 of them are red** — the
deferrals one and two levels deep, the renamed prop, the emitted reader carrying
the thunk, and the two child-side refusals. The 5 that pass either way pin
shapes this card had to preserve: the printed prop, the handler, the template
prop, the refusal at the call site, and the cross-module hole above.

The reader row is the load-bearing one: it asserts the CHILD's compiled
`residueReaderSource` and the SSR module both carry
`(marklessCountValue)=>(marklessCountValue(total) - 1)`, so the deferral is a
thing the page runs and not just a field in an artifact.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/compiler` — 245 files, 1,956
  passed, 1 expected fail.
- `pnpm exec vitest run --project node packages/web packages/bundler` — 163
  files, 1,158 passed, 2 failed: the two budget rows above, identical on the
  untouched tip.

## What the next card owns

1. **The cross-module route**, at link time — the last silent shape.
2. **A browser witness** of a count spent in a child part, CSR and SSR, which is
   what closes the `positions.counted` question above.
3. **Tour's `index` drop**, still unblocked and still unstarted.
4. **The pay-per-use defer channel**, worth 134 gzip on every page that renders
   no count.
