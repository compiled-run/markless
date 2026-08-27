# crop

A movable, resizable rectangle over a bounded area, reported in area pixels. An
image cropper is one styled consumer of it; the family knows nothing about
bitmaps.

**Status: registered.** 58 browser rows green in CSR and SSR, 10 virtual-reader
rows green, and the shared conformance battery green in both modes. Real reader
lanes are written and **not run** — an owner rule forbids starting NVDA or
VoiceOver on a development machine, so they are unmeasured locally and belong to
CI, where all three reader matrices now carry `crop`.

The picture recipe sits in the gallery's own `#crop-image` section rather than
inside `#crop`: the reader transcript asserts `#crop` serves exactly eight
sliders, and the recipe's corner handle would be a ninth.

Research (the crop research memo in the goal notes): Ark UI's image
cropper, react-easy-crop, react-image-crop, Cropper.js v2 and d3-brush, read
against this library's own SPEC, with the divergence table SPEC requires.

## Parts

`root` `label` `description` `error` `area` `selection` `thumb` `indicator`
`field`.

One new role: **`selection`**, ruled by the owner for this family. Nothing in
SPEC's table describes "the thing you drag and resize" — `content` is what a
trigger reveals, `item` is one of a repeated set, `track` is a rail. Everything
else is already in SPEC: `area` is its third shipped use after colorpicker's
plane and ink's surface, and `thumb` its second after slider.

## The eight handles are booleans, not a position enum

Every reference spells a handle's identity as an enum — Ark's `data-position`,
react-image-crop's `data-ord="nw"`, Cropper.js's `action="nw-resize"`,
d3-brush's `.handle--nw`. SPEC forbids that shape, so a handle names the edges it
owns with four booleans:

```tsx
<crop.thumb blockStart inlineStart />   {/* a corner */}
<crop.thumb inlineEnd />                {/* an edge  */}
```

One boolean from each axis makes a corner; one on its own makes an edge; the
eight legal combinations are exactly the eight handles. They surface as
`ui-inline-start`, `ui-inline-end`, `ui-block-start` and `ui-block-end` for the
consumer's CSS.

## The rectangle is a named group; the handles are sliders

There is no WAI-ARIA Authoring Practices pattern for a movable, resizable
rectangle — no role, no worked example, no keyboard contract. So:

- `crop.selection` is `role="group"` named by `crop.label`, carrying
  `aria-roledescription="crop area"`. A real reader speaks the roledescription in
  place of the word "group", which is the whole point of it.
- The root always renders one `<output aria-live="polite">` carrying
  `x, y, w×h` in area units, and the selection is `aria-describedby` it. A
  rectangle that moves has no text, so without this nothing on the page says
  where it went. Same device as `ink`'s stroke count, same reason.
- Each `crop.thumb` is `role="slider"`, **not** `role="button"` as
  react-image-crop ships it: a handle has a value (its edge's coordinate), a
  range (the area's bounds on that axis) and arrow keys that move it, which is
  the definition of the role. `role="button"` throws the value away.
- A corner owns two coordinates and ARIA gives a slider one, so a corner reports
  its inline edge as `aria-valuenow` and both numbers as `aria-valuetext`.
- `role="application"` is refused, the same way `ink` refused it.

## Keys

| Key | On the rectangle | On a handle |
| --- | --- | --- |
| Arrows | move by `step` | move that handle's edge by `step` |
| Shift + arrow | ten steps | ten steps |
| Ctrl/Cmd + arrow | fifty steps | fifty steps |
| Home / End | to the area's edges on the axis the last arrow used | that edge to the area's own bounds |

One `step` prop, not Ark's three (`nudgeStep`, `nudgeStepShift`,
`nudgeStepCtrl`): the multipliers are fixed at ×10 and ×50.

A handle sits inside the rectangle, so its keys and presses bubble to the
selection too. The selection hands `event.target` to the shared method, which
drops anything raised inside a handle — `handle.contains(node)` on the roster the
family bound, which is the one containment predicate SPEC allows.

## Fixed mode

`fixed` picks the other interaction model in the field (react-easy-crop's, Ark's
`fixedCropArea`): the rectangle stays put and the content pans underneath it. The
family moves nothing it does not own — the root publishes `--pan-x` and `--pan-y`
and the consumer applies them, as `scenarios/fixed.tsrx` shows:

```css
transform: translate(var(--pan-x, 0px), var(--pan-y, 0px));
```

They sit on the root rather than the area so they inherit down to content
wherever it sits, and so `crop.area`'s `style` attribute stays the consumer's.

The family owns the `style` attribute on **`crop.root`** (the pan offsets) and on
**`crop.selection`** (`--x`, `--y`, `--width`, `--height`). Style those two from a
stylesheet; `crop.area` and `crop.thumb` are yours.

## The framework walls this family met

Every one of these cost a bisect during the build. Two of the four turned out not
to be walls at all once they were chased with a witness, and one has since been
fixed in the compiler; what is left is recorded here honestly, because the next
family author reads this file rather than the goal notes.

1. **A seed that is not a bare literal — fixed.** Seeding a `state()` cell from a
   module-scope `const` used to unregister *every* field on the instance, and the
   only diagnostic named a consumer of the shape rather than the seed. Fields now
   register from the authored keys, so a module constant is a legal seed again.

   The residue that outlived that fix is closed too, and the two size caps no
   longer trade in `undefined`. The seed used to be all-or-nothing over the whole
   object: one property the build could not fold emptied the lot, so seeding
   `maxWidth` and `maxHeight` with `Number.POSITIVE_INFINITY` turned 8 of the 58
   rows red and not only cap rows — `name` came back `''`, a disabled crop
   reported `tabindex="0"`, and the rectangle fell back to `0, 0, 40×40`. The
   fold is now per property: the literal-seeded fields fold, the two infinities
   ride beside them as a carried expression, and the root's per-instance writes
   land on top of both on CSR and on SSR. So the family seeds both caps
   `Number.POSITIVE_INFINITY` outright, `sizeCeiling` takes a plain `number`, and
   the instance fields are `number` rather than `number | undefined`. All 58 rows
   are green with the infinity seed in place.

   The caps carry their `Number.POSITIVE_INFINITY` as a destructuring default on
   `CropRoot`, the same way `minWidth` carries `40`, because a component body may
   seed a shared instance only from a bare prop or a constant —
   `crop.maxWidth = maxWidth ?? Number.POSITIVE_INFINITY` is refused at compile
   time with `MARKLESS_SHARED_SEED_UNSUPPORTED`. The prop stays optional and its
   public type is unchanged; only the recorded default is new.

2. **A cell read nested inside a call argument does not lower.** Passing
   `crop.minWidth` straight into `resizedRect(...)` leaves the instance name
   standing in the emitted handler module. Every cell is hoisted into a local
   first, throughout every shared method.

3. **Not a wall: a whole-object write to a state cell.** `crop.own = rect` was
   reported here as compiling, running and reaching nothing. It does not
   reproduce; the rectangle the family owns is one `own` cell holding a
   `CropRect`, written whole by every gesture, and the readers see it.

4. **Not a wall: a `computed()` declared in the `shared()` factory.** This file
   reported such a computed as frozen after a method writes its dependency. It
   does not reproduce either — it was the seed defect above, whose symptom was
   every derived read on the instance coming back empty at once. `held`, the live
   readout, the field text, the selection geometry and the pan offsets are all
   factory `computed()`s again, and they follow a method's write in CSR and SSR.

Retiring 3 and 4 costs one thing worth naming. The widget root serves whatever
factory computed a method reads, so `held` — the only one the methods read — adds
one `marklessSsrServeComputed` call to the root's server render. The module still
shrank, because five copies of the same nine-cell derivation collapsed into one:
`crop.tsrx`'s served module went **78,099 → 69,998 bytes**, and the object cell
and the factory move each paid for themselves (−6,016 and −2,085).

## Measurement, and what it costs

The family measures `crop.area` through its own handle — never a query — but
there is no mount hook in `@markless/core` and SPEC's "Timing" rule forbids the
frame polling that would paper over it, so the measurement is taken inside an
event handler like every other measurement in this package. Three routes take it:
the first `pointerdown` on the rectangle or a handle, the first key, and
`focusin` on the area (which bubbles from the rectangle and from every handle).

What that costs is the window before any of them: a virtual-cursor reader
browsing the page cold reads a handle's `aria-valuemax` as the rectangle's own far
edge on that axis rather than the area's size. It is a true lower bound, never a
wrong direction, and the first focus replaces it with the real one.

Right-to-left is handled — the inline axis is flipped from the area's computed
`direction` at gesture start, the way `slider-track.ts` does it. `writing-mode:
vertical-*` is **not**: it maps the block axis onto the pointer's x, and this
family does not.

## Tests read after a gesture, never during

SPEC "Testing" carries this rule now: a gesture settles through a lazily woken
handler module, so every post-gesture assertion in `crop.browser.ts` polls.
