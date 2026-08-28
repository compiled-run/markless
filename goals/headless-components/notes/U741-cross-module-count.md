# A count handed across a module edge is answered by the two modules together

U740 routed a roster count into a child's prop by resolving the child's
signature in the SAME MODULE. A child declared in another module was neither
deferred nor refused: it got the placeholder, did arithmetic on it, and painted
a wrong number nothing reported. That was the last silent shape.

It is closed. **Every cross-module spend is now refused by name.** The deferral
does not cross, and the reason is a measured wall rather than a shrug — it is
the whole second half of this note.

## How the edge is judged

Neither module can answer alone: the module deriving the count cannot see the
child's body, and the child's module does not know a count is coming. So each
publishes the half it owns.

**The child's module publishes what it does with each prop.**
`ModuleGraphInterfacePropSpend` is a new field on the per-component interface
entry (`render.components[].propSpends`): the prop, the component that spends
it, the local it spends it under, the innermost operation, and the authored
expression. It is computed by asking every destructured prop the same question
the count pass asks a real count — hold it in that binding, route it on through
this module the way a real one would route, and record every position that is
not a bare print.

**The module deriving the count reads that back.** When the routing walk reaches
a bare pass into a child this module does not declare, it resolves the placement
through the component edge the graph already recorded — which is also what
answers a member tag, `<checkbox.Item total={total} />` — and refuses each
published spend, naming the prop, the component that spends it, and the
operation:

```
MARKLESS_ROSTER_COUNT_NOT_A_NUMBER: Cannot spend the roster count "shown" in a
"-" operation ("shown - 1") in IcCount: at server render the count is a
placeholder the renderer resolves once the page has composed, so only a bare
read printed as text or as an attribute value carries it. The prop carries
"total", the roster count IcRoot derives.
```

The span is the placement THIS module wrote. The spend itself is another
module's line, which this compile has no source for.

**Three modules deep works for free.** A middle module that only forwards the
prop publishes the third module's spends under its OWN prop name, because
`propSpends` consults the interfaces that module imported while it computed its
own. So the chain is answered wherever it ends, and no module ever needs a body
it does not have.

Two facts the shape rests on, both unchanged from U740: only a BARE pass routes
(a template slot hands the child a string, not a number), and the count is
followed by BINDING, so a renamed prop is refused under the name the child's
signature gave it.

## Why the deferral does NOT cross, measured

The packet asked for the same deferral a same-module child gets. It cannot be
had from inside this contract, and the wall is mechanical rather than a design
preference.

**A deferral is a case in the SPENDING component's compiled reader.**
`authoredResidueReadCases` emits exactly one case per authored residue source —
either the plain expression or `deferCall((marklessCountValue)=>(...))`, never
both — and `deferredRosterCountCases` reads which from that module's own
`semanticGraph.elementRosterCounts`. So the thunk has to be written into the
child's module at the time the child's module is emitted.

**The child's module is emitted before the parent knows.** The only compile-time
channel between modules is `importedModuleInterfaces`, and it runs parent ←
child: to compile the parent, the child's interface must already exist. The
bundler's link stage re-transforms the PARENT with its children's interfaces
(`linkTransformChildren` in `packages/bundler/src/hooks/transform-link.ts` calls
`transformTsrxModuleWithPrerenderWakeClosure` again with
`importedModuleInterfaces`), and never re-transforms a child with anything the
parent learned. There is no reverse edge.

**Unconditional emission is not a way out.** Making the child always emit the
deferring case for a printed prop spend would change the bytes of every module
that prints arithmetic on a prop, which is most of them, and it would hand a
thunk a value that is an ordinary number — `marklessCountValue` on a
non-placeholder throws `MARKLESS_ROSTER_COUNT_UNRESOLVED`. A guarded case that
tests the value at runtime needs the token delimiters, which are `@markless/web`
protocol facts this contract may not restate, and it still costs the bytes.

So the rule is unchanged and applied honestly: **a spend a markup slot prints
defers when the spending module can still emit the thunk, and is refused when it
cannot.** Across a module edge, the set of thunk-reachable shapes is empty.

A refusal is strictly better than what shipped before it — the number was wrong
and nothing said so — but it is a narrower answer than the same shape gets one
file over, and closing that gap is a decision the owner has to make. See "What
the next card owns".

## What a prop spend is, and the noise it costs

`propSpends` is published for any prop the render does not merely print,
including a bare property read (`{item.label}`). That looked like over-reach
until it was checked: a placeholder is a STRING, so `item.length` on a routed
count prints the placeholder's character count — a plausible-looking wrong
number, which is exactly the failure mode this refuses.

The cost is that most components with an object prop now carry the field.
`packages/compiler/test/keyed-repeat-row-component.test.ts` pins the interface
entry's key set, and it grew by one; the comment there says why the fixture
earns it. Nothing in the field reaches a payload or a chunk — it is build-time
only, read by the compile of a module that routes a count.

## Bytes

**Nothing moved.** `music-player-csr-budget.test.ts` `page-load download`
measures **138,109 gzip across 108 chunks** on this tree and **138,109 across
108 chunks** on the same tree with this card's `src` changes stashed — byte for
byte. That row is over its anchor (137,398 + 128 = 137,526) and was over before
this card; no anchor was restated.

`test/__snapshots__/emit-byte-equality.test.ts.snap` is unmodified. The change
emits no code: it is a diagnostic plus a build-time interface field.

## Witness

`packages/compiler/test/render-order-ordinal/roster-count-cross-module.test.ts`
is 10 rows, run against two and three real modules linked through
`compileTsrxModulesWithInterfaces`. **6 of them are red against the unmodified
pass**: the attribute spend, the text spend, the child-side derive, the renamed
prop, the two-edge chain, and the interface record itself. The 4 that pass
either way pin what must NOT change — the printed prop stays legal, a
template-stringified prop is not routed, an ordinary value reaching the same
spending child is not refused, and a handler spend in the child is not published
as a spend at all.

The load-bearing row is the three-module one. It asserts that the middle module
republishes `IcCount`'s `shown - 1` under its own `total` prop, and that the
root's refusal names `IcCount` and `"shown"` — so the chain is answered without
either end module ever reading the other's source.

`roster-count-prop-routing.test.ts` kept its 12 rows. The one that pinned this
hole now pins the narrower fact that is still true: a compile handed no
interfaces has read nothing about the import, so it says nothing.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/compiler` — 246 files, 1,966
  passed, 1 expected fail.
- `pnpm exec vitest run --project node packages/web packages/bundler` — 163
  files, 1,157 passed, 3 failed: the CSR budget row above (identical with this
  card stashed) and two `render-order-sweep` rows, which fail the same way on
  the untouched tree — `tokenbox.tsrx` has four pre-existing compile errors
  (`MARKLESS_STATE_DYNAMIC_PATH_READ`,
  `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`) that have nothing to do
  with roster counts. No `MARKLESS_ROSTER_COUNT_NOT_A_NUMBER` appears anywhere
  in that sweep: no shipped family routes a count across a module edge today.

## What the next card owns

1. **The cross-module DEFERRAL, if it is wanted.** It needs the child's module
   re-emitted once a parent's route is known — a second compiled variant of the
   child, the way the resume and wake variants already are, keyed by the
   routed-count mark. That is a bundler change (`transform-link.ts` would have
   to publish the mark and force the child again), so it is an owner decision
   rather than a compiler one. Until then the refusal above is the answer.
2. **A browser witness** of a count spent in a child part, CSR and SSR, still
   open from U740 — it is what settles the `positions.counted` question there.
3. **Tour's `index` drop**, still unblocked and still unstarted.
4. **The pay-per-use defer channel**, worth 134 gzip on every page that renders
   no count.
