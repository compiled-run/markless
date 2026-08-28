# A derive may also ask a roster how many there are

The compiler now admits a second derive-time `element()` handle read: `roster.length`
on a same-instance plural `shared()` roster, inside a `computed()`. Every other
handle read in a derive is still refused by `elementHandleDeriveReadDiagnostic`
(`packages/compiler/src/passes/semantic-graph/diagnostics.ts`), unchanged.

This is the wall the drop-index card measured and could not get past: `otp` and
`tour` each need a render-time COUNT (`maxlength`, the root's `ui-max`, "2 of 5",
the forward trigger's gate), and seeding one from a derived position is
`MARKLESS_SHARED_SEED_UNSUPPORTED`. A count now has an expression. The runtime
answers it on neither side yet — that is the next card.

## The authoring shape, verbatim

```tsx
export function IcRoot({ children }) @{
	const w = ic();
	const total = computed(() => w.itemEls.length);

	<div data-ic-root ui-max={total}>{children}</div>
}
```

The asker may be the root or any part. The root above binds none of the roster's
elements; an item that binds one asks the same question and gets the same answer.

## What makes it admissible, and what keeps it narrow

The recogniser is `collectElementRosterCounts`
(`packages/compiler/src/passes/semantic-graph/roster-count.ts`), which runs after
the position recogniser and before the handle diagnostics. Four conditions, each
pinned red-if-relaxed in
`packages/compiler/test/render-order-ordinal/roster-count-derive.test.ts`:

1. The derive body is the whole query and nothing else — `() => roster.length`, or
   the one-`return` block form. `roster.length + 1` is refused. The body must be
   the whole query because the SSR half replaces the entire declaration, not an
   inner span.
2. The property is `length`. `roster.at(0)` and `roster[0]` are refused: a handle
   is a DOM locator everywhere else, and a count is not a licence to reach into
   the roster.
3. The roster is a plural `element()` off a `shared()` instance. A part-local
   plural handle collects only that part's own elements, so its size is not the
   family instance's part count.
4. The computed is a synchronous one declared by a component. An async computed is
   refused, and so is a `shared()` factory computed — a factory computed is one
   node per instance with no component render body for the SSR half to lower into.

No member handle, and no host-element proof: unlike the position, the count does
not depend on the asker being in the roster.

Outside a `computed()` nothing is admitted at all. `const total = w.itemEls.length`
in a component body and `ui-max={w.itemEls.length}` in markup are not derive nodes;
they mint no record and no lowered call, and compile exactly as they did before.

## The lowered form

**Resume / client derive symbol** — `packages/compiler/src/passes/symbol-modules.ts`,
inside `rewriteDeriveReads`, replacing the outermost matching node so the handle
read is never reached:

```js
export function symbol_4(context) {
  return context.rosterCount("shared:src/Ic.tsrx#ic/element:itemEls");
}
```

**Server render** — `packages/compiler/src/passes/public-render/render-body.ts`,
`rosterCountDeclarationLine`, replacing the shared-instance prelude the computed
would otherwise get:

```js
const total = (marklessSsrRenderContext?.rosterCount ?? (()=>{throw new Error("MARKLESS_SSR_ROSTER_COUNT_UNANSWERED: computed:total");}))("shared:src/Ic.tsrx#ic/element:itemEls");
```

One id, same order, both regimes. The SSR fallback throws rather than standing in
as a number for the same reason the position's does: a default of `0` would make
every family render an empty count and nothing would say so.

## The dependency record

`ProtocolStatePayload.computed[].dependencies` carries it with no serializer
change:

```json
{
  "graphNodeId": "computed:total",
  "name": "total",
  "async": false,
  "deriveSymbolId": "symbol:4",
  "dependencies": [
    { "graphNodeId": "shared:src/Ic.tsrx#ic/element:itemEls", "path": [] }
  ]
}
```

The roster's element binding IS a graph node with an id, so `{ graphNodeId, path }`
names it as-is. `length` is deliberately NOT a path segment: the authored
dependency arrives as `path: ["length"]` and the recogniser strips it, because the
lowered call answers the count and a `["length"]` path would ask a runtime to read
`.length` off a graph value holding no array. Anything that invalidates this
derivation is a change to the roster's membership.

## What the runtime card (T035) must answer

1. **`context.rosterCount(rosterGraphNodeId)` on the derive context.**
   `refreshSyncComputed` (`packages/web/src/resume-sync-computed.ts`) already hands
   the derive symbol `getElementHandle` and, after the position card, `rosterPosition`.
   This is one more field off the same handle registry, answering the roster's
   member count.
2. **`rosterCount` on the SSR render context.** `marklessSsrRenderContext` already
   carries `idPrefix` and `sharedSeeds` through composition, which is where a
   per-instance emission count would ride. The hard part is that a count is not
   knowable when the FIRST part renders — server render is a single forward pass,
   and the root asking `ui-max` renders before any item exists. Either the count is
   resolved after composition and patched into the parts that read it, or the SSR
   context answers from a pre-pass over the instance's children. Naming which is
   the card's first decision; until it is answered, authoring this shape compiles
   and then throws `MARKLESS_SSR_ROSTER_COUNT_UNANSWERED` at server render.
3. **A notification when the roster's membership changes.** Same open edge as the
   position: `materializeElementHandles` (`packages/web/src/resume-locators.ts`)
   does not register row-owned handles, so nothing writes the roster node today and
   the dependency record above has nothing to fire on. A count is strictly more
   sensitive to this than a position — adding or removing a part changes it for
   every reader, not just for the part that moved.
4. **Whether the position and the count share one context field.** They are two
   calls today. A runtime that answers both from the same handle registry may want
   one lookup; the compiler does not care which, and neither lowered call would
   change if the runtime merged them behind the scenes.

## Bytes moved

None. `packages/compiler/test/__snapshots__/emit-byte-equality.test.ts.snap` is
unmodified — no fixture in `emit-byte-equality.test.ts` writes a count query, and
the new artifact key is omitted from the semantic graph when a module has no
record, so every artifact that predates it keeps its exact key set.

One existing pin changed meaning: the position file's "the roster read alone is
still refused" used `w.itemEls.length` as its example of a refused read, which is
now the admitted shape. It was re-cut onto `w.itemEls.at(0)` and renamed, and it
still asserts exactly one refusal and no record of either kind.

`pnpm typecheck` clean; `pnpm exec vitest run --project node` 465 files, 3632
passed, 1 expected fail (the pre-existing one).
