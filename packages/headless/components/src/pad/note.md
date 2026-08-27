# pad

A two-dimensional value control. "XY pad" is the audio industry's own name for
it — Ableton ships one, Max's `pictslider` is documented as a "KAOSS Pad-style
X/Y control" — and React Aria's `ColorArea` is what a reader hears it called: a
2D slider.

Cartesian only. There is no polar mode, no z axis, and no `Ctrl`/`Cmd` fine step.

The pad holds an array of points, each with an `id`, an `x` and a `y`. Every
point gets a handle, every handle is a real focusable control, and the arrow
keys move the focused one. A single-handle pad writes one `<pad.thumb />`; a
multi-handle pad writes a keyed repeat over `pad.state().points`.

```tsx
<pad.root defaultValue={[{ id: 'p1', x: 0.25, y: 0.1 }, { id: 'p2', x: 0.75, y: 0.9 }]}>
  <pad.label>Easing curve</pad.label>
  <pad.area style="width: 200px; height: 200px">
    <Handles />
  </pad.area>
  <pad.valuelabel />
</pad.root>
```

```tsx
function Handles() @{
  const held = pad.state();
  <div style="display: contents">
    @for (const point of held.points; key point.id) {
      <pad.thumb value={point} />
    }
  </div>
}
```

## Parts

| Part | Element | What it is |
| --- | --- | --- |
| `pad.root` | `div` | the owning element and the state home. `ui-disabled`, `ui-dragging` |
| `pad.label` | `span` | names the pad. The area and every handle point their labelling here |
| `pad.description` | `div` | supporting text, reaching the area through `aria-describedby` |
| `pad.error` | `div` | the validation message, conveyed before the description |
| `pad.area` | `div` | the bounded field. `role="group"`, `ui-plane`, owner of the pointer gesture |
| `pad.thumb` | `div` | one handle. `role="slider"`, one tab stop each, `ui-handle`, `ui-active` |
| `pad.valuelabel` | `output` | the focused handle's two numbers as text |
| `pad.field` | `input` | one handle's value as a form field. One per handle, each with its own `name` |
| `pad.indicator` | `div` | the grid or crosshair. `aria-hidden`, and never takes a pointer event |

No new roles and no new prefixes: every name above is already in `SPEC.md`.
`track` is deliberately absent — a pad has an area, not a rail.

## The reader design, and why it is not colorpicker's DOM

`colorpicker.area` solved the two-axis problem first and its lane is green, so
the *design* here is copied from it deliberately. The DOM is not, and the reason
is structural.

Colorpicker renders **two** `role="slider"` axis elements over its plane, each
laid out `position: absolute; inset: 0`. That works because a colour plane has
exactly one thumb. A pad has N. Four full-plane focusable overlays would
intercept each other's pointer events and hit-testing would be undefined —
colorpicker's own note records the related scar, where its axis controls escaped
their box and every `userEvent.click` in the suite timed out on "subtree
intercepts pointer events".

So a pad handle is **one** `role="slider"` element, sized and positioned with the
handle, carrying `aria-roledescription="2D slider"`. What colorpicker measured is
kept in full:

- **Both axes are always conveyed.** `aria-valuetext` names them — `X 0.25, Y
  0.75`. This is the whole point. `aria-valuenow` is singular, so a control that
  leans on it alone announces one axis and silently drops the other; Radzen, the
  bit platform, Zag and Mantine all do exactly that, and it is the defect
  colorpicker was built to avoid.
- **Long then short.** A run of arrow keys along one axis announces that axis
  alone (`X 0.26`, `X 0.27`). Focus arriving, a change of axis, or any pointer
  gesture restores the form that names both. The idea is React Aria's; the cost
  is one boolean cell.
- **The axis a run is on is the number the handle reports.** `aria-valuenow`,
  `aria-valuemin` and `aria-valuemax` follow it, so a reader that ignores
  `aria-valuetext` still reads the axis the person is moving. Handles no run is
  on report x.
- **No `aria-hidden` on anything focusable.** React Aria's desktop branch hides
  the unfocused axis, which trips axe's `aria-hidden-focus`. The bar here is zero
  violations with no exemption and no rule disabled.

`aria-orientation` is not set. A handle moves on both axes and a single word for
its orientation would be false half the time.

## Keys

| Key | Effect |
| --- | --- |
| `ArrowLeft` / `ArrowRight` | x by one `step` |
| `ArrowUp` / `ArrowDown` | y by one `step`. Up increases y |
| `Shift` + any arrow | ten steps |
| `Home` / `End` | the axis the handle is on, to that axis's own ends |
| all of the above | `preventDefault()`, so the page does not scroll |

Three deliberate positions:

**Up increases y.** Screen y runs down; what a value means runs up. The custom
property follows suit, so CSS paints from the bottom.

**`Home`/`End` go to the ends.** Colorpicker makes them a page step instead,
because a colour plane's corners are meaningful and its edges are not. A generic
pad has no such claim: for an easing curve or a pan/tilt head, "x all the way
left" is a thing people mean. They act on the axis the handle is on, which is
colorpicker's per-axis `Home`/`End` ported onto one element.

**`Ctrl`/`Cmd` + arrow is unbound.** Josh Comeau's pad binds nothing to it
(measured: the same 5% step as a bare arrow) and neither does our `slider`.
Leaving it alone keeps browser and assistive-technology shortcuts intact. A fine
step is a decision to take for `slider` and `pad` together, or not at all.

`PageUp`/`PageDown` are also unbound. Shift already gives the coarse step on both
axes, and a second coarse key with a different axis rule is a thing to memorise
for nothing.

## Tab order

Each handle is its own tab stop, and nothing roves. Two easing control points are
two Tab presses, which is what Josh Comeau's two native `<button>` handles give
and what people expect. His handles carry no ARIA at all — no role, no name, no
value, nothing announced when they move — so the interaction model is his and the
reader story is not.

## Units

The value range, never pixels. `minX`/`maxX`/`minY`/`maxY` default to 0..1 and
`step` to 0.01, but an audio pad can hold Hz and a pan/tilt head degrees without
rescaling in every callback. The axes need not share a range, a sign or a
meaning; `scenarios/bounds.tsrx` runs x over 0..180 and y over -30..30.

Geometry leaves as `--pad-x` and `--pad-y` on each handle, as percentages of that
axis's own range. It is per handle rather than on the root — colorpicker's
`--colorpicker-x` can live on the root because there is one thumb, and N handles
have N positions. The family builds no CSS string: the properties are the whole
output and the `<style>` block does the painting.

## CSS the family ships

Three rules, all in `@layer markless`, all keyed off attributes the parts already
write:

```css
[ui-plane]  { position: relative; touch-action: none; }
[ui-handle] { position: absolute; left: var(--pad-x, 0%); bottom: var(--pad-y, 0%); }
[ui-grid]   { position: absolute; inset: 0; pointer-events: none; }
```

`touch-action: none` is carried from colorpicker's measured set: without it a
touch scrolls the page instead of moving a handle. `[ui-plane]` is the same
attribute colorpicker's area writes, and the two rules agree — both are 2D planes
wanting the same defaults.

The consumer owes the area a size and nothing else. The family ships no
dimensions and no placement props.

## The gesture

`pad.area` owns the whole pointer gesture, and the handles own focus and keys.
A press anywhere in the field takes the **nearest** handle, focuses it and drags
it from there; distance is measured per axis as a share of that axis's own range,
so a pad whose axes hold different units still picks the handle a person aimed
at. `setPointerCapture` on the area rather than window listeners, so a drag that
leaves the field keeps arriving. The area's box is measured once when the gesture
starts, not per move.

`onDrag` fires on every move, `onChange` once the gesture settles — pointer up,
or the key that moved it. A keystroke is a whole interaction, so it only fires
`onChange`.

## `onDrag` costs the root its native `ondrag`

`PadRootProps` omits `onDrag` from `PropsOf<'div'>`, the same way `onChange` is
already omitted. Without that, TypeScript reads the prop as the union of our
callback and the DOM's own drag handler and the parameter comes out as
`DragEvent | readonly PadPoint[]` — measured, and the first thing that went red
on this tip. A pad's area is not an HTML drag source, so the trade is free.

## Controlled and uncontrolled

`value` makes the pad controlled: a gesture reports and nothing moves until the
new array is written back in. `defaultValue` seeds an uncontrolled pad, which
then keeps its own points. Same `given` / `seed` / own-copy triple as `ink`.

## Form integration

One `pad.field` per handle, each under its own `name`, each carrying that
handle's two numbers as `x,y`. React Aria splits a colour area into two hidden
`<input type="range">` elements; `datebox` measured why that is a trap here — an
input's displayed value is its `value` property while the graph writes
attributes — so the field is a clipped, `aria-hidden`, out-of-the-tab-order text
input, exactly as `ink` and `colorpicker` ship it.

## Accessibility

axe over `wcag2a` + `wcag21a` runs on every scenario in CSR and SSR, and again
with a handle focused and moved: zero violations, no exemption, no rule disabled.
Contrast is absent on purpose rather than by suppression — this family ships
unstyled.

## The real reader lanes

`pad.nvda.ts` and `pad.voiceover.ts` share `pad-transcript.ts` and run only in
CI. They settle three claims the virtual lane cannot make: whether a real reader
prefers `aria-valuetext` over the number it would otherwise read, whether it
speaks the replacement role word from `aria-roledescription`, and whether Tab
really lands on each handle in turn.

They are runnable. `PAD_ANCHOR` reads `FAMILY_ANCHORS.pad` from the gallery's own
`preview-server.ts`, so the section the readers walk to and the section the
gallery serves cannot drift apart. The gallery's `#pad` carries both shapes the
lanes need: the one-handle starter named "Shadow offset", resting at
`X 0.25, Y 0.75`, and the two-point easing curve whose handles are the two tab
stops.

## What v1 refuses

**Polar.** A `polar` boolean would fork the state (`x`/`y` → `angle`), the
keyboard (`Home`/`End` would mean 0° and 360°), the CSS, the reader text and the
number of exposed controls. `SPEC.md` bans mode enums and permits `orientation`
only because it selects an axis without forking the component; `polar` forks it.
Every library that supports both geometries ships them as two components —
Kobalte's Color Area beside its Color Wheel, Ark's Color Picker beside its Angle
Slider. A dial is one value, one `aria-valuenow`, one tab stop, `role="slider"`
with min 0 and max 360: a `dial` family, if it is ever wanted, not a switch here.

**A z axis.** ARIA has no way to expose three values on one control. The plane
already needs `aria-valuetext` to say two numbers; a third axis needs a third
element, at which point it is a pad and a `slider` composed — two families that
already ship, with a better reader experience than any fused 3D widget.

**A `polar`-adjacent `dial`, a `track` part, and placement props.** None has a
job here.

## What `colorpicker.area` should not become

Not a consumer of this family, at least not now. It is complete and green — 45
browser rows across CSR and SSR, 12 virtual-reader rows, zero axe violations —
and its divergences are colour-specific and correct: `Home`/`End` as a page step,
RTL flipping x but never y, spoken colour names in `aria-valuetext`,
`forced-color-adjust: none` for gradients. A shared implementation would have to
move its axis elements, which is the change that produced the pointer-interception
failure in the first place.

If a third 2D consumer appears and all three want the same axis machinery, that
is the moment to extract a shared helper the way `slider-math.ts` is shared —
not a shared family. `pad-math.ts` copies `slider-math.ts`'s stepping and
snapping for the same reason: one copy is cheaper than a coupling taken on the
first consumer.
