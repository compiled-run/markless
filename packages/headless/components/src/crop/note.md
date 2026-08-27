# crop

A movable, resizable rectangle over a bounded area, reported in area pixels. An
image cropper is one styled consumer of it; the family knows nothing about
bitmaps.

**Status: built, not registered.** 58 browser rows green in CSR and SSR, 10
virtual-reader rows green, real reader lanes written and **not run** — an owner
rule forbids starting NVDA or VoiceOver on a development machine, so they are
unmeasured locally and belong to CI. Registration (`src/index.ts`,
`package.json`, the shared conformance battery, the API manifest, the `#crop`
gallery section, and the `crop` key in the gallery's `FAMILY_ANCHORS`) is the
follow-up unit; nothing outside `src/crop/**` was touched.

Research: `goals/headless-components/notes/U624-crop.md` — Ark UI's image
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

## Four measured framework walls

Every one of these cost a bisect. They are the reason this file is shaped the way
it is, and none of them is a style preference.

1. **A module-scope `const` inside `state()` unregisters every field.**
   `maxWidth: NO_LIMIT` where `NO_LIMIT` is a module constant made the compiler
   report `MARKLESS_SHARED_SEED_UNKNOWN_FIELD` for all thirty-odd cells at once —
   `crop.given`, `crop.minWidth`, everything — and every part-level `computed()`
   reading the instance then failed to lower as well. `Number.POSITIVE_INFINITY`
   in the same position fails identically. The seed has to be a bare literal, so
   the two size caps are `undefined`-means-no-limit, the shape `aspect` already
   had.

2. **A cell read nested inside a call argument does not lower.** Passing
   `crop.minWidth` straight into `resizedRect(...)` leaves the instance name
   standing in the emitted handler module. Every cell is hoisted into a local
   first, throughout every shared method.

3. **A whole-object write to a state cell never reaches the graph.** `crop.own =
   rect` was accepted, ran, and changed nothing a reader or a form could see. The
   rectangle the family owns is therefore five scalar cells — `hasOwn`, `ownX`,
   `ownY`, `ownWidth`, `ownHeight` — and never one object.

4. **A `computed()` declared in the `shared()` factory does not re-derive after a
   method writes its dependency.** The value is right on first render and frozen
   afterwards, silently. Every derived value a part renders — the live readout,
   the field text, the selection's geometry, the pan offsets — is a `computed()`
   declared **in the part that renders it**, reading the cells directly. Nothing
   derived lives on the instance.

The first three are compile-time and loud. The fourth is silent, ships, and is
the dangerous one.

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

A gesture settles through a lazily woken handler module, so a synchronous read
straight after `press(...)` or a drag sees the old rectangle. Every
post-gesture assertion in `crop.browser.ts` polls. This is not flakiness
insurance; a plain `expect` there fails every time.
