# ink

A freehand drawing surface: pointer strokes with pressure, rendered as SVG paths,
carried into a form as path data. A signature pad is one styled consumer of it.

**Status: registered, with one scenario blocked.** The family is wired into the
`ink` namespace and the `./ink` subpath export, the shared conformance battery
(twelve rows, green in both CSR and SSR), the API manifest, the `#ink` gallery
section, and all three reader matrices in the workflow. The real reader lanes are
written and **not run** here: an owner rule forbids starting NVDA or VoiceOver on
a development machine, so they are unmeasured locally and belong to CI.

`scenarios/signature.tsrx` names `ink` through `../index.ts` and `textbox`
through `../../index.ts`, and the root barrel re-exports the first. That
double-barrel shape once lost the family's parts at compile time; the link pass
now merges the two aliases of one module, so the scenario compiles and the
family's 59 browser rows run.

Research (the ink research memo in the goal notes): Ark UI's signature pad,
`szimek/signature_pad`, `steveruizok/perfect-freehand`, `embiem/react-canvas-draw`,
the WAI-ARIA APG (which has no drawing pattern) and WCAG 1.1.1, read against this
library's own SPEC.

## Parts

`root` `label` `description` `error` `area` `indicator` `field`. Nothing else —
no clear trigger, no undo trigger, no guide wrapper, no data-URL output part.

Zero new roles and zero new prefixes. `area` is its second shipped use after
colorpicker's plane, which is what carries it past SPEC's "candidates as they earn
it".

**No `canvas` anywhere.** The surface is an `<svg>` and the strokes are `<path>`
elements, which is what makes a drawing survive a server render, scale without
resampling, and submit as text. Every reference implementation except Ark UI uses
`<canvas>`; the divergence table in the memo says why we do not.

## The surface is an image, not an application

`ink.area` is `role="img"`, named by `ink.label`, and described by `ink.error`,
`ink.description` and a live stroke count the root always renders.

This is the family's central accessibility decision and it is a refusal as much as
a choice. A drawing surface has **no keyboard equivalent**: there is no key that
draws a line freehand, and no reference library pretends otherwise. `role="img"`
says the truth — one graphic, nothing inside it to walk into — and makes every
stroke and the guide line presentational for free. `role="application"` was
refused outright (an owner rule, and it would silently turn off a reader's own
navigation for no gain). No `role="textbox"`, no `contenteditable`, no
`aria-roledescription` dressing a drawing up as something typed.

What that costs is a reader having no way to know a stroke landed. That is what
the live region is for: the root renders one `<output aria-live="polite">`
carrying `Empty`, `1 stroke`, `2 strokes`, always, whether or not the consumer
mounts anything. It is also in the area's `aria-describedby`, so the count is part
of the surface's description on arrival as well as an announcement on change.

The area **is** a tab stop (`tabindex="0"`, `-1` when disabled). Not to draw with:
to reach the drawing's edit history, which is the one keyboard-reachable thing a
drawing has.

## Keys

| Key | What it does |
| --- | --- |
| Cmd/Ctrl+Z | undo the last stroke |
| Shift+Cmd/Ctrl+Z, Ctrl+Y | redo it |
| Escape | drop the stroke being drawn |

Both undo spellings cancel the browser default so a page-level shortcut cannot
claim them. Nothing else on the surface takes a key.

## The text alternative is the consumer's obligation

WCAG 1.1.1 wants a text equivalent for non-text content. A signature the family
generated a description for would be a lie — nobody can read a scrawl back as a
name. So the family names the surface and stops, and the note says plainly what a
signature consumer owes: **a typed-name field beside the pad**, which is what
`scenarios/signature.tsrx` shows and what the browser row asserts (the form is
still invalid with a signature drawn and no name typed).

## State

`ink.state()` hands back `paths` (the strokes, as SVG `d` strings), `current` (the
stroke in flight), `empty`, `drawing`, `value` (every stroke joined into one `d`),
`countText`, `rows` (the keyed strokes the area repeats over), the cells `size`,
`pressure`, `disabled`, `readonly`, `required`, `name`, `strokes`, and the methods
`clear`, `undo`, `redo`, `toSvg`, `toDataUrl`, plus the gesture set the area uses
(`begin`, `extend`, `finish`, `cancel`).

`toSvg()` returns a standalone SVG document at the area's own pixel size and
colour. `toDataUrl(type, quality)` puts that document through an `<img>` and a
canvas and resolves with a data URL — a canvas is where a raster has to come from,
and this is the only place one appears.

**`strokes`, not `own`.** It is the cell a gesture writes, and it is public
because it is the only way a consumer's own button can change the drawing today
(below).

## Props

`paths` `defaultPaths` `size` `pressure` `disabled` `readonly` `required` `name`
`onChange` `onDraw`.

`paths` is a **controlled mirror**, not a seed: pass it and nothing appears until
`onChange` hands the strokes back and they are written in again. `defaultPaths` is
the uncontrolled start. `onChange` fires when a stroke lands and when one is
undone, redone or cleared; `onDraw` fires with the in-flight path while a stroke
is being drawn — Ark UI's `onDrawEnd`/`onDraw` pair in our grammar.

`pressure` is a boolean, not `drawing: { size, simulatePressure }`: a nested
options object is not a shape this library ships, and a device that reports no
pressure has it derived from speed rather than being told to by a second flag.

## Buttons, and the wall under them

The intended shape is a consumer's own button over `ink.state().clear()` or
`undo()`. **It does not compile.** A `shared()` method called from a handler in
another module is text-spliced into that module without the family's imports or
graph wiring, and the compiler refuses it by name:
`MARKLESS_SHARED_METHOD_CROSS_MODULE` and
`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. `scenarios/method.tsrx` is
quarantined and a browser row pins the refusal, the way toaster's does.

What works today is a plain **cell write**, which is what `scenarios/buttons.tsrx`
shows:

```tsx
<button onClick={() => { drawing.strokes = ink.withoutLast(drawing.paths); }}>Undo</button>
<button onClick={() => { drawing.strokes = []; }}>Clear</button>
```

Two things a consumer has to get right, both measured:

1. **The buttons go inside `ink.root`.** The instance is `widget`-scoped, so an
   `ink.state()` call outside the root reaches a different drawing and the writes
   land nowhere visible. The scenario puts them in a small child component inside
   the root.
2. A **controlled** consumer needs none of this: it owns the array and its buttons
   write their own state. That is `scenarios/controlled.tsrx`, and it is the shape
   to recommend until the compiler ships cross-module method calls.

## What the compiler forced — measured on this tip

1. **A method a consumer calls may reference nothing but its own cells.** Beyond
   the cross-module refusal above, the copied body may not name a module import or
   a factory-level computed; the diagnostic names each absent identifier. Since
   `undo`, `redo`, `clear`, `finish`, `toSvg` and `toDataUrl` read the `paths`
   computed, the refusal on `scenarios/method.tsrx` now names `paths` alongside
   `pad`. Nothing was ever callable across modules, so no capability was lost.

2. **The instance binding is `pad`, not `ink`.** A consumer module importing the
   family as `ink` is matched against the copied method text *by name*, and the
   compiler says so: "the copied body calls THIS module's `ink` rather than the one
   the definition file means." Renaming the binding removes the collision.

3. **`index i; key i` renders nothing.** The area's repeat over the strokes was
   written `@for (const drawn of pad.paths; index at; key at)` and produced zero
   `<path>` elements with no diagnostic at all. `key <expression>` over a value
   works. The repeat is now over `rows` — `{ id, d }` pairs whose id carries the
   index — because two strokes can be byte-identical and a repeat keyed on the
   path data alone would draw one row where there are two.

4. **A destructuring default cannot be read from a template position.**
   `MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`. `ink.indicator` writes its
   `x1`/`y1`/`x2`/`y2` defaults *before* the spread instead, so a consumer's own
   coordinates replace them.

5. **A `preventDefault` guard must compare event fields to literals.**
   `event.metaKey` on its own is `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`; a local
   holding the same expression is too. The area's guard is written
   `event.metaKey === true || event.ctrlKey === true`.

6. **A shared method read as a value leaves the instance name standing.**
   `const listener = pad.onDraw; if (listener) listener(...)` is
   `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. `pad.onDraw?.(…)` is the
   shape, and it short-circuits, so a consumer with no `onDraw` never builds the
   path twice.

7. **`before[before.length - 1]` is `MARKLESS_STATE_DYNAMIC_PATH_READ`.** Index
   reads off a graph value go through `.slice()` or a helper.

8. **A `<style>` block inside an `<svg>` works, and is scoped.** The compiler
   lifts it out and stamps a class on the elements its selectors match, so
   `[ui-surface] { touch-action: none }` lands on the area and
   `[ui-current]:not([ui-drawing]) { display: none }` hides the in-flight path.
   No JS builds a CSS string anywhere in this family.

9. **A served page does not wake on a synthetic `dispatchEvent`.** The SSR
    gesture rows make one real gesture first (`userEvent.click`) and dispatch
    after it. Worth knowing before writing any pointer row against `renderSSR`.

10. **A build-refused module paints a dev-server error overlay over the page.**
    The quarantined `scenarios/method.tsrx` row therefore sits last in the browser
    file: a real gesture after it is intercepted by the overlay and times out.

## What the methods read, and what it costs

Every method that needs the committed drawing reads the `paths` computed declared
beside it — `const before = paths;` — rather than rebuilding it from
`pad.given` / `pad.strokes` / `pad.seed`. That read used to come back empty on a
served page; the served-computed fix memo in the goal notes is
the compiler fix that made it answer, and
the retirement memo sits beside it.

`paths` and not `rows`, `value` or `countText`: all four are equally correct to
read, but the other three walk into `ink-stroke.ts`, and the root now derives
whichever one a method names at every server render whether or not its own markup
needs it. `paths` is a three-branch pick with no walk under it.

Measured on the family's own SSR module: **57,649 bytes before, 59,354 after —
+1,705.** The whole delta is `InkRoot` deriving `paths` and emitting the one
`marklessSsrServeComputed` line for it; the six other parts emit no serve call,
and the compiled `scenarios/basic.tsrx` page module is unchanged at 14,931 bytes.

## The stroke algorithm

`ink-stroke.ts` is a port of perfect-freehand (Steve Ruiz, MIT) —
`getStrokePoints`, `getStrokeOutlinePoints`, `getSvgPathFromStroke`. Ported rather
than installed because this unit adds no dependency, and because roughly 200 lines
is cheaper to own than a dependency in a headless package.

Kept: streamlining (each sample lerped toward the last), running-length and
per-point direction, pressure-to-radius through `thinning`, simulated pressure
from speed for devices that report none, sharp-corner half-circles, round caps at
both ends, and the quadratic-through-midpoints path builder.

Left out, on purpose: `taperStart`/`taperEnd`, custom `easing`, flat caps, and the
`last` flag. None of them is reachable from this family's props, and every one of
them is a branch nothing would exercise.

`size` is the stroke width at full pressure and defaults to 2. `thinning` is 0.5
with `pressure` on and 0 with it off; `smoothing` and `streamline` are 0.5, which
are perfect-freehand's own defaults. None of the three is a prop: they are one
brush, and a family that exposed all of them would be exposing perfect-freehand
rather than a drawing surface.

## Form integration

`ink.field` is a clipped, `aria-hidden`, `tabindex="-1"` text input carrying every
stroke joined with a space — which is itself valid path data, so the value a
server receives can be dropped into a `<path d>` unchanged. `required` on the root
puts `required` on that field, so an empty drawing blocks submission through
ordinary constraint validation with no JavaScript.

Mounting `ink.error` is what marks the drawing invalid, which is textbox's shipped
idiom. `aria-invalid` lands on the field; the message reaches a reader through the
area's `aria-describedby`, named **before** the description, because the field
itself is hidden from readers and could not carry the state to anybody.

## Accessibility

axe-core over `wcag2a` + `wcag21a` — the same rule set and the same call the
shared conformance battery makes — on every scenario in both CSR and SSR: the
starter, the signature pad, the form, the controlled drawing, the buttons,
disabled, readonly and pressure-off; and additionally while a stroke is in flight
and after one has landed. **Zero violations, no exemption, no rule disabled.**

The virtual reader lane asserts the facts, never a product's wording: the surface's
role and name, what it is described by, the live count going from `Empty` to
`1 stroke` to `2 strokes`, the guide never being a stop of its own, the composed
buttons announcing as buttons, the validation message arriving first in the
description, and the typed-name textbox beside a required pad.

## The real reader lanes

`ink.nvda.ts` and `ink.voiceover.ts` run the shared `ink-transcript.ts`, which
asserts the two claims the virtual lane cannot: whether a real reader speaks the
live count when a stroke lands on a surface whose name never changes, and whether
it walks into the strokes inside `role="img"`.

**Neither has been run**, by an owner rule that forbids starting a screen reader on
a development machine. They are unmeasured locally and belong to CI. The anchor
they walk to is `FAMILY_ANCHORS.ink`, imported from the gallery's own
`preview-server.ts`.

Every wording in this note is therefore the virtual reader's.

## What v1 refuses

**A canvas surface.** Every reference but Ark UI draws into `<canvas>`. A canvas
renders nothing on the server, loses its contents on resize, cannot be styled, and
submits as a base64 blob. `toDataUrl()` puts the SVG through a canvas when a
raster is genuinely wanted, which is the only thing a canvas is better at here.

**A `guide` part separate from `indicator`.** Ark UI ships `Guide`; it is a line
with no behaviour, which is exactly what `indicator` already means.

**`onDrawEnd`.** Ark UI's name for the primary change callback. SPEC says the
primary one is `onChange`, and it fires for undo, redo and clear as well, which
`onDrawEnd` could not honestly cover.

**A `drawing` options object** (`{ size, simulatePressure, thinning, streamline,
smoothing, ... }`). Two of those are props (`size`, `pressure`); the rest are one
brush's constants.

**Stroke colour as a prop.** The paths are `fill: currentColor` in the family's own
layer, so a consumer's `color` sets it and an unlayered rule of theirs beats the
default without `!important`.

**Erasing, layers, shape tools, zoom.** A drawing surface, not a drawing app.

## No node lane for the maths

`ink-stroke.ts` has no unit test of its own because this package has none to join:
`packages/headless/components/vitest.config.ts` includes `src/**/*.browser.ts` and
nothing else, and the workspace's node project globs `packages/*/test/**`, which
this package's nested path does not match. The geometry is therefore pinned in the
browser file, the way `colorpicker-math.ts` is: fourteen rows over `heldPaths`,
`joinPaths`, `strokeCountText`, `strokeRows`, `lastPath`, `withoutLast`,
`strokePath`, `outlinePath`, `svgDocument` and `rasterise`, including
determinism, the single-point dot, the empty cases, and pressure on versus off.
