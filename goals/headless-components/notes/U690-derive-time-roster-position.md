# A derive may ask a roster where it is, and nothing else

The compiler now admits exactly one derive-time `element()` handle read: a part
asking for its own document-order place in its family's roster. Every other
handle read in a `computed()` is still refused by
`elementHandleDeriveReadDiagnostic`
(`packages/compiler/src/passes/semantic-graph/diagnostics.ts`), unchanged.

The runtime answers the lowered call on neither side yet. That is the next card.
This note names the exact call, the record it carries, and what has to answer it.

## The authoring shape, verbatim

```tsx
export function IcItem({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));

	<div data-ic-item el={[w.itemEls, mine]} ui-pos={pos}>{children}</div>
}
```

This is the spelling U689 measured as already-legal authoring; nothing about
`el={[...]}`, `@markless/core` or the `el` prop type changed.

## What makes it admissible, and what keeps it narrow

The recogniser is `collectElementRosterPositions`
(`packages/compiler/src/passes/semantic-graph/roster-position.ts`), which runs
after `finalizeComputedDependencies` and before the handle diagnostics. All five
conditions must hold, and each one is pinned red-if-relaxed in
`packages/compiler/test/render-order-ordinal/roster-position-derive.test.ts`:

1. The derive body is the whole query and nothing else — `() => roster.indexOf(mine)`,
   or the one-`return` block form. Type assertions around the argument are
   stripped, because `mine as HTMLDivElement` is what an author writes to satisfy
   the declared element type and is not a different question. `... + 1` is refused.
2. The computed is declared by a component, not inside a `shared()` factory. A
   factory computed is one node per instance with no part to be the position of.
3. The roster is a plural `element()` off a `shared()` instance. A part-local
   plural handle collects only that part's own elements, so a place in it is not
   the same-instance render order the ruling names.
4. The argument is a singular `element()` the same component declared.
5. Both handles are bound on ONE host element of that component. This is the
   proof that `mine` is a member of that roster rather than an assumption; split
   the two `el=` bindings across two elements and both reads are refused again.

The member handle then leaves the computed's dependency list. That is why the
refusal skip in `collectElementHandleDeriveReads` only exempts the roster node:
by the time it runs there is no member dependency left to exempt, so no other
handle read can ride along.

## The lowered form

**Resume / client derive symbol** — `packages/compiler/src/passes/symbol-modules.ts`,
inside `rewriteDeriveReads`, which replaces the outermost matching node so the
two inner handle reads are never reached:

```js
export function symbol_3(context) {
  return context.rosterPosition("shared:src/Ic.tsrx#ic/element:itemEls", "element:mine");
}
```

**Server render** — `packages/compiler/src/passes/public-render/render-body.ts`,
`rosterPositionDeclarationLine`, replacing the shared-instance prelude the
computed would otherwise get:

```js
const pos = (marklessSsrRenderContext?.rosterPosition ?? (()=>{throw new Error("MARKLESS_SSR_ROSTER_POSITION_UNANSWERED: computed:pos");}))("shared:src/Ic.tsrx#ic/element:itemEls", "element:mine");
```

Two ids, same order, both regimes. The member handle travels as an id rather than
as a value because a derive body holds no DOM node to hand over; the answering
side owns the lookup.

The SSR fallback throws rather than substituting a number on purpose. A default
of `0` or `-1` would make every part render the same position and nothing would
say so — the exact silent-wrongness this codebase refuses elsewhere. The throw
resolves and runs today, so no `@markless/web` export is imported before it
exists.

## The dependency record

`ProtocolStatePayload.computed[].dependencies` carries it with no serializer
change, exactly as U689 predicted:

```json
{
  "graphNodeId": "computed:pos",
  "name": "pos",
  "async": false,
  "deriveSymbolId": "symbol:3",
  "dependencies": [
    { "graphNodeId": "shared:src/Ic.tsrx#ic/element:itemEls", "path": [] }
  ]
}
```

The roster's element binding IS a graph node with an id, so `{ graphNodeId, path }`
names it as-is. The member handle is deliberately absent: it never moves, and its
id is already inside the lowered call. Anything that invalidates this derivation
is a change to the roster.

## What the runtime card must answer

1. **`context.rosterPosition(rosterGraphNodeId, handleGraphNodeId)` on the derive
   context.** `refreshSyncComputed` (`packages/web/src/resume-sync-computed.ts`)
   already hands the derive symbol `getElementHandle`; this is one more field
   built from the same handle registry, answering `roster.indexOf(element)`.
2. **`rosterPosition` on the SSR render context**, answering the order the widget
   instance emitted its parts in. `marklessSsrRenderContext` already carries
   `idPrefix` and `sharedSeeds` through composition, which is where a per-instance
   emission ordinal would ride. Until it exists, authoring this shape compiles and
   then throws `MARKLESS_SSR_ROSTER_POSITION_UNANSWERED` at server render.
3. **A notification when the roster moves.** U689 point 3 stands unchanged:
   `materializeElementHandles` (`packages/web/src/resume-locators.ts`) does not
   register row-owned handles at all, so nothing writes the roster node today and
   the dependency record above has nothing to fire on. The repeat's row mutation
   has to notify it.

Two of the eleven witness rows still wait on T009
(`assertRowWidgetsResolved`, `packages/web/src/fns/row-component-mint.ts`) and
are untouched by any of this.

## Bytes moved

None. `packages/compiler/test/__snapshots__/emit-byte-equality.test.ts.snap` is
unmodified — no fixture in `emit-byte-equality.test.ts` writes a position query,
and the new artifact key is omitted from the semantic graph when a module has no
record, so every artifact that predates it keeps its exact key set. The pin for
the shape lives in its own directory rather than as a new byte-equality fixture,
which is why that snapshot needed no re-anchor and carries no attribution line.

`pnpm typecheck` clean; `pnpm exec vitest run --project node` 461 files,
3564 passed, 1 expected fail (the pre-existing one).
