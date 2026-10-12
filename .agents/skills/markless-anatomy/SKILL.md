---
name: markless-anatomy
description: Build a "Follow the wire" figure for a markless.dev docs page, a live pen-and-ink drawing of an everyday web page lying on a desk, with the state it shows drawn as a physical object and ink wires running to every spot that shows it. Use whenever you add or rewrite a markless.dev docs page (website/pages/**), explain a Markless concept visually, add a figure or diagram to the docs, or someone mentions "anatomy", the wired drawing, or website/components/figures/.
---

# Markless wired figures

Concept pages on markless.dev can carry one live drawing: a sheet of paper on a desk, drawn as a
real shop page, with the page's state standing beside it as a physical object and ink wires
running from that object to every spot on the page that shows it. Press the button on the paper
and the reader watches the change travel down the wires. Anything without a wire never changes.

The accepted reference is the State figure: `website/components/figures/state/`, placed in
`website/pages/concepts/state.mdx` under `## Follow the wire`. The owner froze it as the target.
A new figure is right when it looks like it was drawn by the same hand, on the same desk, in the
same shop. Do not edit the State figure to build a new one.

Adapted from the MIT-licensed anatomy skill by Ryan, github.com/wheresryan22/anatomy (notice in
`LICENSE-UPSTREAM`). Only the idea of a live explanatory figure and the projection helpers remain;
the isometric machine look from upstream was rejected and is not used.

## 1. Write the brief before any drawing

Write four lines and check them against the page's own prose and code. The figure may only show
what the page says is true.

1. **The one thing the reader must believe.** One sentence. State: "the cart count is wired to
   the two spots that show it, and nothing else on the page moves".
2. **The real parts, as the reader knows them.** A product, a price, a button, a cart badge.
   Name them in shop words, not framework words.
3. **What moves, and what deliberately does not.** State: the badge and the cart line move; the
   shop name, product and price have no wire and never move. The still parts are half the lesson.
4. **The misunderstanding the picture prevents.** State: "the whole page re-runs on every click".

Test: someone who skips the caption and the prose still gets the one sentence from the drawing.
If the picture needs decoding, start again.

Rejected by the owner, do not repeat:

- A tally counter beside a "stamped once" card. A metaphor the reader has to translate.
- An annotated code figure. No code in the drawing; it is a picture, not a listing.
- Isometric machines, gears, shafts and labelled boxes.

## 2. One visual language for every page

- **A real business screen.** Each figure is an everyday web page: a shop, a cart, a form, a
  feed. Not a toy, not a machine. Reuse the bean shop where it fits: `beanshop.dev`, **Beanshop**, **House blend · 250 g**, **$14**, an **Add to cart** button, a cart badge and the line
  "In your cart: N bags".
- **The page is a sheet of paper on a desk**, with a browser bar (three dots, a URL pill) drawn
  on it, one corner lifting in a soft curl, and its shadow hatched onto the desk.
- **Values are physical objects** standing on the desk: the `cart` jar holds one bean per bag. A
  paper tag on a string carries the state variable's name exactly as it is written in code.
- **Ink wires** run from the object to a crocodile clip biting every spot that shows the value. A
  second spot gets a branch off the same wire, joined at a small splice. A thin wire runs from
  the action button back into the object.
- **No wire, no change.** Static content sits on the paper with nothing attached.
- **One margin note** in the corner, handwritten capitals with a loose arrow:
  `WIRED BEFORE THE PAGE RAN`. Reuse it on every page so the language stays one language.

## 3. Ink style

Full recipes in `references/ink.md`. In words:

- **Camera:** true perspective from about 60° above, the sheet nearly square to the viewer, so
  the text on the paper reads level and the desk recedes gently.
- **Line:** a black fineliner. Every line is a filled, tapered shape: thin at both ends, heavier
  on the underside of a form, slightly wobbly, overshooting its corners. Outlines are inked in
  two to four runs with small pen lifts, and now and then a stretch is retraced.
- **Tone:** hatching in clusters of a few strokes, each cluster at its own slight tilt, following
  the form (up a jar, around a lid). Darks are cross-hatched, never filled grey.
- **Colour:** one loose yellow wash over what changes (the live numbers), spilling a little past
  the lines with a darker pool on one side. Pink only on the action button. Everything else is
  paper and ink. Faint pink-orange pencil construction lines stay visible under the ink.
- **Placement:** directly on the page, the width of the prose column. No card, no border, no
  figure number, no legend, no title inside the drawing.
- **Themes:** light and dark come from the site tokens (`--ink`, `--paper`, `--yellow`,
  `--pink`) with an `html.dark &` override block in the figure's `<style>`. A material tint such
  as bean brown may mix a literal with a token, but must carry its own dark value.

## 4. Motion

Click, Enter or Space presses the button. The order never changes:

1. The button sinks into the paper.
2. A pulse runs along the button's thin wire into the object.
3. The value changes physically: a bean drops into the jar.
4. Pulses run out along every wire from the object to every clipped spot, together.
5. At each spot the old number is struck through by a pen line and the new number is inked in
   over a fresh yellow wash. Keep at most one smaller crossed-out value per spot; older ones go.

Escape resets. An idle tour presses a couple of times and resets while nobody touches the figure,
and stops for good after the first touch. Reduced motion snaps to the result with no tour. The
tour pauses while the figure is offscreen. A visually hidden live region speaks one plain
sentence after each change ("Added a bag. The cart badge and the cart line now show 4.").

## 5. Text

- The margin note is the only text on the drawing outside the paper. **No readout or stat line**
  (the owner rejected "CART 3 · 2 SPOTS REDRAWN").
- Section heading in the "Follow the wire" style, a short instruction to the reader. Never
  "Anatomy of X".
- Section prose: one or two short sentences, naming the object and the variable, then what one
  press redraws and that nothing else moves.
- Numbers on the paper sit inline right after their label, bold and big enough to read at 390 px.

## 6. Build rules

These came from failures while building State. Walkthrough in `references/walkthrough.md`.

- **Geometry in plain `.ts`, frozen to `*.art.ts`.** The compiler rejects computed geometry as
  component props, so the scene builder (`wired.ts`) returns plain data and the test writes it to
  `wired.art.ts` with `toMatchFileSnapshot`. The `.tsrx` imports only `art`. The browser never
  computes geometry. Refresh after a geometry change from `website/` with
  `pnpm test run components/figures -u`, then read the diff.
- **Deterministic seeds.** Every random stroke takes a fixed seed; the test asserts two runs of
  `drawing()` are identical.
- **Text on the paper is real `<text>`** placed with a precomputed SVG `matrix(...)` that maps
  page millimetres onto the sheet in perspective.
- **No keyed `@for` over a computed list.** It broke resume with
  `MARKLESS_MDX_RENDER_DATA_ROOT_MISSING`. Loop over frozen art, and pick per-value pieces with
  `computed()` indexing into that art.
- **TSRX types reject SVG filter and pattern attributes, `href` and `dy`.** Texture is real
  strokes, not filters or patterns.
- **Motion is CSS driven by state.** A `beat` state flips between `odd` and `even`, which swaps
  between two identical copies of each keyframe so every press restarts the animations.
- **Order of work:** brief, then the still drawing, judged against the brief in screenshots; only
  then motion. Screenshot light, dark, 390 px wide and mid-motion, and read every image.
  Checklist in `references/verify.md`.

## Where things live

| Path | What it is |
|---|---|
| `website/components/figures/state/ink.ts` | The ink renderer: `stroke`, `outline`, `line`, `hatch`, `wash`, `pool`, `hull`, `clipTo`, `seeded`. Reusable as is. |
| `website/components/figures/state/wired.ts` | The scene builder: camera, sheet with curl, page contents, jar, beans, cords, clips, strikes, margin note. Its patterns (`sheetAt`, `sheetMatrix`, `cord`, `crocodile`, `shadowOnDesk`) are the kit for the next figure. |
| `website/components/figures/state/model.ts` | The values, the press, the tour and the spoken sentence. |
| `website/components/figures/state/state-anatomy.tsrx` | Markup, state, CSS motion, tour and accessibility. |
| `website/components/figures/state/wired.test.ts` | Model and page pins, determinism, and the freeze. |
| `website/components/figures/kit/` | The isometric port. Only `iso-kit.ts` (perspective projection) and `lathe.ts` (vector maths) are used by State; the drawing parts (`draw.tsrx`, gears, tubes, audit, motion, sketch, proof) are unused. |

When the second figure is built, move `ink.ts`, the reusable parts of `wired.ts` and the two kit
helpers into a shared folder such as `website/components/figures/ink/`, and leave each page's
figure in `website/components/figures/<page>/`. Do that move as its own change.

## Briefs for the other pages

Proposals in the same language. Read each page first and adjust to what it actually claims.

- **Computed.** A wire from the `cart` jar runs through a small price converter on the desk (bags
  in, dollars out) to the cart total. One press moves the badge, the line and the total; the
  converter never has to be told. Prevents: "derived values must be updated by hand".
- **Events.** The click itself enters the wiring: the pointer presses the button and the pulse
  starts in the button's wire, carrying the press into the jar. Prevents: "the handler runs
  separately from the page".
- **Lists.** The cart as rows, one wire per row from its own object. Adding a product adds a row
  and inks a new wire; the other rows' wires stay still. Prevents: "the list is rebuilt".
- **Conditionals.** A paper flap on a wire, "Free shipping over $40", folded shut. When the total
  passes $40 the pulse arrives and the flap opens; drop below and it closes. Prevents: "hidden
  parts are just covered".
- **Async.** A waiting spool on the wire between a delivery parcel and the page; a pencil
  placeholder holds the spot until the value arrives and is inked over. Prevents: "the page
  blocks while it waits".
- **Styling.** Two cards on the page both labelled `card`, each from a different part of the
  shop. A paint pot wired only to its own card washes that card; the other stays plain. Prevents:
  "a class name styles every match on the page".
- **How it works** pages only where a shop scene fits naturally: resuming (the page arrives
  already wired, the first press works without rewiring) and lazy chunks (a button's code
  arrives in a parcel only when that button is first pressed; untouched buttons get none).

## References

- `references/walkthrough.md`: how the State figure is built, from brief to motion.
- `references/ink.md`: the ink style with the renderer's functions and settings.
- `references/verify.md`: tests, screenshots and the review checklist.
