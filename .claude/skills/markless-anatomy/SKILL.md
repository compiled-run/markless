---
name: markless-anatomy
description: Build a live pen-and-ink figure for a markless.dev docs page, one idea drawn as 2 or 3 objects where the reader acts once and sees one change, in the same hand and ink as the State figure. Use whenever you add or rewrite a markless.dev docs page (website/pages/**), explain a Markless concept visually, add a figure or diagram to the docs, or someone mentions "anatomy", the wired drawing, or website/components/figures/.
---

# Markless ink figures

Concept pages on markless.dev can carry one live drawing that makes one idea click. Draw the
relationship, not a scene around it: two or three objects, one press, one consequence.

The accepted reference is the State figure: `website/components/figures/state/`, placed in
`website/pages/concepts/state.mdx` under `## Follow the wire`. The owner froze it as the target.
A new figure is right when it looks like it was drawn by the same hand, in the same ink. Each
concept gets its own 2- or 3-object picture of its own relationship; the desk, the shop and the
wires belong to State. Do not edit the State figure to build a new one.

Adapted from the MIT-licensed anatomy skill by Ryan, github.com/wheresryan22/anatomy (notice in
`LICENSE-UPSTREAM`). Only the idea of a live explanatory figure and the projection helpers remain;
the isometric machine look from upstream was rejected and is not used.

## 1. Write the brief before any drawing

Write the brief and check it against the page's own prose and code. The figure may only show
what the page says is true. If the brief needs more than four short lines, the figure is too big.

Core rules:

- **One idea per figure.** The idea itself is the picture, not a scene around it. No whole shop
  page unless the idea is about the page.
- **Two or three objects.** If you need a fourth, the figure explains too much: split it or cut it.
- **One action and one change.** The reader presses once, then one thing changes. Nothing else
  moves.
- **At most about five words of text inside the drawing.** Names the code uses (`bags`, `total`)
  and values count; sentences do not.
- **A metaphor only if it maps one to one** onto the mechanism, including what it cannot do (a
  shadow cannot be moved on its own, as a computed value cannot be set). Otherwise draw the
  concept literally.
- **No metaphor repeats across the site.** Wires, cords, clips and jars stay on State only.

1. **The one thing the reader must believe.** One sentence. State: "the cart count is wired to
   the two spots that show it, and nothing else on the page moves".
2. **The real parts, as the reader knows them.** A product, a price, a button, a cart badge.
   Name them in shop words, not framework words.
3. **What moves, and what deliberately does not.** State: the badge and the cart line move; the
   shop name, product and price have no wire and never move. The still parts are half the lesson.
4. **The misunderstanding the picture prevents.** State: "the whole page re-runs on every click".

The brief must pass every point before drawing:

- [ ] The one sentence the reader must believe, in 15 words or fewer.
- [ ] Objects counted: 2 or 3 (a background sheet counts as one).
- [ ] Each object maps to one thing in the code (`mugs`, `total`), and nothing is left over.
- [ ] If it is a metaphor, list the metaphor's properties the concept lacks. The list is empty, or
      none of them shows in the drawing.
- [ ] The reader does exactly one action, and the effect is visible within one glance of it.
- [ ] Something that deliberately does not change is shown, and there is at most one such thing.
- [ ] Words on the drawing: only code names and values.
- [ ] Eraser test: remove each object in turn; if the sentence still comes across, remove it.
- [ ] Not a picture another concept page already uses (no wires outside State).
- [ ] Squint test: shrunk to a thumbnail, you can still see what relates to what.
- [ ] A reader who skips the prose gets the sentence from the drawing alone.

If the picture needs decoding, start again.

Rejected by the owner, do not repeat:

- A tally counter beside a "stamped once" card. A metaphor the reader has to translate.
- An annotated code figure. No code in the drawing; it is a picture, not a listing.
- Isometric machines, gears, shafts and labelled boxes.
- The first Computed figure: a whole shop page around a small idea, with a three-line recipe card
  ("too much going on, too much to explain"). No recipe card of several steps.
- Wires and pipes on every page ("why is everything just wires and pipes?").

## 2. The State figure's own scene

The State figure's picture, not a rule for other pages. A new figure takes only the shared hand
in section 3.

- **A real business screen.** State is an everyday web page, the bean shop: `beanshop.dev`,
  **Beanshop**, **House blend · 250 g**, **$14**, an **Add to cart** button, a cart badge and
  the line "In your cart: N bags".
- **The page is a sheet of paper on a desk**, with a browser bar (three dots, a URL pill) drawn
  on it, one corner lifting in a soft curl, and its shadow hatched onto the desk.
- **Values are physical objects** standing on the desk: the `cart` jar holds one bean per bag. A
  paper tag on a string carries the state variable's name exactly as it is written in code.
- **Ink wires** run from the object to a crocodile clip biting every spot that shows the value. A
  second spot gets a branch off the same wire, joined at a small splice. A thin wire runs from
  the action button back into the object.
- **No wire, no change.** Static content sits on the paper with nothing attached.
- **One margin note** in the corner, handwritten capitals with a loose arrow:
  `WIRED BEFORE THE PAGE RAN`.
- **Motion:** the button sinks into the paper; a pulse runs along its thin wire into the jar; a
  bean drops in; pulses run out along every wire together; at each spot the old number is struck
  through and the new one is inked in over a fresh yellow wash, keeping at most one smaller
  crossed-out value per spot.

## 3. Ink style, shared by every figure

Full recipes in `references/ink.md`. In words:

- **Camera (State):** true perspective from about 60° above, the sheet nearly square to the
  viewer, so the text on the paper reads level and the desk recedes gently.
- **Line:** a black fineliner. Every line is a filled, tapered shape: thin at both ends, heavier
  on the underside of a form, slightly wobbly, overshooting its corners. Outlines are inked in
  two to four runs with small pen lifts, and now and then a stretch is retraced.
- **Tone:** hatching in clusters of a few strokes, each cluster at its own slight tilt, following
  the form (up a jar, around a lid). Darks are cross-hatched, never filled grey.
- **Colour:** one loose yellow wash over what changes, spilling a little past the lines with a
  darker pool on one side. Pink only on what the reader presses. Everything else is paper and
  ink. Faint pink-orange pencil construction lines stay visible under the ink.
- **Placement:** directly on the page, the width of the prose column. No card, no border, no
  figure number, no legend, no title inside the drawing.
- **Themes:** light and dark come from the site tokens (`--ink`, `--paper`, `--yellow`,
  `--pink`) with an `html.dark &` override block in the figure's `<style>`. A material tint such
  as bean brown may mix a literal with a token, but must carry its own dark value.

## 4. Motion and play

Click, Enter or Space presses. One press, cause then effect, once. The object that does not
change stays still. No motion without a reason. Escape resets.

Figures are toys. The one main action carries the lesson, but the figure must also reward play.
The bar is the chess figure the owner praised ("AWESOME. But you could only click on it."):

- **Every object responds to hover.** It lifts or tilts, shows its name or value in ink, and the
  cursor feels it (a piece casts a moving shadow, a tile wobbles).
- **Drag, keyboard and touch work too,** not only press: drag a tile's number up and down like a
  dial, move a piece to a square, arrows and Enter.
- **One unexpected surprise that still teaches.** Try to set the computed total and it shakes and
  refuses; drop a chess piece on an illegal square and it slides back.
- **Respond instantly.** Never make the reader wait on a tour.
- Still one idea and 2 or 3 objects. Delight comes from how the objects respond, not from adding
  objects.

An idle tour only hints while nobody touches the figure, stops for good after the first touch,
and pauses while the figure is offscreen. Reduced motion keeps every interaction but drops the
animation, and runs no tour. A visually hidden live region speaks one plain
sentence after each change ("Added a bag. The cart badge and the cart line now show 4.").

## 5. Text

- Words on the drawing are code names and values only, about five at most. No margin note unless
  it is the one belief in three words (State's `WIRED BEFORE THE PAGE RAN` is State's own).
  **No readout or stat line** (the owner rejected "CART 3 · 2 SPOTS REDRAWN").
- Section heading: a short instruction to the reader, as State's "Follow the wire" is. Never
  "Anatomy of X".
- Section prose: one or two short sentences, naming the object and the variable, then what one
  press changes.
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

The owner's picks. Read each page first and check the brief against what it actually claims.

- **State.** Keeps its frozen figure. If it is ever simplified: jar, one badge with a wire, one
  price with no wire.
- **Computed.** Three paper tiles: `[mugs 2] + [coasters 3] = [total 5]`. Tap a left tile and
  its number goes up; the total re-inks. The total has no grip: tap it and it only shakes.
  Belief: the total is made from the other two and cannot be set by hand.
- **Events.** A keyboard key, a small card, an open hand. Press `a`: one card reading
  `key: "a"` slides out and lands in the hand. No press, no card. Belief: the handler is handed
  the browser's real event, once per event.
- **Conditionals.** A sticky note on a sheet, and a waste bin. Write on the note and close it:
  the note goes in the bin and the sheet is bare. Open again: a fresh blank note. Belief: closing
  removes the element and what it held; opening builds a new one.
- **Lists (keyed).** Three name cards in three slots, one card ticked. Press Reverse: the cards
  travel to new slots and the tick rides with its card; the slots stay put. Belief: a row and its
  state move together because the key names the row.
- **Async.** A finished ink sheet with one pencil spot. The answer arrives and is inked over the
  pencil; pick again and the old ink stays, with a pencil `…` beside it, until the new ink
  replaces it. Belief: waiting is one spot's block, and the old answer stays until the new one is
  ready.
- **Styling (scoped).** Two identical cards, both labelled `.card`, each with a file tab, and one
  paint pot with a matching tab. Press: the wash lands on the matching card only. Belief: the
  same class name in two files does not collide.
- **Links (in-place navigation).** A clipboard: the board and clip stay, the sheet under the clip
  is swapped, and the tag on the clip re-inks with the new address. Belief: the shell stays;
  only the content and the address change. (For the build-checked links page: a key that fits
  only doors that exist.)
- **Resuming.** The chess board the owner praised, kept and simplified to a few pieces: it arrives
  mid-game and the next move lifts one piece, made fully playable as in section 4. Belief: the
  position arrives with the page, and the browser carries on from it. (The research pick, a relay
  baton passed mid-stride, is the fallback.)

Anything else: derive a new picture by the same rules, and check it against these so no
metaphor repeats. Alternatives and sources are in `goals/docs-rewrite/figure-research.md`.

## References

- `references/walkthrough.md`: how the State figure is built, from brief to motion.
- `references/ink.md`: the ink style with the renderer's functions and settings.
- `references/verify.md`: tests, screenshots and the review checklist.
