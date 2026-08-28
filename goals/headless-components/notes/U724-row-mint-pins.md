# The row-mint pins, re-anchored onto a read that is still unfillable

Eight rows in the keyed-repeat row-mint pins went red on the pilot tip. Every one of them used a
METHOD CALL on a state cell — `theme.toUpperCase()`, `chosen.toUpperCase()`, `n.label.toUpperCase()`
— as its stand-in for "a value only rendering produces". Template method calls on a writable read
are now lifted into a synthetic computed before the row mint looks at the slot, so those slots
arrived as `graph-read` residue and the rows minted. The pins were reporting a change of stand-in,
not a change of behaviour.

No compiler source was touched. `pnpm exec vitest run --project node packages/compiler` is
242 files, 1930 passed, 1 expected fail.

## What is still unfillable, and why each candidate was picked or dropped

`mintableSlotValue` in `packages/compiler/src/passes/row-mint.ts` fills a slot from two channels
only: a path off the repeated item (`repeat-item` residue) and a graph node the page already holds
(`graph-read`). Everything else — `authored-expression`, `element-handle-id`,
`element-handle-id-list` — has no channel in the record. So the question is only ever "does this
expression reach the graph before the mint sees it".

Measured on the tip, compiling each shape and reading the record plus the diagnostic:

| shape in a row | record | why |
| --- | --- | --- |
| `{shout(chosen)}` — bare call on a state cell | refused, warns `renders shout(chosen)` | a bare call names a function the read collector cannot see inside, so no computed is minted |
| `class={shout(theme)}` — bare call in an attribute | refused, warns `sets class from shout(theme)` | same |
| `{row.label.toUpperCase()}` — method call on the item | refused | the row binding is not a graph node, so the lift returns nothing |
| `{caption.toUpperCase()}` — method call on a prop | refused | `requireWritableRead` drops a props-only call: no write can move a prop after the render that read it |
| `aria-controls={box}` — an element handle's id | refused, warns `sets aria-controls from the id of the box element handle` | `element-handle-id` residue, refused by name |
| `{chosen.toUpperCase()}` / `{list.join('|')}` — method call on a state or shared cell | **mints**, slot is `{ graphNodeId: 'computed:templateExpression:N', graphPath: [] }` | this is the lift |

The bare call is the stand-in every re-anchored pin now uses. It is the durable one: the refusal is
a stated rule in `composite-reads.ts` ("a bare `format(value)` names a function whose body this pass
cannot see, so nothing says what would move its result"), not an accident of which operators the
collector currently walks. Each fixture declares `function shout(value: string) { ... }` at module
level beside its components.

## The rows

Re-anchored onto `shout(...)`, same assertions:

- `keyed-repeat-row-mint.test.ts` — "a repeat whose row is not mintable carries no row markup"
  (attribute), "a row whose value only rendering produces ships no markup" (text).
- `keyed-repeat-row-mint-producer.test.ts` — "a row whose value only rendering produces warns,
  naming the read" (the message now quotes `shout(chosen)`), "a wrapper whose value only rendering
  produces warns, component inside or not".
- `keyed-repeat-row-component.test.ts` — "a wrapper whose value only rendering produces ships
  neither half".
- `part-row/keyed-repeat-part-row-mint.test.ts` — "a part row projecting a value the mint cannot
  fill is refused loudly".
- `part-row/keyed-repeat-widget-read-row-mint.test.ts` — "a row whose widget read only rendering
  produces is refused, loudly" and the twin fixture inside "an unfillable read inside one row leaves
  its twin over the same cell mintable". Both still read the widget's shared cell; only the way the
  value is produced changed.

New rows, pinning the lifted form as MINTABLE so the flip is a pin rather than a silence:

- `keyed-repeat-row-mint.test.ts` — "a row whose text calls a method on an outside cell ships the
  lifted graph pair": `{list.join('|')}` over a state cell ships a `textSlots` entry naming a
  `computed:templateExpression:*` node with an empty `graphPath`.
- `keyed-repeat-row-mint-producer.test.ts` — "a row calling a method on that cell mints from the
  lifted node and stays silent": the pair to the warning above, same page, no diagnostic.
- `part-row/keyed-repeat-widget-read-row-mint.test.ts` — "a row calling a method on the widget read
  mints from the lifted node": the lift reaches shared widget state, not just page-local cells.

`keyed-repeat-row-mint-diagnostic.test.ts` builds messages directly and never compiles, so it was
not red. Its example read was `tags.join('|')` — a spelling that now mints — so it would have
taught the wrong shape; it is `shout(tags)` now, and nothing else in that file moved.

## The one red left in the verify command, and whose it is

`pnpm exec vitest run --project node packages/compiler packages/bundler` ends 1 failed | 2436
passed | 1 expected fail. The failure is
`packages/bundler/test/music-player-csr-budget.test.ts` — "page-load download: measured 137371 gzip
bytes across 108 chunks, over anchor 137234 (+128 margin) = 137362", nine bytes over.

That is not this unit's. Stashing every change here and running the same file on the untouched tip
reports the identical 137371 bytes. This unit touched only `packages/compiler/test`, so the
music-player build it measures is byte-identical either way. The budget anchor is someone's to
re-measure.
