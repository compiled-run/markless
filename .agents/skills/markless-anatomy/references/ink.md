# Ink style

The look is a fineliner sketch in a paper sketchbook: black ink with real weight, clustered
hatching, a little watercolour, pencil showing through. The renderer is
`website/components/figures/state/ink.ts`; every function is pure and seeded.

## What it looks like, in words

- Lines are drawn, not ruled. A line swells in the middle and thins to a point at both ends, sits
  slightly off a perfect path, and carries on a little past the corner it was aiming for.
- Outlines are not one closed loop. The pen lifts two or three times around a shape, leaving tiny
  gaps or overlaps at the joins, and sometimes goes back over a stretch with a thinner line.
- The underside and shadow side of every object is drawn heavier than the lit side.
- Tone is hatching, laid in little groups of three to six strokes. Each group leans at a slightly
  different angle, each stroke is a quick flick with a slight curve, lengths and gaps are uneven,
  and a few strokes are missing. Hatching follows the form: up and around a jar, along a cord.
- The darkest places (the pocket under the jar, under the sheet's curl) are cross-hatched in two
  or three directions, never filled solid.
- Watercolour is one loose blob per area, bigger than the shape it colours, offset a touch, with
  a darker pool on the side away from the light. Yellow marks only what changes; pink marks only
  the action button. Kraft paper and beans get a muted local colour.
- Faint pink-orange pencil construction lines (the sheet's edges extended, the jar's axis and
  ellipses) show under the ink, as if the sketch was laid out first.
- Text on the paper is real type in the site's body face (Shantell Sans), bold for numbers and
  prices. The margin note is the display face (Joy Elia), capitals, wide letter spacing.

## Functions

| Function | Use |
|---|---|
| `seeded(seed)` | Deterministic random numbers. Give every stroke its own fixed seed. |
| `stroke(points, pen)` | One tapered stroke as a filled polygon. `pen.w` nib width, `heavy` extra weight on the underside relative to `centre`, `wobble`, `over` (overshoot). |
| `outline(points, pen, closed)` | A shape inked in two to four runs with lifts and an occasional retrace. Use for every closed form. |
| `line(points, pen)` | An open run with occasional lifts. Contours, ring arcs, cords. |
| `hatch(poly, angle, gap, seed, { cluster, trim, bow, skip })` | Clustered hatching clipped to a polygon. Returns stroked path data. |
| `wash(poly, seed, grow, rough)` | A watercolour blob over a shape. |
| `pool(poly, toward, keep)` | Shrinks a shape toward a point: the wash's darker pool. |
| `hull(points)`, `clipTo(subject, clip)` | Shadow and shade regions from projected points. |
| `resample`, `lengthOf`, `normalAt`, `pathOf`, `r1` | Path helpers; `r1` rounds to one decimal to keep the frozen art small. |

Settings the State figure uses, as a starting point:

- Sheet edge `w 2.2, heavy 1.9`; jar body `w 1.5` lit side and `w 2.4, heavy 1` shade side; page
  details `w 0.6–1.2`; beans `w 0.9`.
- Desk hatching `gap 2.4–3.4, cluster 4–6, skip 0.25–0.45, trim 0.5–0.6`: sparse and broken.
  Shadow cores `gap 1.3–1.6` with a second pass at another angle for the cross-hatch.
- Washes `grow 0.6–1.5, rough 2–4`; the live-number wash adds a `pool` at 0.55 and an edge line.

## Paint in CSS, by token

Ink fills (`fill`) for `stroke`/`outline`/`line` output; hatching is `fill: none; stroke` at
0.55–0.75 width with round caps. Washes use `mix-blend-mode: multiply`. Colours come from the site
tokens: ink `var(--ink)`, paper `color-mix(in oklch, var(--paper) 50%, white)`, washes
`var(--yellow)` and `var(--pink)`, shadows a translucent mix of `--ink`. Under `html.dark &` the
sheet goes dark, its ink turns to `--paper`, and shadows go to translucent black. Pencil lines
drop to about a third opacity in dark.

## Things that make it look wrong

- Uniform stroke width, closed perfect outlines, evenly spaced parallel hatching: it reads as a
  vector diagram.
- Grey fills for shadow, SVG filters, patterns or noise textures (TSRX rejects them anyway).
- Colour on things that do not change, or a second accent colour.
- A frame, card background, figure number, legend or title around the drawing.
- Isometric projection: text on the paper slants and the scene reads as a technical drawing.
