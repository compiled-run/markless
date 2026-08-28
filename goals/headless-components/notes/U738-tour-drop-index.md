# tour stops being told its index, and the CSR first paint refuses it

`tour.item` takes no `index`. Types, `.tsrx` and all six scenarios are migrated,
`rg -n "index=" packages/headless/components/src/tour/scenarios` is empty, and
`rg -n "index" packages/headless/components/src/*/*-types.ts` shows no
consumer-facing index prop in any family. The SPEC no longer names tour as
migrating.

**It is not green, and the wall is outside the family.** On a CSR first paint a
card's own place answers a wrong number, so a tour that is already showing before
the first gesture paints every card `hidden`. Four browser rows and one
screen-reader row are red on exactly that shape. The site is named below.

## The authored shape, and the two refusals it had to be written around

Each card binds itself into the tour's roster and derives its place; the tour's
length is how long the roster is:

```
const mine = element<HTMLDivElement>();
const at = computed(() => tour.itemEls.indexOf(mine as HTMLDivElement));
const cardCount = computed(() => tour.itemEls.length);
const isCurrent = computed(() => {
  const showing = tour.open;
  const on = tour.step;
  return showing === true && on === at;
});
```

`el={[item.el, tour.itemEls, mine]}` — three handles on one host compile.

**A count may not be spent inside a second `computed()`.** U736's deferral
carries an expression a markup text or host attribute slot prints; a derived cell
holding the count publishes a binding nothing downstream resolves. So the forward
gate and "n of m" are written inline at the slot, not in a cell:

```
disabled={tour.disabled === true || tour.loop !== true && tour.step >= forwardCount - 1}
{`${tour.step + 1} of ${labelCount}`}
```

**Parentheses refuse it too, and that is not documented anywhere.** The walk in
`passes/semantic-graph/roster-count.ts` (`spentAt`) steps through a
`BinaryExpression`, a `LogicalExpression`, a unary, a conditional, a member and a
call argument — and stops at anything else, including this AST's parenthesized
node, which it spells `'n'`. So:

```
disabled={a === true || (b !== true && c >= total - 1)}   MARKLESS_ROSTER_COUNT_NOT_A_NUMBER "-"
disabled={a === true || b !== true && c >= total - 1}     deferred, exact
```

Same expression, same precedence, opposite verdict. One `case 'n': child =
parent; continue;` in `spentAt` closes it.

`{`${position} of ${labelCount}`}` printed **"undefined of 3"**: inside the
deferred thunk the captured `position` const does not carry the computed's value,
so the position arithmetic is written inline at the slot too. Only the count
reads are rewritten into the thunk; every other const in a deferred expression is
captured as it stood.

`next()`/`prev()` became `walk(direction, steps)`: the length is handed in by the
part that asked to move, which is where the roster-dependent cell lives.

## The wall: a CSR first paint answers a position more than once

`renderRosterPosition` (`packages/web/src/prerender/shared-seed-slot.ts`) does not
look a part up. It COUNTS ASKS, per `(instance, roster, handle)` key, and returns
the running total:

```
const taken = positions.taken.get(key) ?? 0;
positions.taken.set(key, taken + 1);
return taken;
```

That is exact when the render asks once per part. The server does. The CSR
prerender path does not. Measured on `scenarios/disabled.tsrx` (two steps, open
at first paint), with `ui-pos={at}` written on the card and read 400ms after
mount:

```
SSR   save pos=0 hidden=false   share pos=1
CSR   save pos=3 hidden=true    share pos=5
```

The first card burned asks 0,1,2,3 and printed the last of them; the second
burned 4,5. `isCurrent` compares `tour.step` (0) against 3 and is correctly false
against a wrong number, so both cards paint `hidden`.

Cutting the readers of `isCurrent` down to one (`hidden` alone, no `ui-current` /
`ui-open` / `ui-closed`) does **not** fix it — CSR still paints the first card
hidden — so the multiplier is not the number of markup slots reading the
derivation, and no shape a family can write reduces the asks to one.

Nor does resume recover it. `wireRosterRevisions` bumps the roster node at wire
time and `at` has a demand subscription (it is in the payload with a derive
symbol and an `element:itemEls` dependency, confirmed by dumping
`state.computed`), but the page still reads `hidden` 400ms after mount.

## Why it did not surface before

Only a tour that is showing before the first gesture reaches it. Every other
browser scenario opens by a click, and any write to family state re-derives
`isCurrent` against a position the client reader answers with a real
`roster.indexOf(member)`. `otp` cannot reach it either: no otp row asserts a
derivation of a position at CSR first paint with no keystroke.

This is adjacent to U731 but not the same bug. U731 fixed "the cell was never
written"; here the cell is written, with the wrong number, by a counter that
advanced too far.

## The two sites, neither in this card's contract

- `packages/web/src/prerender/shared-seed-slot.ts` — `renderRosterPosition`
  counting asks rather than answering a part's place.
- `packages/web/src/prerender/evaluator.ts` — the CSR path that asks a card's
  position four times where the server asks once.

The fix is one of: make the CSR path ask once per rendered part, or make the
position idempotent per key rather than a running counter (the ask already
carries the handle id, so a first-ask-wins map answers every later ask with the
same number and costs nothing on the server, where there is only one ask).

## Verification, as it stands

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project ui packages/headless/components/src/tour` —
  **34 passed, 4 failed**. All four are CSR `Disabled` rows, all four wait on
  `shown(StepSave)`, and all four are the defect above. Every SSR row is green,
  including the forward gate at first paint and "n of m" in both regimes.
- `pnpm test:sr` — **336 passed, 2 failed, 9 expected fail**. One is
  `calendar > the tab stop follows the day the keyboard walks onto`, the
  pre-existing red on the tip. The other is
  `tour > a tour served open announces its first card without any press` — the
  same CSR first paint, through the reader.

Nothing was skipped, weakened or marked `test.fails` to make this read better.
The rows are left red because they pin the defect.
