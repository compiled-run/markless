# crop — research, then the build

**Date:** 2026-08-27
**Owner ruling:** the family is `crop` — a generalized cropper: a movable,
resizable rectangle over a bounded area. Image-specific behaviour (bitmap zoom,
rotate, flip, `getCroppedImage`) is **not** family surface; `scenarios/image.tsrx`
shows an `<img>` inside the area and a consumer reading the crop rect to draw a
canvas.

Status: **built.** Registration (`src/index.ts`, `package.json`, the conformance
battery, the API manifest, the gallery section) is the follow-up unit; nothing
outside `src/crop/**` was touched.

---

# Part 1 — Research

## 1. What exists

| Library | Ships it? | As what |
| --- | --- | --- |
| **Ark UI** (Zag) | yes | `ImageCropper` — the only headless, parts-based implementation |
| Radix, Base UI, Headless UI, Melt, Bits UI, React Aria | no | nothing in this space |
| **react-easy-crop** | n/a | the "content moves, frame fixed" cropper; ~3k stars |
| **react-image-crop** | n/a | the "frame moves, content fixed" cropper; the only one with real handle-level keyboard support |
| **Cropper.js v2** | n/a | custom elements (`<cropper-selection>`, `<cropper-handle>`); the imperative ancestor of the whole space |
| **d3-brush** | n/a | not an image tool at all — the general 2D rectangular brush, and the closest thing to what this family actually is |

The WAI-ARIA Authoring Practices has **no pattern for a movable, resizable
rectangle**. There is no role, no worked example, and no keyboard contract. As
with `ink`, that absence is the headline research finding: the reader design here
is ours to make and to defend, not one to copy.

## 2. Ark UI's image cropper, in detail

Anatomy: `Root`, `Viewport`, `Image`, `Selection`, `Handle`, `Grid`.

Root props (defaults as documented): `aspectRatio`, `cropShape:
'rectangle' | 'circle'` (default `'rectangle'`), `fixedCropArea` (false),
`initialCrop: Rect`, `minWidth` (40), `minHeight` (40), `maxWidth` (Infinity),
`maxHeight` (Infinity), `nudgeStep` (1), `nudgeStepShift` (10), `nudgeStepCtrl`
(50), `onCropChange`, plus a whole bitmap layer we do not take: `zoom`,
`defaultZoom`, `minZoom` (1), `maxZoom` (5), `zoomStep` (0.1), `zoomSensitivity`
(2), `rotation`, `defaultRotation`, `flip`, `defaultFlip`, `onZoomChange`,
`onRotationChange`, `onFlipChange`, `translations`.

Data attributes: `data-scope="image-cropper"`, `data-part`, plus `data-fixed`,
`data-shape`, `data-pinch`, `data-dragging`, `data-panning`, `data-axis`,
`data-position`, `data-disabled`, `data-measured`, `data-ready`,
`data-flip-horizontal`, `data-flip-vertical`.

Three things it gets right and we take:

- **The rectangle is its own part, and the handles are their own part.** That is
  the parts decomposition a headless family needs; every other reference either
  renders both for you or asks for a config object.
- **`fixedCropArea`** — one boolean picks between the two interaction models the
  whole field is split over (below). A boolean, not a mode enum.
- **Three nudge steps.** Arrow, Shift+arrow, Ctrl/Cmd+arrow. That is the only
  keyboard grammar in the space that has been thought about.

Two it gets wrong for us: the crop rectangle carries **no role and no name**, so
a reader meets an unlabelled `div` — and `cropShape: 'rectangle' | 'circle'` is a
mode enum, which SPEC forbids outright.

## 3. react-easy-crop — "content moves, frame fixed"

`aspect` (default 4/3), `cropSize` (computed from `aspect` and the media size when
absent), `zoom` between `minZoom`/`maxZoom` (default 1),
`onCropComplete(croppedArea, croppedAreaPixels)` — the first in **percentages of
the image**, the second in **natural image pixels**.

Its model is the other half of the field: the crop frame is painted at a fixed
place in the viewport and the *media* is dragged underneath it. This is what
`fixedCropArea` in Ark and `fixed` here select. Keyboard is arrow keys panning the
media and nothing else; there is no handle-level keyboard at all.

Its two-payload `onCropComplete` is the clearest statement of the units problem
(§6).

## 4. react-image-crop — the one with a keyboard

Props: `crop: Crop`, `aspect`, `minWidth`/`minHeight`/`maxWidth`/`maxHeight`,
`keepSelection` (false), `disabled` (false), `locked` (false), `ruleOfThirds`
(false), `circularCrop` (false), `onChange(pixelCrop, percentCrop)` (required),
`onComplete`, `onDragStart`, `onDragEnd`, `renderSelectionAddon`. The value is
`{ unit: 'px' | '%', x, y, width, height }`.

Read from source (`src/ReactCrop.tsx`), the parts we actually care about:

- the crop rectangle is `role="group"`, `tabIndex={0}`, `aria-label={ariaLabels.cropArea}`,
  with an `onKeyDown` that nudges the whole rect;
- each handle is `role="button"`, `tabIndex={0}`, `aria-label={ariaLabels.nwDragHandle}`
  and friends, `data-ord="nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"`, with
  its own `onKeyDown` that nudges that ordinal's edge;
- the nudge constants are static: `nudgeStep = 1`, `nudgeStepMedium = 10`
  (Shift), `nudgeStepLarge = 100` (Ctrl/Cmd).

So the two libraries that thought about the keyboard disagree only on the third
step: 50 (Ark) versus 100 (react-image-crop). The owner ruled 50.

`role="button"` on a handle is the finding we reject. A handle whose arrow keys
move an edge along an axis between two bounds is a **slider**, and `role="button"`
throws away `aria-valuenow` — a reader is told "button" and never told where the
edge is.

## 5. Cropper.js v2 — the imperative ancestor

Custom elements: `<cropper-canvas>`, `<cropper-image>`, `<cropper-shade>`,
`<cropper-handle>`, `<cropper-selection>`, `<cropper-grid>`, `<cropper-crosshair>`,
`<cropper-viewer>`.

`<cropper-selection>`: `x`, `y`, `width`, `height` (all 0), `aspectRatio` (NaN),
`initialAspectRatio` (NaN), `initialCoverage` (NaN), `dynamic`, `movable`,
`resizable`, `zoomable`, `multiple`, `keyboard`, `outlined`, `precise` — all
booleans defaulting to false. One `change` event carrying `{ x, y, width, height }`,
bubbling and **cancelable**, which is how a consumer vetoes a move.

`<cropper-handle>` has one `action` attribute: `"select" | "move" | "scale" |
"n-resize" | "e-resize" | "s-resize" | "w-resize" | "ne-resize" | "nw-resize" |
"se-resize" | "sw-resize" | "none"`.

Two findings:

- `action="n-resize"` is **the enum prop SPEC forbids**, and it is the exact
  decision this family had to make (§7). Eleven string values on one attribute is
  what "no mode/role/type enum props" exists to prevent.
- `keyboard` as an opt-in boolean, defaulting to **false**, with arrow keys moving
  1 pixel and no modifiers. Keyboard support is not a feature flag here; it is the
  only reason the family can ship.

## 6. d3-brush — the general 2D brush, and the units lesson

`d3.brush()` (plus `brushX`, `brushY`) is the same widget with no image in it: a
selection `[[x0, y0], [x1, y1]]` in the coordinates of the SVG it is attached to,
rendered as `.overlay`, `.selection`, and eight `.handle--n .handle--e .handle--s
.handle--w .handle--nw .handle--ne .handle--se .handle--sw` rects. Events:
`start`, `brush`, `end` — the three-phase shape our `onDrag`/`onChange` split
collapses into two.

Its modifier grammar is worth recording even though we take none of it: Alt
resizes from the centre, Shift locks the aspect or the axis, Space locks the
selection's size and moves it.

**d3-brush has no keyboard support at all.** The brush is pointer-only, and has
been since it shipped. That is the fact the owner named in the packet, and it is
the reason this family cannot copy any 2D-rectangle precedent for its keyboard:
the one general implementation of the widget simply does not have one.

The units lesson is d3's too. A brush reports in the coordinate space of the
element it is attached to, and the consumer composes that with their own scale to
get data units. We do the same: **the rect is in area pixels** — offsets from the
crop area's own inline-start and block-start edges, sized in the area's own
pixels. Not natural-image pixels, and not percentages of the image:

- the family has no image. `crop.area` may hold an `<img>`, a `<video>`, a map, a
  chart, or nothing at all, so "the natural size of the media" is not a quantity
  the family can name.
- natural-image pixels would make the family responsible for the media's intrinsic
  size, its `object-fit`, and its device-pixel-ratio — that is the *image
  recipe's* job, and `scenarios/image.tsrx` does exactly that conversion in nine
  lines of consumer code (`naturalWidth / clientWidth` as the scale).
- area pixels are what the pointer already speaks and what CSS already lays out,
  so `--x`/`--y`/`--width`/`--height` go straight into `inset-inline-start` and
  `inline-size` with no arithmetic at all.

react-easy-crop hands back **both** payloads because it could not choose. We
choose, and the second payload is a consumer's `scale` multiply.

## 7. The eight handles: why booleans, not `position`

Every reference spells the handle's identity as an enum: Ark's `data-position`,
react-image-crop's `data-ord="nw"`, Cropper.js's `action="nw-resize"`, d3's
`.handle--nw`. SPEC forbids that shape outright: *"Native platform words;
booleans over enums; no mode/role/type enum props."*

The alternatives measured against SPEC:

| Shape | Verdict |
| --- | --- |
| `<crop.thumb position="nw">` | enum prop. Forbidden. |
| eight part names (`crop.thumbnw`, …) | eight names outside SPEC's role table, and `nw` is not a prefix. Forbidden. |
| inferred from declaration order, calendar-style | silent, unwritable by hand, and breaks the moment a consumer renders fewer than eight. Rejected. |
| **two boolean pairs on one part** | SPEC's own preferred shape, and it is exactly expressive enough. |

The four booleans are `inlineStart`, `inlineEnd`, `blockStart`, `blockEnd` — one
per edge, flow-relative the way `slider.thumb`'s `side` already is. One boolean
names an edge handle; one from each axis names a corner handle; the eight legal
combinations are exactly the eight handles:

```
<crop.thumb blockStart />                  <crop.thumb blockStart inlineEnd />
<crop.thumb inlineStart />                 <crop.thumb inlineEnd />
<crop.thumb blockStart inlineStart />      <crop.thumb blockEnd inlineEnd />
```

…and so on. They surface as the presence attributes `ui-inline-start`,
`ui-inline-end`, `ui-block-start`, `ui-block-end`, which is what a consumer's CSS
positions each handle with. No new role, no new prefix, no enum.

## 8. Accessibility — what the references do, and what we do

Nothing in the space exposes a usable reader surface. Ark renders no role on the
selection; react-easy-crop renders none; Cropper.js's custom elements carry none;
react-image-crop is alone in rendering anything at all, and it renders
`role="group"` on the rect and `role="button"` on handles that are really sliders.

There is no APG pattern to lean on, so the design is built from what is true:

- **The rectangle is a `role="group"`**, named by `crop.label`, carrying
  `aria-roledescription="crop area"` (owner ruling) so a reader says what kind of
  group it is. It is a tab stop and it owns the move keys. `role="application"` is
  refused, the same way `ink` refused it.
- **Its `aria-describedby` names a live `<output>`** the root always renders,
  carrying `x, y, w×h` in area units. This is the whole reason a reader can use
  the widget: a rectangle that moves has no text, so without the live region
  nothing on the page says where it went. Same device as `ink`'s stroke count,
  same reason.
- **Each handle is a `role="slider"`**, not a button: it has a value (its edge's
  coordinate), a range (the area's bounds on that axis), and arrow keys that move
  it — that is the definition of the role. `aria-valuenow` is the edge coordinate,
  `aria-valuemin`/`aria-valuemax` are `0` and the area's size on the axis,
  `aria-orientation` is the axis the edge runs against. A corner handle owns two
  edges: it reports the inline edge as its value and both coordinates as
  `aria-valuetext`, because ARIA gives a slider one value and a corner has two.
- **Home/End** on the selection snap it to the area's edges on the axis the last
  arrow key used (inline until an arrow says otherwise); on a handle they send
  that edge to the area's own bounds. A `role="slider"` without Home/End is not
  the pattern.

## 9. Divergence table

SPEC requires every reference name that does not carry over to be recorded with
its mapping.

| Reference | Their name | Ours | Why |
| --- | --- | --- | --- |
| Ark UI | `ImageCropper` | `crop` | owner ruling: a movable/resizable rectangle over a bounded area. The image is one consumer, as the signature was one consumer of `ink`. |
| Ark UI | `Viewport` | `crop.area` | SPEC: `viewport` is explicitly **not** a role; `area` is one — a bounded region with its own interaction rules. Third shipped use, after colorpicker's plane and ink's surface. |
| Ark UI | `Image` | *(dropped)* | the consumer's own `<img>`, inside `crop.area`. A family that owned the tag would own `object-fit`, `srcset` and decoding for no gain. |
| Ark UI | `Selection` | `crop.selection` | new role, **ruled by the owner for this family**. Nothing in SPEC's table describes "the thing you drag and resize": `content` is what a trigger reveals, `item` is one of a set, `track` is a rail. |
| Ark UI | `Handle` | `crop.thumb` | SPEC role: the handle a person drags. Second shipped use after slider. |
| Ark UI | `Grid` | `crop.indicator` | SPEC role: a purely-presentational state marker. `grid` is not a role and would collide with the ARIA one. |
| Ark UI | `data-position` | `inlineStart`/`inlineEnd`/`blockStart`/`blockEnd` booleans, surfaced as `ui-inline-start` etc. | SPEC: booleans over enums, no `data-*` state (§7). |
| Ark UI | `aspectRatio` | `aspect` | react-image-crop's shorter spelling, and `ratio` is implied by a bare number. |
| Ark UI | `fixedCropArea` | `fixed` | the "crop area" half is the family name already; `ui-fixed` is the attribute. |
| Ark UI | `initialCrop` | `defaultValue` | our controlled/uncontrolled grammar, as every other family spells it (`value`/`defaultValue`). |
| Ark UI | `onCropChange` | `onChange` | SPEC: the primary change callback is `onChange`. |
| Ark UI | `nudgeStep`, `nudgeStepShift`, `nudgeStepCtrl` | `step` | one prop; the modifiers are fixed at ×10 (Shift) and ×50 (Ctrl/Cmd). Three props for one quantity is a config object in disguise, and no consumer has ever needed a different multiplier. |
| Ark UI | `minWidth`/`minHeight`/`maxWidth`/`maxHeight` | unchanged | carries over; defaults 40/40/∞/∞ as Ark ships them |
| Ark UI | `cropShape: 'rectangle' \| 'circle'` | *(dropped)* | a mode enum, forbidden by SPEC — and it changes nothing but the consumer's `border-radius`, which is theirs. |
| Ark UI | `zoom`, `rotation`, `flip`, `minZoom`, `maxZoom`, `zoomStep`, `zoomSensitivity`, and their callbacks | *(dropped)* | bitmap behaviour. Owner ruling: not family surface. |
| Ark UI | `translations` | *(dropped)* | the handle names are `aria-label` defaults a consumer overrides through the spread, the way every family here does it. |
| Ark UI | `data-dragging` / `data-panning` | `ui-dragging` / `ui-resizing` | SPEC: `ui-*` presence attributes, no `data-*` state. The split we need is move-versus-resize, not drag-versus-pan. |
| react-easy-crop | `onCropComplete(area, areaPixels)` | `onChange(rect)` | one payload, in area pixels (§6). |
| react-easy-crop | `cropSize` | `value.width` / `value.height` | the rect is one object; a second size prop would have two owners. |
| react-image-crop | `crop: { unit: 'px' \| '%' , … }` | `value: { x, y, width, height }` | no unit enum: area pixels always (§6). |
| react-image-crop | `onComplete` | `onChange` | ours commits on pointer-up and on the key; the during-gesture stream is `onDrag`. |
| react-image-crop | `onChange` (fires per move) | `onDrag` | their `onChange` is our `onDrag`; the names are swapped, which is exactly the sort of thing this table exists for. |
| react-image-crop | `locked` + `disabled` | `disabled` | two near-synonyms; `disabled` is the platform word. |
| react-image-crop | `keepSelection` | *(dropped)* | it only matters for click-to-draw-a-new-rect, which this family does not do. |
| react-image-crop | `ruleOfThirds` | `crop.indicator` | a part the consumer mounts, not a boolean that renders markup behind their back. |
| react-image-crop | `renderSelectionAddon` | *(dropped)* | children of `crop.selection`. |
| react-image-crop | `role="button"` on handles | `role="slider"` | §8: a handle with a value, a range and arrow keys is a slider. |
| Cropper.js v2 | `<cropper-selection>` `movable`/`resizable`/`zoomable`/`multiple`/`keyboard` | *(dropped)* | five booleans that turn the widget's own behaviour off. Keyboard is not optional here; the rest is `disabled`. |
| Cropper.js v2 | `action="nw-resize"` | four booleans (§7) | the enum SPEC forbids, in its purest form. |
| Cropper.js v2 | `initialCoverage` | *(dropped)* | it needs the area measured before first paint, which this framework has no hook for (§10). `defaultValue` is explicit instead. |
| d3-brush | `[[x0, y0], [x1, y1]]` | `{ x, y, width, height }` | the shape every other reference and every form field already speaks. |
| d3-brush | `start` / `brush` / `end` | `onDrag` / `onChange` | two callbacks: during, and committed. `start` carries no information a consumer cannot get from the first `onDrag`. |
| d3-brush | Alt (from centre), Shift (lock), Space (move) | *(dropped)* | undiscoverable, unannounced, and none is reachable from a keyboard-only user. Shift is already the ×10 nudge. |

## 10. What this family asks of the framework

Four walls, every one of them measured by bisect during the build below, and
none of them a style preference. The first three are compile-time and loud; the
fourth is silent, ships, and is the dangerous one.

**1. A module-scope `const` inside `state()` unregisters every field.** Seeding
`maxWidth: NO_LIMIT`, where `NO_LIMIT` is a module constant, made the compiler
report `MARKLESS_SHARED_SEED_UNKNOWN_FIELD` for all thirty-odd cells at once —
`crop.given`, `crop.seed`, `crop.minWidth`, everything — and every part-level
`computed()` reading the instance then failed to lower as well, with 238
`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` errors on top.
`Number.POSITIVE_INFINITY` in the same position fails identically. A bare
literal is required. The two size caps became `undefined`-means-no-limit, the
shape `aspect` already had. The diagnostic points at the *consumer* of the
shape (`crop.given = value` in the root) rather than at the seed that broke it,
which is what made this expensive to find.

**2. A cell read nested inside a call argument does not lower.** Passing
`crop.minWidth` straight into `resizedRect(...)` leaves the instance name
standing in the emitted handler module. Already known — ink's note records it —
but it is worth restating that it applies to *every* argument position, not just
the first.

**3. A whole-object write to a state cell never reaches the graph.** `crop.own =
rect` compiled, ran, and changed nothing a reader or a form could see; a probe
proved the surrounding statements executed. Arrays work (ink writes
`pad.strokes`), plain objects do not. The rectangle the family owns is therefore
five scalar cells — `hasOwn`, `ownX`, `ownY`, `ownWidth`, `ownHeight`.

**4. A `computed()` declared in the `shared()` factory does not re-derive after a
method writes its dependency.** This is the new one and the serious one. The
value is correct on first render and frozen for the rest of the page's life, with
no diagnostic at any layer. A raw cell bound straight to an attribute updates
fine from the same write, which is what made the difference visible: a probe
binding `ui-own-x={crop.ownX}` showed the write landing while the `computed()`
reading the identical cell kept serving its first value. The family's fix is that
nothing derived lives on the instance — every value a part renders is a
`computed()` declared in that part.

ink's note already records a neighbouring symptom ("a `shared()` method reading a
`computed` declared beside it coming back empty on a served page"). This is the
same seam from the other side, and together they say the same thing: a `computed`
on a `shared()` factory is not dependable across the resume boundary.

**A fifth thing, which is a test-authoring fact rather than a defect.** A gesture
settles through a lazily woken handler module, so a synchronous read straight
after a `press` or a drag sees the old value. Seventeen rows failed on this and
on nothing else; every post-gesture assertion polls. Worth a line in the testing
doctrine, because the failure looks exactly like a broken family.

There is also one design constraint that is not a defect but is felt here:
`@markless/core` exports `state`, `computed`, `element`, `shared` and `storage`
and nothing that runs on mount, and SPEC's "Timing" rule forbids the frame
polling that would substitute. So `crop.area` can only be measured inside an
event handler, and a virtual-cursor reader arriving cold reads a handle's
`aria-valuemax` as the rectangle's own far edge rather than the area's size — a
true lower bound, replaced by the real one on the first focus. A mount hook or a
sanctioned resize-observation idiom would close it.

---

# Part 2 — The build

## Delivered

`packages/headless/components/src/crop/` — `crop.tsrx`, `crop-types.ts`,
`crop-math.ts`, `index.ts`, `note.md`, `crop.browser.ts`, `crop.sr.ts`,
`crop-transcript.ts`, `crop.nvda.ts`, `crop.voiceover.ts`, and seven scenarios
(`basic`, `aspect`, `fixed`, `image`, `controlled`, `disabled`, `form`).

Parts: `root` `label` `description` `error` `area` `selection` `thumb`
`indicator` `field`. One new role, `selection`, ruled by the owner for this
family; every other name was already in SPEC. `area` is its third shipped use
after colorpicker's plane and ink's surface, `thumb` its second after slider.

Nothing outside `src/crop/**` changed and no dependency was added. Registration —
`src/index.ts`, `package.json`, the shared conformance battery, the API manifest,
the `#crop` gallery section, and the `crop` key in the gallery's `FAMILY_ANCHORS`
(which the transcript writes out as a literal today for exactly that reason) — is
the follow-up unit.

## Measured

- **58 browser rows green**, CSR and SSR, including a pointer drag and a keyboard
  path on every one of the eight handles, aspect lock through both, the min and
  max clamps, fixed-mode panning, the controlled round-trip, the form value, the
  `ui-*` flags, and axe `wcag2a` + `wcag21a` at zero on all seven scenarios in
  both render modes.
- **10 virtual-reader rows green**, including the one that settles the shape: the
  reader speaks `crop area` in place of the word "group", which is what
  `aria-roledescription` is for and what makes a role-less widget legible.
- **Real reader lanes written and not run.** An owner rule forbids starting NVDA
  or VoiceOver on a development machine. `crop-transcript.ts` carries the three
  claims the virtual lane cannot make: whether a shipping reader honours the
  roledescription, whether it speaks a handle's value when an arrow moves an
  edge, and whether the live readout is heard when the rectangle moves.

## What the image recipe turned out to cost

Nine lines in the consumer, exactly as §6 predicted:
`naturalWidth / clientWidth` is the scale, four multiplies give the rect in the
picture's own pixels, and `drawImage` cuts it out. `scenarios/image.tsrx` shows
it and a browser row pins the numbers (an 800×600 picture shown at 400×300, so
every number doubles). No part of that belongs in the family.
