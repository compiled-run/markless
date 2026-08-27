# ink — research, then the build

**Date:** 2026-08-27
**Owner ruling:** the family is `ink` — a generalized freehand drawing surface, of
which a signature pad is one styled consumer. Never `inkpad`, never `signature`,
never `canvas`. The name is the platform's: Android's Jetpack **Ink** API, Windows
**InkCanvas** / `InkPresenter`, PencilKit's `PKInk` and ink strokes. The CSS custom
property prefix is `--ink-*`.

Status: **built.** 59 browser rows green in CSR and SSR, 9 virtual-reader rows
green, real reader lanes written and not run. Registration (`src/index.ts`, the
conformance battery, the API manifest, the gallery section) is the follow-up unit
and nothing outside `src/ink/**` was touched.

---

# Part 1 — Research

## 1. What exists

| Library | Ships it? | As what |
| --- | --- | --- |
| **Ark UI** (Zag) | yes | `SignaturePad` — the only headless implementation, and the only SVG one |
| Radix, Base UI, Headless UI, Melt, Bits UI, React Aria | no | nothing in this space at all |
| **szimek/signature_pad** | n/a | the canonical vanilla signature pad; canvas; ~9k stars |
| **steveruizok/perfect-freehand** | n/a | not a component — the stroke *algorithm*; what tldraw draws with |
| **embiem/react-canvas-draw** | n/a | canvas, with the undo model worth copying |

Nothing in the WAI-ARIA Authoring Practices covers a drawing surface. There is no
pattern, no role, and no worked example. That absence is the single most important
research finding: **the accessibility design here is ours to make and to defend**,
not one to copy.

## 2. Ark UI's signature pad, in detail

Parts: `Root`, `Label`, `Control`, `Segment` (the `<svg>`), `SegmentPath` (one
`<path>`), `Guide`, `ClearTrigger`, `HiddenInput`.

API: `paths: string[]` (controlled) / `defaultPaths`; `onDraw({ path })` and
`onDrawEnd({ paths })`; `drawing: { size, simulatePressure, thinning, streamline,
smoothing, start, end }`; `clear()`; `empty`; `getDataUrl(type, quality)`;
`readOnly`; `disabled`; `required`; `name`; Field integration for label,
description, error text and validity.

Three things it gets right and we take:

- **SVG, not canvas.** One `<path>` per stroke, so the drawing is markup: it
  survives a server render, scales, styles, and submits as text.
- **`paths: string[]` as the value.** The whole drawing is an array of `d`
  strings. That is a serialisable value a form can carry.
- **`drawing` is perfect-freehand's options object, verbatim.** `size`,
  `simulatePressure`, `thinning`, `streamline`, `smoothing`, `start`, `end` are
  that library's parameter names — Zag depends on `perfect-freehand` directly.

Two it gets wrong for us: no undo of any kind, and `role`-free markup that leaves
a screen-reader user with nothing at all.

## 3. szimek/signature_pad

Canvas. Its contribution is the **velocity-based width model**: it fits a Bézier
through each triple of points, measures velocity, and maps it to a width between
`minWidth` and `maxWidth` with a smoothing factor. That is the same idea as
perfect-freehand's `simulatePressure`, arrived at independently and five years
earlier, and it is the reason a mouse-drawn signature can look like a pen at all.

It also supplies the **coalesced-events lesson**: it listens to `pointermove` and
takes `getCoalescedEvents()` where available, because a browser throttles pointer
events to the frame rate and the held-back samples are the difference between a
smooth curve and a polygon.

Its `toDataURL(type, encoderOptions)` is where Ark UI's `getDataUrl` comes from.

## 4. perfect-freehand — the algorithm we ported

Two passes.

`getStrokePoints(points, { streamline })` walks the raw samples and keeps a
smoothed track: each point is lerped toward the previous one by
`t = 0.15 + (1 - streamline) * 0.85`, and each kept point records the direction it
arrived from, how far it moved, and the running length of the stroke.

`getStrokeOutlinePoints(points, options)` walks that track once and builds the
polygon:

- radius is `size * (0.5 - thinning * (0.5 - pressure))`;
- with `simulatePressure`, pressure at each point is derived from
  `distance / size` — a fast hand is a thin line — moved toward the target by
  `RATE_OF_PRESSURE_CHANGE = 0.275` so the width does not jitter;
- at each point the offset is `perpendicular(lerp(nextVector, vector, nextDot)) *
  radius`, pushed onto a left list and a right list, skipping a point that has not
  moved `(size * smoothing)²` away from the last kept one;
- a corner sharper than a right angle (`dot(vector, prevVector) < 0`) gets a
  half-circle of five points on each side rather than an offset, which is what
  stops the outline crossing itself;
- both ends get a round cap, rotated by `FIXED_PI = Math.PI + 0.0001` — rotating
  by exactly π lands both ends of the arc on one point and the cap disappears;
- a single point becomes a full circle, so a tap is a dot.

`getSvgPathFromStroke` turns the polygon into `M … Q … T …` through the midpoints
of consecutive outline points, closed with `Z`.

We ported all of that and left out `taperStart`, `taperEnd`, custom `easing`, flat
caps and the `last` flag: none is reachable from this family's props. The port is
~200 lines in `ink-stroke.ts` and adds no dependency, which the packet required.

## 5. react-canvas-draw — the undo model

It keeps `linesArray` and pops the last entry on `undo()`, then repaints. Two
things follow for an SVG family:

- undo is `paths.slice(0, -1)` and costs nothing, because each stroke is already
  its own element. There is no repaint.
- it has **no redo**, and every issue thread about it asks for one. A redo stack
  that the next committed stroke empties is three lines. We ship it.

## 6. Accessibility — what the references do, and what we do

Ark UI's signature pad renders no `role` on the `<svg>`, so a screen-reader user
meets an unlabelled graphic or nothing at all. signature_pad and react-canvas-draw
render a bare `<canvas>`, which is worse.

The constraint nobody can design away: **there is no keyboard equivalent for
drawing freehand.** WCAG 2.1.1 (Keyboard) is about operability of *functionality*;
where the functionality is "make a mark with your hand", the accepted answer
across the industry — and the one every signature vendor uses — is to offer an
**alternative route to the same outcome**, i.e. type your name.

So:

- the surface is `role="img"` named by the label. One graphic, and everything
  inside it presentational, which is exactly the truth about a drawing.
- a live `<output aria-live="polite">` carries `Empty` / `1 stroke` / `2 strokes`.
  It is also in the surface's `aria-describedby`, so the state is available on
  arrival, not only on change. Without it, nothing on the page would tell a reader
  a stroke had landed.
- the surface is a tab stop, and its keys are the edit history: Cmd/Ctrl+Z,
  Shift+Cmd/Ctrl+Z, Ctrl+Y, Escape. Not a way to draw — a way to reach the one
  keyboard-reachable thing a drawing has.
- `role="application"` is refused (owner rule, and it would turn off a reader's own
  navigation for nothing).
- **the text alternative is the consumer's obligation**, stated in the family note
  and demonstrated in `scenarios/signature.tsrx`: a typed-name field beside the
  pad, both required, so the form is invalid until each is filled. A description
  the family invented for a scrawl would be a fabrication.

## 7. Divergence table

SPEC requires every reference name that does not carry over to be recorded with
its mapping.

| Reference | Their name | Ours | Why |
| --- | --- | --- | --- |
| Ark UI | `SignaturePad` | `ink` | owner ruling: the family is a drawing surface; a signature pad is one consumer. Platform word (Jetpack Ink, InkCanvas, PencilKit). |
| Ark UI | `Control` | *(dropped)* | a wrapper with no behaviour; the consumer's own element |
| Ark UI | `Segment` | `ink.area` | SPEC role: a bounded region with its own interaction rules. `segment` is not a role and would need the 3-use bar. |
| Ark UI | `SegmentPath` | *(family-owned)* | the paths are the family's, like `progress.bar`; a consumer never writes one |
| Ark UI | `Guide` | `ink.indicator` | SPEC role: a purely-presentational state marker. `guide` is not a role. |
| Ark UI | `ClearTrigger` | *(dropped)* | one line in a consumer's own button; the family would own nothing in it |
| Ark UI | `HiddenInput` | `ink.field` | SPEC role: the form-integration element |
| Ark UI | `onDrawEnd` | `onChange` | SPEC: the primary change callback is `onChange`. It also fires for undo, redo and clear, which `onDrawEnd` could not cover. |
| Ark UI | `onDraw({ path })` | `onDraw(current)` | kept; the argument is the path string rather than an object |
| Ark UI | `drawing: { size, simulatePressure, … }` | `size`, `pressure` | SPEC: booleans over option objects. The remaining five are one brush's constants, not API. |
| Ark UI | `simulatePressure` | `pressure` | ours is "use pressure at all"; simulation is automatic for a device that reports none, rather than a second flag |
| Ark UI | `getDataUrl()` | `toDataUrl()` | our grammar for a conversion the state performs |
| Ark UI | `readOnly` | `readonly` | HTML's own spelling, as textbox and numberbox ship it |
| Ark UI / Zag | `empty` | `empty` | carries over unchanged |
| Ark UI | `paths` / `defaultPaths` | `paths` / `defaultPaths` | carries over unchanged |
| signature_pad | `toDataURL` | `toDataUrl` | casing only |
| signature_pad | `minWidth` / `maxWidth` | `size` | one width at full pressure; the range is the brush's |
| react-canvas-draw | `undo()` | `undo()` | carries over; `redo()` is ours, because it has none |
| perfect-freehand | `getStroke` | `strokePath` | ours returns path data, not a point list |
| all references | `canvas` | `<svg>` + `<path>` | a canvas renders nothing on the server, loses its contents on resize, cannot be styled, and submits as a blob |

## 8. What this family asks of the framework

Two defects, both measured in the build below: cross-module `shared()` method
calls (already tracked, toaster pins it), and a `shared()` method reading a
`computed` declared beside it coming back empty on a served page — which is new,
silent, and the more dangerous of the two.

---

# Part 2 — The build

## Delivered

`packages/headless/components/src/ink/` — `ink.tsrx`, `ink-types.ts`,
`ink-stroke.ts`, `index.ts`, `note.md`, `ink.browser.ts`, `ink.sr.ts`,
`ink-transcript.ts`, `ink.nvda.ts`, `ink.voiceover.ts`, and nine scenarios
(`basic`, `signature`, `controlled`, `buttons`, `disabled`, `readonly`, `form`,
`pressure-off`, and the quarantined `method`).

Parts: `root` `label` `description` `error` `area` `indicator` `field`. Every name
is already in SPEC; no new role and no new prefix. `area` is its second shipped use
after colorpicker's plane.

Nothing outside `src/ink/**` changed. No dependency was added.

## The two framework findings

### 1. A `shared()` method may not read a `computed` declared beside it (new)

`finish()` appended the new stroke with `const before = paths; …
before.concat(drawn)`, where `paths` is a `computed()` in the same factory. In CSR
that is correct. On a served page the read comes back empty, so the append builds
a one-element array and the second stroke silently replaces the first.

**Nothing is red at build time.** The row that caught it is
`a drawing served whole takes a stroke once the page resumes` in
`packages/headless/components/src/ink/ink.browser.ts`. The measurement that
localised it: on a served page a synthetic `pointerdown` does set `ui-drawing` and
the in-flight `<path>` does get its `d` — so the element handle resolves and the
handler runs — while `pointerup` commits nothing. Only the read of the computed
differs between the two.

Every method in `ink.tsrx` now rebuilds the drawing from cells through
`heldPaths(given, own, seed)`. This is the same class as colorpicker's finding 2
(a state read nested under a call has no name to lower to), on a computed rather
than a cell, and its silent variant.

Owning file: `packages/compiler/src/passes/semantic-graph/` — the lowering that
copies a shared method's body; the served-render half is
`packages/compiler/src/passes/public-render/render-body.ts`, which U602 already
had to teach about component-scoped bindings.

### 2. Cross-module `shared()` method calls (already tracked)

The packet's intended composition — "consumers compose buttons over
`ink.state().clear()` / `undo()`" — does not compile.
`MARKLESS_SHARED_METHOD_CROSS_MODULE` names each identifier the copied body
expects and cannot find, and `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`
names the instance binding left standing. This is toaster's finding, unchanged.

Two consequences, both shipped rather than improvised around:

- `scenarios/method.tsrx` is quarantined and a browser row pins the refusal, the
  same shape toaster uses. It sits **last** in the browser file: the refused module
  paints a dev-server error overlay over the page, and a real gesture after it is
  intercepted.
- `undo`, `redo` and `clear` are written out of instance cells and builtins alone,
  with no module import and no computed read, so they are ready the day the
  capability ships.

What consumers do today, per the coordinator's direction, is a plain **cell
write** — `drawing.strokes = []`, `drawing.strokes = ink.withoutLast(drawing.paths)`
— which is toaster's shipped shape (`toasts.queue = toaster.say(…)`). A
`command`-cell design was considered and dropped: without an effects system
nothing can react to a command cell, so the write has to be the change itself,
which is what `strokes` already is.

One measured trap for anyone copying it: **the buttons must sit inside
`ink.root`.** The instance is `widget`-scoped, so an `ink.state()` call outside the
root reaches a different drawing and the writes land nowhere visible. The first
version of `scenarios/buttons.tsrx` had them outside and the browser row failed
with the strokes untouched.

A **controlled** consumer needs none of this and is the shape to recommend:
`scenarios/controlled.tsrx` owns the array and its buttons write their own state.

## Smaller walls, all recorded in the family note

`index i; key i` renders nothing with no diagnostic (the repeat is over `{ id, d }`
rows instead); a destructuring default cannot be read from a template position; a
`preventDefault` guard must compare event fields to literals, not read a local; a
shared method read into a local leaves the instance name standing; an index read
off a graph value is `MARKLESS_STATE_DYNAMIC_PATH_READ`; the instance binding is
`pad` because a consumer importing the family as `ink` collides with it by name;
a `<style>` block inside an `<svg>` works and is scoped; a served page does not
wake on a synthetic `dispatchEvent`.

## Evidence

- `pnpm exec vp test --project ui packages/headless/components/src/ink` — 59
  passed. Includes axe over `wcag2a` + `wcag21a` on eight scenarios in both CSR
  and SSR plus mid-gesture and post-gesture, all zero violations with no
  exemption.
- `pnpm test:sr` — 32 files, 265 passed, 10 expected-fail (other families'
  registered gaps), 4 skipped. `ink.sr.ts` contributes 9 green rows.
- `pnpm typecheck` and `pnpm exec vp lint --deny-warnings` — clean.
- `pnpm test:sr-real` and the playwright real-reader config were **not run**, by
  the owner rule against starting a screen reader on a development machine.

## Follow-up

Registration: `src/index.ts`, the shared conformance battery descriptor,
`api:extract` / `api:check`, and the gallery section the two real-reader lanes
read (they spell their anchor locally until it exists).
