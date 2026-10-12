# Verify

Look at the figure the way the owner will, before the owner does. Rendering is cheap; guessing is
expensive. Read every screenshot you take.

## Tests and types

From `website/`:

```sh
pnpm test run components/figures       # the model, page pins, determinism and the freeze
pnpm test run components/figures -u    # after a geometry change: rewrite <name>.art.ts, then read its diff
pnpm run typecheck                     # the site's TSRX-aware check
```

From the repository root: `pnpm run typecheck` and `pnpm ci:local --fast`.

The figure's test (copy `state/wired.test.ts`) should pin:

- the model: start value, one step per press, the wrap, the spoken sentence, the tour;
- one crossed-out group and one live digit per wired spot, and one pulse per wire;
- the static group reads no state;
- exactly one margin note and no readout line;
- each live number sits in the same text run as its label;
- `drawing()` gives the same result twice, and each part has enough strokes to not look thin;
- the freeze, written with `toMatchFileSnapshot`;
- the page imports and renders the figure.

## Screenshots

Use the running dev server (`pnpm dev` in `website/`; do not stop one that is already running)
and the chrome-devtools MCP tools or a Playwright script. Clip to `figure.anatomy`.

- Light at desktop width.
- Dark: toggle the site theme (the page's theme switch), same width.
- 390 px wide: no sideways scroll; every number and the margin note still read.
- Mid-motion: press and shoot about 300 ms (pulse to the object), 1 s (bean falling), 1.6 s
  (pulses to the page) and 2.6 s (strike and new number), then settled.
- Reduced motion: emulate `prefers-reduced-motion: reduce`; a press snaps to the result and no
  tour runs.
- Close-ups at device scale 3 or 4 of each clip, the crossed-out numbers and the jar.
- Reload and check the console: no resume errors such as `MARKLESS_MDX_RENDER_DATA_ROOT_MISSING`.

## Review checklist

Brief

- [ ] Without the caption or prose, the drawing says the one sentence of the brief.
- [ ] The parts are a real everyday page, named in shop words. No code, no metaphor to decode.
- [ ] Wired spots and unwired content are obvious at a glance.

Language

- [ ] Paper sheet on a desk, browser bar, curled corner, shadow on the desk.
- [ ] The value is a physical object with a tag named exactly like the state variable.
- [ ] A wire and a clip for every spot that shows the value, and none anywhere else.
- [ ] The only text off the paper is the margin note `WIRED BEFORE THE PAGE RAN`.

Ink

- [ ] Perspective from about 60° above, sheet square to the viewer, text level.
- [ ] Tapered lines with weight on the shade side, overshoot and pen lifts.
- [ ] Clustered, form-following hatching; cross-hatched darks; no grey fills.
- [ ] Yellow wash only on what changes, pink only on the button, faint pencil lines underneath.
- [ ] No card, border, figure number or legend; the drawing spans the prose column.
- [ ] Light and dark both look intentional.

Motion and access

- [ ] Press, pulse into the object, the object changes, pulses out on every wire, strike and
      ink-in, in that order.
- [ ] At most one smaller crossed-out value per spot.
- [ ] Click, Enter and Space press; Escape resets; the idle tour stops after a touch and pauses
      offscreen; reduced motion snaps.
- [ ] The live region speaks one plain sentence per change.

Page

- [ ] Heading in the "Follow the wire" style; one or two short sentences of prose.
- [ ] Numbers inline after their labels, bold, readable at 390 px.
