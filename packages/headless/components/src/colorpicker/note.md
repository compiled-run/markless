# colorpicker

A colour a person can pick: a saturation-by-brightness plane, channel rails,
typed entry, swatches, alpha, and an optional popup.

**Status: complete.** All 45 browser rows are green in both CSR and SSR, the
virtual screen-reader lane's 12 rows are green, the family is registered in the
shared conformance battery (103 rows), and `api:extract` / `api:check` are clean.
The real reader lanes are written and **not run**: an owner rule forbids starting
NVDA or VoiceOver on a development machine, so they are unmeasured locally and
belong to CI. The gallery section they read is a follow-up, and both lanes skip
themselves until it exists.

Research: `goals/headless-components/notes/U540-colorpicker-research.md` — React
Aria's `useColorArea` / `useColorSlider` / `useColorField` and `Color.ts`, Zag's
colour-picker machine, Kobalte, Mantine, MDN on `<input type="color">`, the
WAI-ARIA APG (which has no colour pattern), and Adobe's *Accessible Color
Descriptions for Improved Color Pickers*, read against this library's own SPEC.

## Parts

`root` `content` `area` `track` `thumb` `input` `item` `field`, plus `trigger`
in popup mode and the optional `label` / `description` / `error` / `valuelabel`.
Nothing else — no positioner, no viewport, no swatch group, no transparency grid,
no area background, no format select, no eyedropper. Zag's 25-part anatomy is the
pile this family is defined against.

Zero new roles and zero new prefixes. `area` is the first shipped use of a role
SPEC listed with "scroll area" as its only example, so this family is what earns
it rather than inheriting it.

## The plane is two controls, not one

`colorpicker.area` is `role="group"` and **renders its own two one-axis
`role="slider"` controls**, one for saturation and one for brightness. The
consumer writes neither; they are the family's, the way `progress.bar` is.

This is the divergence the family exists to make. A `role="slider"` element
carries exactly one `aria-valuenow`, so Zag's and Mantine's single-slider plane
gives a screen-reader user one adjustable axis and leaves the other reachable
only by a sighted drag. React Aria fixes it with two controls, and we copy that
**exposure** while refusing its **element**: React Aria and Kobalte use two
visually-hidden `<input type="range">`, and datebox's measured wall says an
input's displayed value is its property while the graph writes attributes. Our
axis controls are `<div role="slider">`, which is what `slider` already ships.

Both axis controls stay exposed and share one tab stop by roving `tabindex`,
which is React Aria's own mobile branch rather than its desktop one. Its desktop
branch puts `aria-hidden="true"` on the unfocused axis; that is a focusable
element inside `aria-hidden`, which axe reports under `aria-hidden-focus`, and
the acceptance bar here is zero violations with no exemption. Arrow keys move
focus to the axis they moved, so both axes are reachable from the one tab stop.

`aria-valuetext` carries the full three-channel context on the first move after
focus arrives — *"Saturation: 79%, Brightness: 100%, Hue: 210°, vibrant cyan
blue"* — and the short form on every move after it — *"Saturation: 78%, vibrant
cyan blue"*. That is React Aria's best idea in this component and it costs one
boolean cell.

## Why the canonical colour is HSB, and why it is one string

`RGB → HSV` is not injective: at saturation 0 the hue is undefined, and at
brightness 0 both hue and saturation are. A picker that stored hex and re-derived
HSB on every read would erase the hue the moment a person dragged to the grey
edge, and the hue rail would snap to red. That is the most common colour-picker
defect and it is a storage decision.

The family holds two cells: `seed`, the root's `value` prop untouched, and
`text`, the canonical `hsb(h, s%, b%, a)` a gesture has written since. `hsb()` is
React Aria's own serialisation and one of the three formats Zag accepts. A shared
cell is seeded from a bare prop and nothing else, so the parse happens at every
read rather than on the way in.

`value` is a **seed, not a controlled mirror**. Once a gesture has run the picker
holds its own colour and the prop is never read again — which is why the 8-bit
hex quantisation is invisible during interaction. A consumer who writes
`value={colour}` with `onChange={setColour}` is being redundant rather than
harmful, and deserves to be told so: the round trip `#5A8FB3` → HSB is a fraction
of a degree off the hue it was written from, and only a remount with a re-fed
value could show it.

## State

`colorpicker.state()` hands back `value` (the canonical `hsb()` string), `hex`,
`rgb`, `hsl`, `hsb`, `alpha` (the number), `css`, `name` (the spoken colour name),
`swatches`, and the methods `setColor`, `setChannel`, `stepArea`, `stepRail` and
the drag pair.

**`setColor`, not `set`.** `picker.set(x)` is read by the compiler as a write to
`picker` itself — `MARKLESS_STATE_UNRESOLVED_WRITE: Cannot write to "picker"` —
so the method the memo spells `set` ships one word longer. Named here because it
is a departure from the approved shape and the reason is mechanical.

**`fieldName`, not `name`, is the cell behind the `name` prop.** `name` on the
returned instance is the colour's name, and a cell and a computed cannot share a
key: `MARKLESS_STATE_READ_ONLY_WRITE`. The prop is still `name`.

## Props

`value` `swatches` `alpha` `disabled` `readonly` `required` `invalid` `name`
`popup` `onChange` `onChangeEnd`.

`alpha` is HTML's own spelling, from `<input type="color" alpha>`. `onChange`
fires at every step of a gesture and `onChangeEnd` once it settles, which is
`slider`'s meaning and `<input type="color">`'s `input`/`change` split. Both
report `#rrggbb`, or `#rrggbbaa` when `alpha` is on and the alpha is below 1.

Deliberately absent: no `format` / `defaultFormat` / `onFormatChange` — `state()`
hands back every format at once; no `step`, because seven channels would need
seven of them (the steps are data in `colorpicker-math.ts`); no `colorSpace`,
sRGB only; no `xChannel` / `yChannel` — the plane is saturation × brightness,
full stop; no `orientation`; no `closeOnSelect`.

## The `channel` prop

One `colorpicker.track` and one `colorpicker.thumb`, each taking
`channel: 'hue' | 'saturation' | 'brightness' | 'alpha' | 'red' | 'green' |
'blue' | 'lightness'`. It is not a mode enum: the track and thumb behave
identically whichever channel they carry, exactly as `slider.thumb`'s shipped
`side` and `calendar.item`'s `value` do. The values are CSS Color 4's own channel
names. The alternative was eight new prefixes at once, which forecloses a picker
whose channel set is chosen at runtime.

`colorpicker.thumb` with no `channel` is the plane's marker —
`role="presentation"`, positioned by the family and carrying no value. One part
rather than two, because the consumer writes the same tag either way and what it
is follows from where it sits.

## Keyboard

**Plane.** Arrows step one unit on the axis they name; Shift takes the channel's
page step; `PageUp`/`PageDown` step brightness by its page step; `Home`/`End`
step saturation by **one page step, not to the ends**. That last one diverges
from our own `slider`, deliberately: a colour plane's corners are meaningful
(pure white, pure hue) and its edges are not, so jumping one axis to an extreme
with the other unchanged is rarely what anyone means. React Aria reached the same
answer.

**Rails.** `slider`'s model unchanged, including `Home`/`End` to the channel's own
ends — a rail has exactly two of them.

RTL flips the plane's x axis and every horizontal rail, and never the y axis:
screen y grows downward while brightness grows upward, which is not a writing
direction. `slider-track.ts` could not be reused for this — it returns one
`isFlipped` for both axes — so `colorpicker-math.ts` measures its own bounds.

**Typed entry.** `Enter` and blur commit. An entry that cannot be read as a colour
changes nothing and reverts when the box is left; while it stands, the box reports
`aria-invalid="true"`. That is the one invalid state the box has of its own —
everything else is the root's `invalid` prop.

## Pointer

`setPointerCapture` on the plane and on each rail, which is `slider`'s shipped
model and the platform's answer to a gesture that leaves the element. The bounds
are measured once when the gesture starts; there is no resize observation, so a
picker resized mid-drag stays on the bounds the gesture started with.

## What the family owns, and what the consumer owes

**No DOM queries anywhere in this family's source.** No `closest`,
`querySelector`, `matches`, `contains`, `parentElement` or selector string: every
element the family reaches is an `element()` handle it bound — `areaEl`,
`axisEls`, `thumbEls`, `inputEls`, `itemEls`, `contentEl`, `triggerEl`, `labelEl`.
"Is focus inside the surface?" is answered by identity against those handles
rather than by a tree walk, which is exact rather than approximately exact.

**Every CSS default is CSS**, shipped as a `<style>` block inside the part it
styles, under `@layer markless`, keyed off `ui-*` attributes:

```css
/* colorpicker.root    */ [ui-picker] { anchor-scope: --ui-colorpicker; }
/* colorpicker.trigger */ button      { anchor-name: --ui-colorpicker; }
/* colorpicker.content */ [ui-popup]  { position: absolute; position-anchor: --ui-colorpicker; }
/* colorpicker.area    */ [ui-plane]  { position: relative; touch-action: none; forced-color-adjust: none; }
/* the plane's axes    */ [ui-axis]   { position: absolute; inset: 0; }
/* colorpicker.track   */ [ui-rail]   { position: relative; touch-action: none; forced-color-adjust: none; }
/* colorpicker.thumb   */ [role='slider'][ui-channel] { position: absolute; left: var(--colorpicker-offset); }
/* colorpicker.thumb   */ [role='presentation']       { position: absolute; left: var(--colorpicker-x); bottom: var(--colorpicker-y); }
```

The popup is placed by CSS anchoring alone — tooltip's shipped idiom — so nothing
measures a box and a surface served already showing is placed on its first layout.

`forced-color-adjust: none` is on the plane, the rails and the thumbs on purpose:
without it Windows High Contrast repaints every gradient and every swatch with the
system palette and the whole control stops meaning anything.

**JS contributes geometry only as custom properties**, never a built-up CSS
declaration. The root carries `--colorpicker-value`, `--colorpicker-hue`,
`--colorpicker-pure`, `--colorpicker-x`, `--colorpicker-y` and
`--colorpicker-alpha`; they inherit, so a stylesheet reads them wherever it
paints. Each rail thumb carries `--colorpicker-offset`.

**The gradients are the consumer's.** React Aria, Zag and Mantine all write
`background: linear-gradient(...)` into the track's inline style; this library
ships no colours. What we owe instead is the data — `ui-channel` on the rail plus
the root's inherited custom properties — and a stylesheet writes, for example,
`[ui-channel="saturation"] { background: linear-gradient(to right, #fff, var(--colorpicker-pure)); }`.

**The consumer owes each rail and the plane a size**, and nothing else. The
family cannot know how big a colour plane should be.

## Swatches

`colorpicker.item` is a real `<button>` carrying `aria-pressed` and named by both
the colour and its value — `aria-label="vibrant cyan blue, #3399FF"`. The name
tells a reader what it is and the hex tells them which one they asked for. Zag's
swatch carries `data-state="checked"` and no ARIA state at all, so a reader is
never told which one is in force; that is a defect, not a style. `aria-selected`
is not supported on `button`, which is calendar's ruling applied unchanged.

`swatches` is a root prop and `state().swatches` hands the list back, so the
repeat is the consumer's own markup:

```tsx
@for (const swatch of picker.swatches; key swatch) {
	<colorpicker.item value={swatch} />
}
```

The `key` is not optional: a repeat over reactive state without one is
`MARKLESS_REPEAT_KEY_REQUIRED` at compile time.

## The colour name

A reader told "Red: 182, Green: 96, Blue: 38" learns nothing. The names come from
about thirty English strings bucketed in **OKLCH**, because OKLCH's lightness is
perceptually uniform across hues and HSL's is not — a blue at L=50% reads far
darker than a yellow at the same number. Ten hue anchors, compound names formed
on the fly rather than stored ("yellow green", "blue purple"), three achromatic
words, three chroma words and four lightness words, composed as
`{lightness} {chroma} {hue}`.

Adobe's own write-up is why the table is thirty strings and not seven hundred:
matching ~700 named colours by Delta E needed ~24,000 translated strings and over
a megabyte gzipped, and produced names opaque even to native speakers.

Below full opacity the form changes wholesale rather than gaining a number:
*"50% transparent vibrant cyan blue"*, not "vibrant cyan blue, alpha 0.5". The
alpha rail alone carries no colour name — repeating one there tells a person
nothing they did not just hear.

**English only in v1**, and that is a real gap. `Intl` has no colour-name API and
this package has no localised-string infrastructure. `COLOR_WORDS` is exported so
a locale table is additive rather than a rewrite. The alternative — channel
numbers alone — is what Adobe's research says is unusable.

## Form integration

`colorpicker.field` is calendar's shape verbatim: an `<input type="text">` inside
`VisuallyHidden`, `tabindex="-1"`, `aria-hidden="true"`, carrying `name`,
`required`, `disabled`, `aria-invalid` and the same hex the callbacks report.

**`type="color"` is not used.** The user agent coerces its value to `#rrggbb` and
drops alpha unless the very recent `alpha` attribute is present; it cannot hold an
empty value; and in several browsers it opens a native picker on activation even
when visually hidden, which would give one control two pickers. `type="text"`
submits the identical string with none of that.

## What the compiler forced — measured on this tip

1. **Two computeds may not share a binding name across parts.** `ariaInvalid` in
   both `ColorpickerInput` and `ColorpickerField`, and `named` / `painted` across
   four parts, resolved to one symbol: CSR ran one body and SSR another, failing
   as `TypeError: Cannot read properties of undefined (reading 'trim')` and
   `ReferenceError: swatch is not defined` out of the same `symbol:143`. Every
   computed in `colorpicker.tsrx` now has a name unique to the whole module —
   `boxAriaInvalid`, `fieldAriaInvalid`, `thumbNamed`, `swatchPainted`. This is
   the single largest shape constraint the family met and it is invisible in the
   finished source, which is why it is first here.

2. **A state read nested under a call has no name to lower to.** Written as
   `hexText(colorOf(picker.text, picker.seed), picker.withAlpha)` a factory
   computed emits a module that still names `picker` and refuses at compile time
   (`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`). Every computed in this
   family reads its state into locals on their own lines first and then builds the
   expression, which is the compiler's own first suggestion.

   The same rule bites *silently* inside a shared method: `areaFraction(x, y, {
   left: picker.boundsLeft, … })` compiled without complaint and arrived with
   every field `undefined`, so the plane's width fell back to 1 and the first drag
   snapped saturation to 100. Nothing was red at build time; the row that caught
   it was the drag. Five cells read into five locals fixed it.

3. **`picker.set(...)` is read as a write to `picker`.**
   `MARKLESS_STATE_UNRESOLVED_WRITE`. The method is `setColor`.

4. **A cell and a computed cannot share a key on the returned instance.**
   `picker.name = name` against a `name` computed is
   `MARKLESS_STATE_READ_ONLY_WRITE`. The cell is `fieldName`.

5. **A part's family-owned `style` attribute replaces the consumer's, it does not
   merge with it.** Writing the plane's gradient properties into
   `colorpicker.area`'s `style` silently dropped the `style` prop the scenario
   passed, so the plane had no size, the axis controls it renders escaped to the
   viewport, and every `userEvent.click` in the suite timed out on "subtree
   intercepts pointer events". The geometry moved to the root, where it inherits;
   the positioning moved to CSS. Both were owner rulings independently, and this
   is the measurement that made them necessary rather than merely tidier.

6. **A factory `computed()` may import from its own file on this tip.** The
   calendar note's finding 5 no longer holds: every `colorpicker` factory computed
   calls `colorOf`, `hexText` and `colorName` out of sibling modules, and the
   whole lane is green in CSR and SSR. Recorded because the previous shape — the
   same derivation re-inlined in six computeds — is a real cost nobody needs to
   pay any more.

## Accessibility

axe-core over `wcag2a` + `wcag21a` — the same rule set and the same call the
shared conformance battery makes — on every scenario: the starter, the alpha
picker, every channel rail, the swatch row, the form, and the popup both closed
and open; before and after a drag, and before, during and after a typed entry
that the box refuses. **Zero violations, no exemption, no rule disabled.**

The virtual reader lane asserts the facts, never a product's wording: each axis
control's name, value and value text; the hue rail speaking the hue's own name
(*"cyan blue"*) and not the whole colour's; the alpha rail carrying a percentage
and provably *no* colour name; the hex box's role, name and invalid state; a
swatch's colour name, its value and its pressed state; and the value label.

## The real reader lanes

`colorpicker.nvda.ts` and `colorpicker.voiceover.ts` run the shared
`colorpicker-transcript.ts`, which asserts the divergence itself: two adjustable
axis controls over one plane rather than one, each carrying
`aria-roledescription="2D Slider"` and its own name, the hue rail's own range
(0–360, not Zag's hardcoded 0–100), and the second axis taking focus and speaking
for itself when an arrow moves it.

**Neither has been run, by an owner rule that forbids starting a screen reader on
a development machine.** They are unmeasured locally and belong to CI. The gallery
has no colorpicker section yet, so both lanes skip themselves until one exists
rather than going red for a reason that is not the family's; the anchor is written
in the transcript rather than imported from `FAMILY_ANCHORS`.

Every wording in this note is therefore the virtual reader's.

## What v1 refuses

**Eyedropper.** `new EyeDropper().open()` is Chromium-only — MDN: *"not Baseline
because it does not work in some of the most widely-used browsers"* — needs a
secure context and a user gesture, drops alpha, and rejects on cancel. It is nine
lines in a consumer's own button feeding the result into `value`, and the family
would own nothing in it:

```ts
const EyeDropper = (window as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } })
	.EyeDropper;
if (!EyeDropper) return;
try {
	const { sRGBHex } = await new EyeDropper().open();
	setColour(sRGBHex);
} catch {
	// cancelled
}
```

**A colour wheel.** A third geometry with polar pointer maths and its own value
text. React Aria and Kobalte ship one; Zag does not, and Base UI, Radix, Bits UI
and Melt ship no colour component at all. Additive later.

**A format switcher.** Zag's `formatTrigger` / `formatSelect` and its `format`
prop are the format props SPEC forbids. `state()` hands back every format at once;
three buttons over the consumer's own state read a different field.

**Arrow-key stepping on the hex box.** React Aria wires `useSpinButton` to step
the hex as a 24-bit integer and then explicitly cancels the spinbutton semantics
so no reader announces "spinbutton, 16711680". The behaviour they went to that
trouble to expose and then hide is not worth having; the hue rail is what people
reach for.

**Named CSS colours, `color()`, `oklch()`, `lab()`, and space-separated modern
syntax** as input. `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`, `rgb()` / `rgba()`,
`hsl()` / `hsla()` and `hsb()` / `hsba()` are accepted, which is React Aria's
tested set. An unparseable `value` falls back to white rather than throwing —
React Aria throws, and a `value` prop may come out of a database.

**`colorspace="display-p3"`.** Every reference works in sRGB and our maths would
need a second gamut.

## No node lane for the maths

`colorpicker-math.ts` has no unit test of its own because this package has none
to join: `packages/headless/components/vitest.config.ts` includes
`src/**/*.browser.ts` and nothing else, and the workspace's node project globs
`packages/*/test/**`, which this package's nested path does not match. Adding a
`.test.ts` under `src/` would have produced a file nothing runs.

`datebox-math.ts` and `calendar-math.ts` are in the same position and are pinned
through their families' browser lanes. The conversions here follow that: one
browser row round-trips every accepted notation, RGB and HSL out and back, the
eight-digit alpha form, the four refused notations, the hue and saturation that a
round trip through black would otherwise erase, and three colour names.
