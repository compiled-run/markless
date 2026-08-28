# resizable — implementation notes

Research: `research.md` beside this file.

## Shape

One widget family, `resizableState`, rooted by `resizable.root`. Three parts:

- `resizable.root` — the group. Holds the sizes (`sizes` controlled,
  `defaultSizes` seed, plus what a gesture wrote), the axis, `step`, `disabled`,
  the two callbacks, and the `element()` rosters for the panels and dividers.
- `resizable.item` — one panel. Its `value` is its name.
- `resizable.thumb` — the divider: APG's window splitter, `role="separator"`.

Nested groups need no second instance: a panel that carries `orientation` hosts
its own row or column of the same parts, and every gesture scopes itself by
asking which registered panel is the innermost one containing the divider
(`handle.contains(node)` over the family's own rosters). One sizes record covers
the whole widget because a panel's key is a name, not a position.

`ui-*` markers are `ui-panels` (root), `ui-panel` (item) and `ui-divider`
(thumb) — the crop precedent of a marker per part, spelled for what the CSS keys
off rather than for the part name, and checked against every other family so a
default cannot leak sideways.

## Why the panels are named

A part cannot be told its position here. There is no ordered registration into an
enclosing widget instance (tree's note records the three closed routes), and a
part reading a roster at render time reads it before anything is bound. So the
size of a panel cannot be looked up by index, and the divider's `aria-valuenow`
— which must be right *before* the first gesture, since a focusable separator
with no value is announced as 50 — cannot be derived from its neighbours.

`value` on both parts closes all of it at once: the panel's size is
`sizes[value]`, the divider's value is `sizes[value]` for the panel it names, and
the name is minted as the panel's `id` so `aria-controls` reaches it. Zag's
splitter requires panel ids for the same reason. Order still comes from render
order — the divider finds the panel it takes from by walking its group's roster
— so no part is ever handed an index.

**The consequence to know:** panel names must be unique in the page, because they
become element ids. Two widgets on one page name their panels apart
(`scenarios/two-groups.tsrx` is the witness). A consumer who writes their own
`id` on a panel owes themselves the matching `aria-controls` on the divider.

## Constraints live on the divider

`min`, `max`, `collapsible` and `collapsedSize` are the divider's props, not the
panel's — a divergence from both references, which put `minSize`/`maxSize` on the
panel. Two reasons: they are literally the separator's `aria-valuemin` and
`aria-valuemax`, so the one element that must announce them is the one that owns
them; and a panel has no way to publish anything to its group here, so a limit
written on a panel would have to be read back off the DOM at gesture time to be
used at all.

## What is not built, and the route if it is wanted

1. **Cascade past the immediate pair.** A drag moves the divider's panel and the
   panel behind it; react-resizable-panels keeps pushing along the row when a
   neighbour bottoms out. The route is already in place: every divider publishes
   `ui-min` and `ui-max`, and `thumbEls` is the group's divider roster, so the
   whole group's limits are readable from one gesture without new API.
2. **Double-click to reset**, **`autoSaveId`-style persistence**, and an
   **enlarged hit target** are all deliberate omissions; `research.md` §10 gives
   the reason for each.
3. **F6 pane cycling** — APG marks it optional and it collides with browser and
   OS bindings.

## A divider whose panel has no declared size reports no value

`defaultSizes` is optional: a widget with none lays out in equal shares (the CSS
default is `flex: var(--size, 1) 1 0`) and is fully draggable, because the first
gesture measures the group and starts from what the browser actually produced.
Until that first gesture, though, the divider has no `aria-valuenow` to render,
and a focusable separator without one is announced as 50 by definition. Give
`defaultSizes` for a splitter that announces correctly from the first read; the
family cannot compute an equal share itself, because a part does not know how
many panels its group has.

## The divider carries no name of its own

Attributes in a `.tsrx` resolve **first-wins**: a spread that follows an
attribute never overrides it. A family-written `aria-label` on the divider
therefore silenced every consumer's, which is what the ui rows caught on their
first run. It is gone, and nothing replaced it — the navbar rule. Two dividers
wearing the same invented word are landmarks a reader cannot tell apart, so the
consumer names each one and `aria-valuetext` carries the size.

## What the reader actually says

Captured from the virtual reader on this tree, one whole announcement:

> separator, Resize navigation, orientated vertically, max value 80, min value
> 10, 1 control, not disabled, current value 30%

Everything the family bet on is in there: the role is spoken, the perpendicular
axis is spoken (a side-by-side group's divider is the *vertical* one),
`aria-controls` arrives as "1 control", and `aria-valuetext` is what carries the
value — as **"current value 30%"**, not as a bare number.

That last part is what six sr rows got wrong on their first run. They asked for
the segment `"30%"`, and `missing()` compares whole comma-separated segments, so
a fact the reader really does convey looked absent. The family was serving the
value correctly the whole time; the rows were asking in a phrasing no reader
produces. `WORDS.virtual` now spells all of it out from the capture, and the
comparison shape follows slider's precedent exactly — its `bound()` is
`"min value 10"` here too.

`aria-valuetext` is a deliberate divergence from slider, which ships none: a bare
`30` announced for a splitter says nothing a person can act on, and `30%` does.

## Written but not run — the browser rows

The build unit could not run the browser or ui lanes. The sr lane has since been
run (10 rows, green twice in isolation and once in the full lane), and the ui
rows were run at fan-in: 51/51 after the label fix above. What is still unwitnessed:

- **The pointer arithmetic** in `resizable.browser.ts` assumes the scenario boxes
  (400px wide, 300px tall) are what the lane lays out. A row that is off by a
  rounding step is arithmetic, not behaviour.
- **NVDA and VoiceOver.** `resizable-transcript.ts` is written and neither real
  reader has run it. Their `WORDS` columns say `splitter` for the role on the
  strength of the ARIA mapping alone and `unobserved` for every number, so those
  rows skip the numeric facts rather than assert a guess.

## Registration is a follow-up

The package export, manifest, conformance list, gallery entry, CI shard and chaos
entry are a separate unit and are untouched here. One thing leaks from that into
this folder: `resizable-transcript.ts` writes its gallery anchor (`/#resizable`)
as a literal, because `FAMILY_ANCHORS` has no key for a family that is not in the
gallery yet. The registration unit should swap that line for the imported anchor.
