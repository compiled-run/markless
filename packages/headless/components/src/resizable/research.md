# resizable — research

What a resizable-panels family has to do, what the references do, and every place
this one diverges with its reason. Written before the build; the build follows it,
and `note.md` records what the compiler and the runtime then forced.

## 1. References read

- **react-resizable-panels** (bvaughn) — the owner named it. Current API is a
  group (`PanelGroup`, prop `orientation`, `defaultLayout`, `onLayoutChange` /
  `onLayoutChanged`), a `Panel` (`defaultSize`, `minSize` default `0%`,
  `maxSize` default `100%`, `collapsible`, `collapsedSize` default `0%`,
  `onResize`, imperative `panelRef.collapse()/expand()/resize()`), and a
  separator (`PanelResizeHandle`) that renders `role="separator"` and, in its own
  words, "all required WAI-ARIA properties". Sizes accept `%`, `px`, `em`, `rem`,
  `vh`, `vw`. It also ships `resizeTargetMinimumSize` (a 27px desktop / 37px
  touch hit target around the divider), double-click-to-reset on the divider, and
  `autoSaveId` persistence.
- **Ark UI / Zag `splitter`** — the same widget under APG's own word. Its
  machine takes the panels as data (`panels: [{ id, minSize, maxSize,
  collapsible }]`) and the sizes as a parallel list, so a panel's identity is a
  **name**, not a position. Keyboard and pointer live on the resize trigger,
  which carries `role="separator"` with the value attributes.
- **Base UI** — ships no resizable/splitter family as of this writing, so it
  contributes nothing here.
- **WAI-ARIA APG "Window Splitter"** — the accessibility backbone, fetched and
  quoted below. It is a *widget* pattern: a focusable `role="separator"` with a
  value, not the static separator that merely draws a line.

## 2. APG Window Splitter, quoted

Required properties: `role="separator"` on the focusable splitter;
`aria-valuenow`, `aria-valuemin`, `aria-valuemax` (decimals — "typically 0" and
"typically 100"); `aria-labelledby` **or** `aria-label`; and `aria-controls`
"refers to the primary pane".

Required keys:

- Left/Right Arrow move a **vertical** splitter left and right.
- Up/Down Arrow move a **horizontal** splitter up and down.
- Enter: "If the primary pane is not collapsed, collapses the pane. If the pane
  is collapsed, restores the splitter to its previous position."

Optional keys: Home (primary pane to its smallest allowed size), End (to its
largest), F6 (cycle panes). "Fixed-size splitters do not implement arrow key
functionality."

Two things fall straight out of that wording and are easy to get backwards:

1. **The splitter's orientation is the perpendicular of the group's.** Panels
   side by side (a *horizontal* group) are parted by a *vertical* splitter, and
   Left/Right are its keys. `separator`'s implicit `aria-orientation` is
   `horizontal`, so a side-by-side group must write `aria-orientation="vertical"`
   or every reader announces the axis wrongly.
2. **The value is the primary pane's size, not the pointer's pixel offset.**
   `aria-valuemin`/`aria-valuemax` are that pane's smallest and largest allowed
   sizes, which is why 0 and 100 are the "typical" values: the pattern assumes a
   percentage.

**Where react-resizable-panels follows and where it diverges.** It follows the
role, the three value attributes and Enter-to-collapse. It adds behaviour APG
does not name — double-click to reset a panel to its default size, and a hit
target wider than the visible divider — and it takes Shift for a coarser
keyboard step, which APG also does not name. Its divergence that matters most
here is structural rather than ARIA: it addresses panels by **id** internally
(auto-generated when the consumer gives none) precisely because a panel's
position is not a stable handle to it.

## 3. Size model

**Percentages of the group, 0–100, held in one record keyed by panel name.**

```
<resizable.root defaultSizes={{ nav: 30, main: 70 }} orientation="horizontal">
  <resizable.item value="nav">…</resizable.item>
  <resizable.thumb value="nav" min={15} max={60} />
  <resizable.item value="main">…</resizable.item>
</resizable.root>
```

- **Percentage, not fraction or pixel.** APG's value attributes want a decimal
  the reader can speak, and 0–100 is what the pattern assumes. Pixel and `em`
  sizes, which react-resizable-panels supports, are not offered: they cannot be
  announced as a splitter value without conversion, and CSS already expresses a
  pixel floor better than this family could (`min-inline-size` on the panel).
- **The consumer owes each panel a `value`: its name.** This is the one piece of
  API weight the family adds, and it buys three things at once — the panel's
  size in the record, the divider's `aria-controls` target (the name is minted as
  the panel's `id`), and a `sizes` record that means the same thing after the
  panels are reordered or one is conditionally not rendered. Zag requires the
  same thing for the same reason. It is a *name*, not an index: order still comes
  from render order, and no part is ever handed its position.
- **A panel with no entry in the record is an equal share.** The CSS default is
  `flex: var(--size, 1) 1 0`, so `<resizable.root>` with no sizes at all lays
  out evenly and is draggable — the first gesture measures the panels it is about
  to move and starts from what the browser actually laid out.
- **Redistribution is pair-local.** A drag on one divider moves the panel it
  names and the panel that follows it in the same group; the two exchange the
  same number of points, so every other panel in the group is untouched and the
  group always sums to what it summed to before. react-resizable-panels cascades
  further along the row once an immediate neighbour hits its floor. That is a
  deliberate omission here, recorded in `note.md` with the route to add it (the
  divider roster carries every boundary's `ui-min`/`ui-max`, so a cascade is
  expressible without new API).
- **Constraints live on the divider, not the panel.** `min` and `max` are the
  divider's own props because they are literally its `aria-valuemin` and
  `aria-valuemax`, and because a panel cannot publish anything to the group in
  this framework (see §6). Divergence from both references, which put `minSize`
  and `maxSize` on the panel.

## 4. Collapse and expand

`collapsible` and `collapsedSize` (default 0) sit on the divider, next to the
constraints they bound. Enter toggles: the size the primary panel had is
remembered, the panel is written down to `collapsedSize`, and the next Enter puts
the remembered size back — APG's "restores the splitter to its previous
position", exactly. A collapsed panel carries `ui-collapsed`, and its `--size`
is the collapsed size, so a stylesheet can hide overflow or swap to an icon rail
without the family knowing anything about the content.

Double-click-to-reset (react-resizable-panels) is **not** shipped: it is a second
undiscoverable gesture with no keyboard equivalent in the pattern, and the same
result is one `onChange` away for a consumer who wants it.

## 5. Keyboard

`step` is a root prop, 1 percentage point by default, and Shift multiplies it by
ten — the same `BIG_STEP = 10` slider already ships, so the two families that
both move a number by key move it the same way. react-resizable-panels' default
of 10 per press is a *coarse* step by that measure; one point per press is what
APG's "moves the splitter" plus a Shift modifier implies, and 10 points is one
Shift away.

| Key | What it does |
| --- | --- |
| Left / Right Arrow | Moves a divider in a side-by-side group by `step`; mirrored in right-to-left text |
| Up / Down Arrow | Moves a divider in a stacked group by `step` |
| Shift + those arrows | Ten steps |
| Home | Primary panel to its smallest allowed size (`min`) |
| End | Primary panel to its largest allowed size (`max`) |
| Enter | Collapses the primary panel, or restores its remembered size |
| Escape | Abandons a drag in flight, leaving the sizes as they were when it started |

F6 pane cycling is not shipped: APG marks it optional, it collides with browser
and OS bindings, and nothing in the pattern depends on it. The arrows of the
*other* axis do nothing, which is what a fixed axis means; APG's "fixed-size
splitters do not implement arrow keys" is the `disabled` case here.

## 6. Pointer, touch, RTL, and the axis

- **Pointer capture on the divider**, taken through the same guard slider ships
  (`packages/headless/components/src/slider/slider-track.ts`): `setPointerCapture`
  inside a `try`, rethrowing anything that is not `NotFoundError`. A press
  replayed after its handler module loaded can arrive with the pointer already
  lifted, and capturing an id the platform is no longer tracking throws.
- **Touch** works because capture routes the whole gesture to the divider and the
  CSS default gives it `touch-action: none`; without that a drag scrolls the page.
- **RTL**: the group is measured once per gesture and the inline axis is flipped
  when the divider computes as `direction: rtl`, so dragging toward the visual
  start grows the panel that is visually there. The block axis is never mirrored.
  The same flip applies to Left/Right arrows and not to Up/Down — slider's rule.
- **The axis is read off the group**, and the divider's `aria-orientation` is its
  perpendicular (§2.1).

## 7. Nested groups

The library's recursion rule, not the references': the same parts recurse and a
nesting `resizable.item` hosts the group inside it, with no second root. An item
that carries `orientation` becomes a flex container along that axis, its children
are ordinary `resizable.item`s and `resizable.thumb`s, and a gesture finds its
group by asking which registered item is the innermost one containing the
divider — `handle.contains(node)` over the family's own rosters, never a DOM
walk. Because sizes are keyed by name in one record, a nested group needs no
second instance and no second sizes prop: `onChange` reports every panel in the
widget in one flat record, and the consumer stores that.

## 8. Controlled, uncontrolled, and persistence

`sizes` (controlled) and `defaultSizes` (uncontrolled seed), the crop shape:
pass `sizes` and a gesture reports through `onChange` and nothing moves until the
new record comes back in. `onChange` fires on every step of a drag and on every
key that moves something; `onChangeEnd` fires once the pointer releases, and on
the key itself, because a keystroke is a whole interaction.

**No storage API.** react-resizable-panels' `autoSaveId` writes localStorage from
inside the library; here the callback hands out plain data and where it is kept
is the consumer's business.

## 9. Naming

**Family: `resizable`.** The owner's word, and the researched default. The
alternative is `splitter` (Ark/Zag, and APG's own word for the divider), whose
argument is that it is the term of art and would make the divider's name
obvious. Against it: `splitter` names the *divider*, not the thing the consumer
composes, and every consumer-facing word in this space (react-resizable-panels,
the CSS one-liner people write, the owner's own request) says resizable panels.
Not a blocking question — noted and moved past.

**Parts, all from `SPEC.md`'s established set:**

| Part | Role it is | Why |
| --- | --- | --- |
| `resizable.root` | `root` | the group, and the family's state home |
| `resizable.item` | `item` — "one unit of a repeated set" | a panel is exactly that, and SPEC's recursion sentence is written in terms of `item` |
| `resizable.thumb` | `thumb` — "the handle a person drags along a track" | the divider is dragged along the group's axis |

The divider was the real question, and it is the one the owner asked to be
weighed. Two candidate readings:

1. **APG splitter**: `role="separator"` with `aria-valuenow`/`min`/`max` and
   `aria-controls`. A focusable separator *is* the window-splitter widget; ARIA
   draws the line exactly there — a non-focusable separator is structure, a
   focusable one is this widget.
2. **The crop precedent**: crop's eight resize handles are `crop.thumb` parts
   wearing `role="slider"`, because there is no APG pattern for a movable
   rectangle and `slider` is the one valued role every reader already reads well.

**Recommendation, and what is built: part name `thumb`, ARIA role `separator`.**
The two questions are separate and each takes the better answer. `thumb` is the
established role word for the dragged handle and needs no new name; `separator`
is right where `slider` was right for crop, because here the pattern *does*
exist, it is named, every reader maps it to "splitter", and the panel being
resized can be pointed at with `aria-controls` — which crop had no equivalent of.
Nothing composes the display separator planned for `base` (`base.separator`,
static, no machinery): this part owns the drag, the keyboard and the value, and
merely emits the same role. Sharing an implementation would drag machinery into a
part whose whole point is that it has none.

## 10. Divergences from the references, collected

| # | Divergence | Reason |
| --- | --- | --- |
| 1 | Panels carry a `value` name; sizes are one record keyed by it | a part cannot be told its index here, and a name survives reordering (Zag does the same) |
| 2 | `min`/`max`/`collapsible`/`collapsedSize` on the divider, not the panel | they are the divider's own ARIA value bounds, and a panel cannot publish to the group (§6, `note.md`) |
| 3 | Percentages only | the splitter value must be a decimal a reader can speak; a pixel floor is `min-inline-size` in the consumer's CSS |
| 4 | Pair-local redistribution, no cascade | scoped out of the first landing; route recorded in `note.md` |
| 5 | No double-click reset | undiscoverable, no keyboard equivalent in the pattern, one `onChange` away |
| 6 | No `autoSaveId` / storage | plain data out; persistence is the consumer's |
| 7 | `step` 1 with Shift ×10, not 10 flat | slider's shipped `BIG_STEP`, so the two number-moving families agree |
| 8 | `onChange` / `onChangeEnd`, not `onLayoutChange` / `onLayoutChanged` | SPEC's callback grammar |
| 9 | No enlarged hit target | it is `padding` and `touch-action` in the consumer's stylesheet, not JS |
