# Walkthrough: the State figure

How `website/components/figures/state/` was built, in the order to repeat for a new page. Read
the source beside this; numbers below are the ones the accepted figure uses.

## 1. Brief

- Believe: the cart count is wired to the spots that show it, and nothing else moves.
- Parts: a bean shop page (`beanshop.dev`, Beanshop, House blend · 250 g, $14), an Add to cart
  button, a cart badge on the header, the line "In your cart: N bags".
- Moves: the badge and the cart line. Still: shop name, product, price, URL.
- Prevents: "every click re-runs the whole page".

Section on the page (`state.mdx`):

```mdx
## Follow the wire

The jar is `cart`, one bean per bag. Before the page runs, Markless wires it to every spot that
shows it, so **Add to cart** redraws the cart badge and the cart line, and nothing else.

<StateAnatomy />
```

## 2. Model (`model.ts`)

Plain values and pure functions only: `START = 3`, `add(cart)` (wraps after 99), `bags(cart)`,
the shop strings, `SLOTS` (where the crossed-out and live numbers sit on the cart line, in page
millimetres), `flip(beat)`, `describe(cart, added)` for the live region, and `TOUR`
(`add, add, rest, rest, reset`). The `.tsrx` and the test both read from here.

## 3. Scene (`wired.ts`)

Everything is computed in 3D world units, projected once, and returned as SVG path strings.

- **Camera.** `perspectiveProjection` from `kit/iso-kit.ts` with azimuth 94°, elevation 60°,
  distance 84, aimed at the middle of the scene; `fitProjection` fits it into the 680 × 430
  viewBox with 30 px headroom for the margin note. Azimuth near 90° keeps the sheet square to the
  viewer, so page text reads level.
- **Light.** One direction, from upper left. `shadowOnDesk(p)` drops any point along it onto the
  desk; all cast shadows (sheet curl, jar, cords, clips) use it, so they agree.
- **Sheet.** 23 × 14.8 units. `sheetAt(u, v, lift)` maps page coordinates to world, including a
  cylindrical curl past a diagonal fold at the near right corner. `sheetMatrix(u, v)` returns an
  SVG `matrix(...)` for placing real `<text>` on the page at that point in perspective.
- **Page contents.** Browser bar (hatched tone, three dots, URL pill), shop name, a kraft coffee
  bag with a bean label, product and price, a pink Add to cart button with a hatched side so it
  stands off the paper, the cart icon with its badge, and the cart line. The yellow wash sits
  behind the badge and the live number only.
- **Jar.** A turned profile (`JAR_PROFILE`) drawn by its contour lines, ring arcs split into
  front and back, form-following strokes on the shaded side, ring strokes in the darkest pocket,
  a knurled lid and a few glints. The tag hangs from the neck on a string, the word `cart` written
  on it with its own matrix.
- **Beans.** Thirty beans settled in a pile, front ones first so the first few show. Each is a
  shaded ellipsoid with a crease, plus the vertical `drop` distance it falls from the lid.
- **Wires.** `cord(points, radius, seed)` makes a tube: paper fill, a thin lit edge and a heavier
  shade edge, small twist ticks, broken tone strokes along the shade side, and a hatched shadow
  where it lies on the desk. It also returns the centre path and its length for the pulse. The
  main cord leaves the lid, lands on the desk behind the sheet, and ends at a crocodile clip
  beside the badge; a branch splices off it to a clip at the live number; a thin cord runs from
  the button round the sheet's edge to a socket low on the jar.
- **Clips.** `crocodile(rear, tip, seed)` lies on the page with its jaws open on the wired spot.
- **Strikes.** One pen stroke per wired spot, with its length for the draw-on animation.
- **Note.** The margin note's position and a loose hand-drawn arrow to the main cord.
- `drawing()` returns all of it as one object.

## 4. Freeze (`wired.test.ts`)

The test serialises `drawing()` into `wired.art.ts` with `toMatchFileSnapshot`, and pins the
behaviour: two crossed-out groups, two live digits, two pulses to the page, the static group has
no reactive reads, exactly one margin note, the live number in the same text run as its label,
determinism, and enough strokes in each part that the drawing has not gone thin.

## 5. Still drawing first

Render the frozen art with no motion and judge it against the brief before writing any CSS
animation: does the wire read as going to exactly two spots? Do the shop name and price look
obviously unwired? Can you read every number at 390 px? Fix the drawing, not the prose.

## 6. Markup and motion (`state-anatomy.tsrx`)

- The whole drawing is one `<button class="stage" aria-label="Add to cart">` inside a
  `<figure>`. The `<svg>` is `aria-hidden`; a visually hidden `<figcaption>` describes the scene
  in plain words; a visually hidden `<p aria-live="polite">` shows `describe(...)`.
- State: `cart`, `newest` (the previous value, drawn crossed out), `beat` (`rest`/`odd`/`even`)
  and `touched`. `--cart` on the `<svg>` shows the beans: each bean's opacity is
  `clamp(0, var(--cart) - var(--i), 1)`. The falling bean's paths come from `computed()` values
  that index into `art.beans`.
- Paint order is document order: pencil, desk shadows, sheet and its static group, the live group
  (button, washes, numbers), jar back, glass, beans, jar front, lid, tag, falling bean, cord
  shadows, cords, clips, pulses, pencil over the jar, the note.
- Motion is CSS keyed off `data-beat`. Each animation name has an `-a` and `-b` copy and the beat
  picks one, so a press always restarts it. Timeline after a press: button sink 0–420 ms; pulse to
  the jar from 240 ms; bean drop from 860 ms; beans update at 1320 ms; pulses to the page from
  1150 ms; strike from 1950 ms; old number slides into its crossed slot at 2250 ms; new number
  inks in from 2300 ms; wash fades in from 2400 ms.
- The pulse is a short round dash (`stroke-dasharray: 3 100000`) moved along the cord's centre
  path by animating `stroke-dashoffset` to minus the path length.
- Tour: `onVisible` on the figure starts a 3.4 s interval that plays `TOUR`, skipped while an
  `IntersectionObserver` reports it offscreen or once `touched` is set; it returns early under
  reduced motion, and a reduced-motion media query turns off all animation in the scene.
- Escape sets the cart to 0 and clears the crossed-out value.

## 7. Verify

Follow `verify.md`. The screenshots in `website/components/figures/state/shots/` are from
earlier rounds (isometric, code, sketch and an older coffee-cups version with a readout line, all
rejected); judge against the live State page, not those files.
