# U594 — tour finish

## Measurement gate, taken first

After merging the pilot branch and the held tour branch, the client seed pass
reaches the writer that `tour.item` renders in its own template. Measured on
`scenarios/basic.tsrx` with three steps:

| Render | `tour.root` `ui-max` | `tour.valuelabel` |
| --- | --- | --- |
| CSR | `3` | `1 of 3` |
| SSR | `3` | `1 of 3` |

The gate is met on both modes, so the unit proceeded rather than blocking.

## The remaining red, root-caused

With the count reading 3, one row was red — and on **both** render modes, not
only the served one as the packet expected: `next and prev walk the steps and
report each one`, failing on `tour.backtrigger` not carrying `disabled` at step 0.

It is a family defect, not a framework one, so it is fixed in the family.

**Mechanism, in plain words:** `TourBackTrigger` and `TourForwardTrigger` each
declared their gate cell as `const isOff`. Two components in one module naming a
`computed()` the same thing collapse to a single cell, and the survivor answers
for both. Every binding of either trigger's `isOff` was therefore evaluating the
forward trigger's formula, which at step 0 with three steps is `false` — so no
`disabled` attribute was written on either button.

**How that was established**, by binding probe cells to attributes on the back
trigger and reading the rendered markup:

- The three graph reads inside the cell are each correct: `tour.disabled` is
  `false`, `tour.loop` is `false`, `tour.step` is `0`.
- The exact expression, stringified, evaluates to `"true"`.
- A byte-identical copy of the whole cell under the name `probeJ` lands correctly
  as a present boolean attribute; the copy named `isOff` never appears.
- Moving the `isOff` declaration to last changed nothing, so it is not
  declaration order.
- Removing the `disabled` binding and keeping only a neutral `ui-probe-*` binding
  changed nothing, so it is not the `disabled` attribute name.

The name is the only remaining variable, and renaming to `isBackOff` /
`isForwardOff` turns the row green. Nothing is reported by the compiler when this
happens: the attribute is silently absent while every read inside the cell
measures correctly.

**Carried upstream:** `numberbox` has the identical collision unfixed —
`NumberboxBackTrigger` and `NumberboxForwardTrigger` both declare `const isOff`
over different formulas, in
`packages/headless/components/src/numberbox/numberbox.tsrx`. It is outside this
unit's file contract and was not touched. Whether the right fix is renaming there
too or a compiler report on the collision is an owner call.

## Result

All 16 rows of `tour.browser.ts` are green — 8 rows across CSR and SSR: the closed
tour, opening and closing, the count read off the cards, the next/prev walk, focus
landing in the incoming card, Escape, an outside press, and axe over `wcag2a` and
`wcag21a` closed and on each step.

## What else shipped

- `tour.sr.ts` — virtual-reader rows: the card announced as a dialog named by its
  title, its description, "n of m", a served-open tour, the backdrop not being
  walked into, an unreached step being out of reach, the triggers named, Escape
  closing, and focus returning to the control that started the tour.
- `tour-transcript.ts`, `tour.nvda.ts`, `tour.voiceover.ts` in the shape
  `calendar` and `menu` use. Never executed locally.
- `scenarios/served-open.tsrx` and `scenarios/loop.tsrx` beside the existing
  `basic.tsrx`.
- `note.md` rewritten to the shipped shape, with the blocking-gap section removed
  and the shared-cell-name landmine recorded.

## The count is text, not a value

"n of m" is the `tour.valuelabel` span's own text, read by walking into the card.
It is not `aria-valuetext`: the card is `role="dialog"`, which takes no value, and
there is no `role="meter"` in this library. The `tour.sr.ts` row asserts the
reader reads `1 of 3` inside the card.

## Open

- Three of the six scenarios were not written: `controlled`, `disabled` and a
  placement scenario for the four `side` values. `basic`, `served-open` and `loop`
  are in.
- The tour has no `FAMILY_ANCHORS` entry, because the gallery is the follow-up
  unit's file. `tour-transcript.ts` spells `TOUR_ANCHOR = '/#tour'` itself, which
  is what `note.md` already ruled for an unregistered family. The registration
  unit moves it into the table.
