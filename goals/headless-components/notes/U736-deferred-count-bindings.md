# A count spent at render is handed over unevaluated, and the page answers it

U734 refused arithmetic on a roster count and named the shape that would bring
it back: defer the whole expression into a thunk, lower the count read inside it
to a call, splice the answer once composition has made the counts facts. That
shape is now landed, CSR and SSR, and the refusal has narrowed to the shapes a
thunk cannot reach.

**Tour's `index` drop did not land.** It is untouched, and the reason is time,
not a wall — the deferral turned out to need one more seam than the card priced
(below). The forward-trigger gate and "2 of 5" are now expressible; the
migration is the next card's, unchanged in shape.

## How it works

The render already mints a PLACEHOLDER for a count: two private-use code points
around the roster's registration key, resolved after composition. That
placeholder is the carrier here too.

An expression that spends the count is not evaluated where it stands. The slot
calls `deferCount(thunk)`, which pushes the thunk onto the render's own registry
and returns a second token, `<index>`. Inside the thunk every count
read is rewritten from the captured const to `marklessCountValue(total)` — the
const still holds the placeholder and a closure cannot be rebound, so the const
is only the KEY and the call is the answer. The resolver runs each thunk with a
reader that turns that placeholder into the number, off the same tally the
placeholder resolver uses: the roster's members are its element-handle
registrations.

The pieces, and where they live:

- `passes/semantic-graph/roster-count.ts` decides. The walk out from each read
  no longer stops at the first operation: it remembers the innermost one and
  keeps going, and reaching a markup text or attribute slot is the deferrable
  shape. It records the printed expression's source beside the same expression
  with the count reads lowered — the compiler does the rewrite from the AST, so
  no emitter ever string-matches a name.
- `passes/public-render/residue-reader.ts` emits one case per residue source.
  Both regimes read their cases from that one producer, so the server module and
  the client render-data reader got the deferral from a single change; only the
  expression they reach the registry through differs.
- `ssr-data/renderer.ts` decides the token's SHAPE. A value token standing in an
  attribute is rewritten to carry the attribute NAME, because a boolean
  attribute defers whole: presence is the value, and `disabled` answering false
  has to erase the name and the quotes rather than write `disabled="false"`.
- `fns/roster-resume.ts` splices, beside the placeholder resolver it already
  held, gated the same pay-per-use way: a payload with no computed node can hold
  no count and never names this module.
- `render-to-string.ts` and `prerender/evaluator.ts` call it, each just before
  the placeholder resolver they already called.

## The seam the card did not price: an attribute is not an authored expression

The first working build printed `NaN` into `ui-last={total - 1}` while the same
arithmetic inside a TEXT node was exact. The cause is a lift, not the deferral:
`collect-markup.ts` mints a synthetic computed behind a recombined ATTRIBUTE
expression (that is what wakes the DOM update when a read inside it changes) and
the residue then becomes a graph read of that node. So the render read the
composite computed, which had already collapsed `placeholder - 1` to `NaN`, and
the deferral was never consulted.

Text slots have no such lift, which is exactly why the shape looked half-working:
`{`${total - w.step - 1} left`}` was right on the first try and `ui-last` was
NaN.

The fix keeps both mechanisms. The synthetic computed STAYS — it is what wakes
the update once the count is a live number after resume — and only the render's
residue changes: a source the count pass marked deferred renders through its
thunk instead of through the graph. One line in `expressionResidue`.

`disabled={w.step >= total - 1}` hid this: at first paint `0 >= NaN` is false,
which is the same answer the correct code gives, so the gate row passed against
a broken value. The `ui-last` row is what caught it.

## What is still refused, and why

Deferrable: arithmetic, comparison, a unary, a conditional, a property read off
the count, a call ARGUMENT — anything whose value a markup text or host
attribute slot prints, however deep, including through a template slot.

Refused, each because the token has nowhere to be spliced back:

- **A child component's prop** (`<Child max={total - 1} />`). The token would
  cross into another module's render as an ordinary string nobody there knows to
  resolve. This is also U734's second open item: a count PRINTED in the child is
  fine, spent there is still silently wrong and unrefused.
- **An arm test** (`@if (w.step >= total - 1)`). It decides whether markup
  exists at all, long before there is a page to resolve against.
- **A second `computed()`**, forwarding or arithmetic. It publishes a second
  binding holding the placeholder and nothing downstream knows to resolve that
  one.
- **A local the render carries forward** (`const carried = total`). Same reason,
  and the CSR reader binds graph names, not body locals.
- **An assignment, an update, and a composite** (array, object, spread). A
  spread attribute is read as an object; a token is a string.
- **Calling the count** (`total(...)`), which is a TypeError either way.

Untouched, as before: every read inside a handler. By the time one runs the
count is a number in the graph.

The refusal still names the INNERMOST operation the count reaches, including at
a derive boundary — `computed(() => total - 1)` is named by its `"-"`, and only
a derive that merely FORWARDS the count is named as a derivation.

## Witness

`packages/vitest-browser/browser/item-collections/` is **91 passed, 2
`test.fails`** across `item-collections` and `single-component-family` (the two
`test.fails` are the pre-existing `@if` arm rows, untouched).

Fourteen new rows. `IcRoot` now spends its own count three ways: `ui-last={total
- 1}` (arithmetic in an attribute value), `disabled={w.step >= total - 1}` on a
`next` button (a boolean attribute, tour's forward gate verbatim in shape), and
`` {`${total - w.step - 1} left`} `` (template math in a text node). CSR and SSR,
at first paint, after add and after remove, two instances each spending their
own count, plus a row pinning that a false gate writes NO attribute and a row
walking the gate shut on the last step.

The "no placeholder survives the render" row now covers `-`, so a
deferred token that failed to splice fails that row too.

`packages/compiler/test/render-order-ordinal/roster-count-spend.test.ts` is 11
rows: three deferral rows asserting the exact rewritten thunk source
(`marklessCountValue(total) - 1`), the child-prop and arm-test refusals, and the
five refusals U734 landed, unchanged.

## Bytes

**The CSR anchor is red and was red before this card, and this card added to
it.** `music-player-csr-budget.test.ts` `page-load download`:

```
pilot tip a5e7d339 (this card stashed)   137,886 gzip / 108 chunks
this tree                                138,020            108
anchor 137,243 + 128                   = 137,371
```

**+134 gzip is this card's, honestly.** The pre-existing 515-byte overrun is not.
No anchor was restated. The 134 is the eager cost on a page that renders no
count at all: the `deferCount` channel on the render context, the token
predicate in `renderAttribute`, and three delimiter constants. It was 217 before
three rounds of trimming — the token helpers became constants read at their call
sites, the resolver's regex moved into the lazy module, and the defer channel
was dropped from the two residue contexts that can never hold a token (an arm
test and an IDREF mint). Getting the rest to zero needs the channel itself to be
pay-per-use, which means reaching it from the render-data module the compiler
already gates per module rather than from the always-loaded render context.

**`music-player-ssr-budget.test.ts` is unmoved.** `page-load download` measures
69,919 on this tree and 69,919 on the untouched tip — byte for byte the same
overrun, not this card's.

The emit-byte-equality snapshot is unmodified: a module with no roster count
emits what it emitted before.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project browser packages/vitest-browser/browser/item-collections packages/vitest-browser/browser/single-component-family`
  — 2 files, 91 passed, 2 expected fail, exit 0.

## What the next card owns

1. **Tour's `index` drop.** Now unblocked: the gate and "2 of 5" are expressible
   shapes.
2. **The pay-per-use defer channel**, worth 134 gzip on every page that renders
   no count.
3. **The cross-component spend**, still U734's open item and now the largest
   remaining hole: a count passed to a child and spent there is unrefused.
