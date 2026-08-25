# slider — implementation notes

## The keydown path reads the computed

The thumb's keydown reads its own `now` computed. It used to re-derive the value
inline from the shared state cells, because a handler's first read of a sync
computed answered undefined — a resumed page re-derives a sync computed only once
a dependency has been written, and the arithmetic over undefined reported NaN. The
compiler now serves the value the render already derived, so the handler reads the
computed, and `slider.browser.ts` pins the first keystroke after a resume on both
the one-value and the two-value slider.

## Why the values are not `start` / `end` computeds on the factory

`SliderInstanceState` describes the effective numbers as living on the instance,
and they cannot: SSR derives a factory `computed()` only for a component whose
markup reads it **directly**. A part-local `computed()` over `slider.start`
reconstructs the instance from the state cells alone, reads undefined, and drops
the attribute — five SSR rows go red on `aria-valuenow` the moment the parts read
factory computeds. A shared method reading one is worse: nothing derives it, so
nothing serves it, and the first read after a resume is undefined again. Until a
factory computed derives for any component that reads it, every part and every
shared method reads the state cells through `slider-math.ts`.

## What `slider-math.ts` carries

Not a workaround — it is where the family's arithmetic lives, and every function
in it still has a caller:

- `currentStart` / `currentEnd` / `currentOf` — the seed-versus-written fallback,
  called by each part's `computed()` and by the shared methods.
- `boundedValue`, `snapToStep`, `clamp`, `keyTarget`, `valueAtFraction`,
  `pointerFraction`, `nearerSide` — the value and geometry rules the keydown
  handler and the drag methods apply.
- `rootStyleText`, `thumbStyleText`, `valueText`, `reportedValue` — the text and
  the callback payload the parts publish.

The drag and key methods no longer re-read a value they just wrote: they report
`bounded`, which is exactly what went into the cell.
