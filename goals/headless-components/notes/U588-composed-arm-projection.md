# A composed `@if` arm's projection of `children` follows the parent's write

## The defect

A bare `{children}` projection inside a composed part followed a write on the
caller's value. The same projection inside an `@if` arm went stale: the arm kept
rendering whatever the part mounted with.

The two take different roads to their value.

A **dom update** takes its value from its own record, and composition rewrites
that record's `graphNodeId`/`path` to the caller's node. It follows.

An **arm** has no element of its own to bind, so it has no dom update. It is
rebuilt by the branch's update symbol, and that symbol reads the graph itself —
with the part-local prop id its own module was compiled against:

```js
{ read: { graphNodeId: 'prop:props', path: ['children'] } }
marklessBranchText(context.graph.read('prop:props', ['children']))
```

Composition rewrote the record's `testReads`/`contentReads`, so the subscription
fires and the arm *does* rebuild — it just rebuilds from the wrong node. Resume
scopes a composed symbol by instance path before running it, so that read landed
on `c0:p1:prop:props`: the child's own prop cell, seeded once at mount and never
written again.

`packages/web/src/fns/ssr.ts` had the answer in hand at the moment it served the
record (`context.child.graphProps`, `childInstancePath`) and dropped both, so
`resume-branches.ts` had no route table to work with.

## The fix

The served composed-branch record now carries the route table and the instance
path, and resume reads the symbol's prop reads through them.

- `packages/serializer/src/protocol.ts` — `composedInstancePath` and
  `composedGraphProps` on the view payload's branch shape, plus
  `ProtocolComposedGraphProp`.
- `packages/web/src/fns/ssr.ts` — `marklessSsrComposedBranchRoutes` builds the
  pair at the level that composed the branch and remaps it at every level above,
  exactly as a read is remapped.
- `packages/web/src/resume-branches.ts` — `composedBranchGraph` wraps the graph
  the arm symbol is handed.
- `packages/web/src/resume-types.ts` — the two fields on `ResumeBranchRecord`.

CSR and SSR both go through `marklessSsrComposeView`, so one fix covers both;
the witness has both rows and both flipped.

## Three decisions worth knowing about

**The wrapper goes on the graph, not on the symbol.** The packet suggested
wrapping the loaded symbol in `marklessComposedSymbol`. That wrapper is built for
a symbol loaded through a child's *own* composed loader, which resume then leaves
alone (`composedSymbols` in `instance-scope.ts` makes `scopeSymbol` skip it). A
served record names its symbol by id, so `marklessInstanceScopedLoadSymbol` has
already scoped it by the time `resume-branches.ts` sees it. Stacking
`marklessComposedSymbol` on top would qualify every id twice —
`c0:p1:c0:p1:prop:props` — and read nothing. Wrapping the graph instead lets the
inner scope run first and re-routes only what arrives as a prop id.

**Taking the instance path back off is exact, not a guess.** The read reaches the
wrapper already scoped. `marklessComposedGraphNodeId` only ever concatenates for
a `prop:` id (`prop:` is not page space — `shared:`/`storage:` are the ids that
get the registry treatment), so stripping a known `instancePath` prefix is the
exact inverse. Anything that is not a prop read is left as the scope adapter
spelled it.

**The reader is duplicated on purpose.** `packages/web/test/event-only-resume-closure.test.ts`
caps resume's static import closure at about 21 KB of source. Importing
`fns/composition.ts` from `resume-branches.ts` took it to 106 KB — the whole
compose path. The route *table* is built by composition; the ~15-line *reader*
lives beside `wireBranches`, and `test/composed-arm/composed-arm-projection.test.ts`
pins it against `marklessCsrRemapChildGraph` so the two ends cannot drift.

## Keeping served bytes still

The fields are attached only when the branch keeps an update symbol **and** at
least one prop has a live route. A page with no composed arms serves the same
bytes it did before; `emit-byte-equality` and the serializer suite agree.

Nesting needed a marker. A branch travelling outward through a second compose
must not be claimed by the outer child's table — prop *names* are module-local,
so an outer `children` and an inner `children` are different props, and claiming
would answer the arm with an unrelated value. Presence of `composedInstancePath`
says "already routed deeper"; a deeper branch that carries no table at all is
recognised by its id already carrying an instance path (`c0:branch-site:0`),
since a module's own branch ids are always bare `branch-site:N`.

## What this did not touch

- The compiler emits the symbol correctly; the routing was the whole defect. No
  emission change was needed.
- Arm-branch records inside async boundaries (`servedArmRecords[].branches`) take
  a different registration road (`resume-arm-records.ts`) and were left alone. If
  an arm inside a boundary arm ever shows the same staleness, that is where to
  look.
- `composedBranchGraph` routes reads only. A composed arm rebuilds from what it
  reads and writes nothing, so `write`/`subscribe` were deliberately left
  unrouted rather than half-wired.

## Still red next door

`progress.browser.ts` keeps one expected-red row: *the bar follows an amount the
consumer changes from outside*. That is the separate shared-seed defect — a
component-body seed runs on the initial render only, so a new `value` prop never
re-seeds the instance. Unrelated to this route.
