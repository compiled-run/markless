# slider — implementation notes

## The keydown path reads the computed

The thumb's keydown reads its own `now` computed. It used to re-derive the value
inline from the shared state cells, because a handler's first read of a sync
computed answered undefined — a resumed page re-derives a sync computed only once
a dependency has been written, and the arithmetic over undefined reported NaN. The
compiler now serves the value the render already derived, so the handler reads the
computed, and `slider.browser.ts` pins the first keystroke after a resume on both
the one-value and the two-value slider.

## The effective values are `start` / `end` on the instance

SSR now derives a factory `computed()` for any component that reaches it — through
a part-local `computed()`, a template expression, or a handler read — so the
factory owns `start` and `end` the way `SliderInstanceState` always described, and
every part and shared method reads those two instead of rebuilding the numbers
from the state cells.

## What `slider-math.ts` carries

Where the family's arithmetic lives, and every function in it still has a caller:

- `currentStart` / `currentEnd` — the seed-versus-written fallback, called by the
  factory's `start` and `end` computeds and nowhere else.
- `boundedValue`, `snapToStep`, `clamp`, `keyTarget`, `valueAtFraction`,
  `pointerFraction`, `nearerSide` — the value and geometry rules the keydown
  handler and the drag methods apply.
- `rootStyleText`, `thumbStyleText`, `valueText`, `reportedValue` — the text and
  the callback payload the parts publish.

The drag and key methods no longer re-read a value they just wrote: they report
`bounded`, which is exactly what went into the cell.
