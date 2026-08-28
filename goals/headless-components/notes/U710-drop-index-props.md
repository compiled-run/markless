# Render order answers where a part stands, once — and these two families ask twice

The ruling is that no family takes a manual `index` prop. `tour.item` and
`otp.item` still do, and this card could not take it off them. The derivation
the framework delivers answers a part's position **at first paint**, correctly,
for both families. It does not survive the second question, and neither family
gets its count from it. Three separate walls, each measured, each outside
`packages/headless/components`.

Nothing landed. `tour/`, `otp/` and `SPEC.md` are as they were on the pilot tip;
the SPEC sentence is deliberately not written, because it would state a rule the
two families in front of it do not follow.

## What the families actually need

Both do two things with the ordinal, not one:

1. **Where am I** — `otp.item` slices its own character out of the code
   (`otp.value.slice(index, index + 1)`); `tour`'s card decides whether it is the
   step showing (`tour.step === item.index`).
2. **How many are there** — the LAST part to render seeds the family's count:
   `otp.length = index + 1`, `tour.count = index + 1`. That count is read at
   render time: the field's `maxlength`, the root's `ui-max`, the value label's
   "2 of 5", and the forward trigger's disabled gate.

The roster derivation answers (1). Nothing answers (2).

## Wall 1 — a seed cannot be built from a derived position

```
otp.length = pos + 1;
```

```
MARKLESS_SHARED_SEED_UNSUPPORTED: Cannot seed "otp.length" from "pos + 1" because
a component body seeds a shared instance only from its own props or from constants.
MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE: The emitted shared-seed module
for symbol:20 still names "pos" directly.
```

A component body's write to shared state is lowered into a per-instance initial
value built from props and constants. A `computed()` is neither. `tour.count =
pos + 1` is the same statement in the other family and refuses the same way.

The obvious alternative — let the count be the roster's own length — is a dead
end already recorded in `tour.tsrx` at the `count` field and re-confirmed here:
a plural handle "reads back empty inside a `computed()`, so it is a handler-time
registry only", and U690 admits exactly one derive-time handle read, `indexOf`.
`roster.length` is refused, and would answer `0` at render even if it were not.

So a render-time count has no expression today. The count is why the prop
cannot simply come off.

## Wall 2 — the member handle has to be component-local, and that key collides

U690 condition 4 wants the `indexOf` argument to be a singular `element()` the
same component declared. `tour` already owns a per-step `shared()` instance with
a card handle on it (`tourItemState.el`), bound on the very host the roster is
bound on, so it was the natural argument. It is refused:

```
MARKLESS_ELEMENT_HANDLE_UNBOUND: Cannot read element handle "item.el" inside
computed "pos" in TourCard
MARKLESS_ELEMENT_HANDLE_UNBOUND: Cannot read element handle "tour.itemEls" inside
computed "pos" in TourCard
```

Both reads fall out of the admitted shape together — the recogniser matches the
whole query or none of it.

A component-local `const cardEl = element<HTMLDivElement>()` on the same host is
admitted and compiles. But a component-local handle id carries no instance, which
is U694's carried-forward limit verbatim: parts of one family that sit in the
same row — or, as in every one of these scenarios, in no row at all — file every
registration under the one bare key, and a re-derive resolves no member and
answers `-1`.

Measured on `otp`, with the length pinned to a constant so only the position was
under test: first paint is RIGHT (`prefilled` renders `1`,`2`,`3`… in the right
boxes, 28 rows green), and then every row that changes `otp.value` after paint
goes empty, because `pos` re-derives to `-1` and `'1234'.slice(-1, 0)` is `''`:

```
CSR: each keystroke fills the next box and leaves the rest empty
  AssertionError: expected '' to be '4'
```

`tour` has the same topology — three cards, no repeat — so `isCurrent` would
collapse the same way the first time `tour.step` moves.

One naming landmine on the way: a `const mine` inside the `isCurrent` body
collided with the `const mine` handle, because two `const`s of one name in a
module collapse to one cell (already recorded in `tour.tsrx`). It surfaced as
`MARKLESS_ELEMENT_HANDLE_REQUIRED` plus `MARKLESS_COMPUTED_DEPENDENCY_CYCLE:
pos -> pos`, neither of which names the collision. Renaming the handle cleared
both.

## Wall 3 — the shared-seed evaluation path has no `rosterPosition`

With the shape compiling, `tour`'s CSR first paint throws before any assertion:

```
TypeError: context.rosterPosition is not a function
 ❯ symbol_32 (virtual:markless:symbol:.../tour.tsrx:symbol:32)
 ❯ packages/web/src/fns/shared-seed.ts:209
 ❯ renderCanonicalClientOutput packages/web/src/render-canonical.ts:22
 ❯ renderCsr packages/web/src/render.ts:126
```

U694 wired the answer into three places — the SSR render context, the prerender
evaluator, and `refreshSyncComputed`. `fns/shared-seed.ts` is a fourth
evaluation site for a derive symbol and was not wired, so a family whose computed
is reached through the shared-seed path gets a context without the field. 32 of
`tour`'s 38 rows died on it, including rows that never touch a gesture.

`otp` does not reach that path, which is why its first paint was clean.

## What the next card has to deliver before the props can come off

1. **A render-time count from the roster.** Either a second admitted derive (the
   roster's size, answered by the same emission counter that answers position),
   or a seed source the compiler will accept from a derived value. Without one,
   `maxlength`, `ui-max` and "2 of 5" have no source.
2. **A member handle that names one rendered part outside a keyed row.** U694
   named the fix: qualify component-local handle ids the way widget-scoped ones
   are qualified, which moves `marklessWidgetHandleId`, the registry's strip
   regex and the scoped reader together. Until then the derivation is
   first-paint-only for any family a consumer writes flat, which is how both of
   these are written.
3. **`rosterPosition` on the shared-seed evaluation context**
   (`packages/web/src/fns/shared-seed.ts`), so a family that reaches a derive
   symbol through that path is answered like the other three.

Items 1 and 3 are `packages/web`/compiler work; item 2 is the card U694 already
carried forward. All three are outside this card's contract, which is why this
one returns blocked rather than half-landing a family.

## What is proven, and worth keeping

The authored shape from the witness transplants cleanly into a real family:
`el={[roster, mine]}` on the part's host plus
`computed(() => roster.indexOf(mine as HTMLDivElement))` compiles in `otp` with
no new diagnostic, and answers every box's position correctly on first paint in
CSR and SSR. The capability is real; what these two families need on top of it
is a count and a durable member identity.
