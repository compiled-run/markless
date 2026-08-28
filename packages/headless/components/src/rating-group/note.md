# rating-group — implementation notes

Research and the decisions it settled: `goals/headless-components/notes/U693-rating-group.md`.

## Shape

One widget family, `ratinggroupState`, rooted by `ratinggroup.root`. There is no
per-item shared instance: a mark's position is its own `value` prop held in a
`state()` cell, and everything else — the fill, the checked mark, the tab stop,
the keyboard walk — is arithmetic on that position and the group's `count`, in
`rating-group-math.ts`. `rating-group-walk.ts` holds the only reads of the
element roster: which mark to focus after a rating change, and which mark's box
to measure for the half-value midway test.

The root renders no element of its own. `ratinggroup.root` writes its props onto
the instance and renders one private `RatingGroupBox`, which owns the
`role="radiogroup"` element — a widget root cannot read its own instance token,
so the `aria-labelledby` and `aria-describedby` IDREFs only resolve one
component deeper. That is radio-group's and progress's idiom.

## The instance member is `rated`, not `value` — a compiler landmine

**Measured on the pilot tip `89dd2deb`, four compiles.** The family first
published the committed rating on its instance as `value`, alongside
`ratinggroup.item`'s own `value` prop. That combination is a **compile-time
refusal**, not a silent shadow and not a runtime surprise:

```
MARKLESS_CAPTURE_OPAQUE_PROP: Cannot bind lazy symbol "symbol:2" because prop
"value" for "RatingGroupItem" is read through a path the compiler cannot reduce
to a capture slot, so "value" would reach the browser unbound.
```

Two of them, one per lifted symbol. The gate is
`unreducedPropReadDiagnostics` in `packages/compiler/src/passes/capture-analysis.ts`:
a lifted symbol's source is scanned for free names, and any name matching a prop
the owning component declares — with no capture slot routing it — is an error.
The refusal is deliberate and the diagnostic says why: the alternative is a
`ReferenceError` on the handler's first dispatch after resume, so a build that
passes and then crashes is traded for a build that refuses.

What made the name free was `rating.value` — the *instance's* member — read
inside symbols owned by `RatingGroupItem`, which declares a `value` prop. Two
symbols read it (`starChecked` and `starTabStop`), which is exactly the two
errors reported. Three things were tried and did **not** help, so none of them is
the cause: renaming the state cell's key (`state({ at: value })` versus
`state({ value })`), giving the prop a default (`value = 1`), and making the prop
optional. Renaming the instance member to `rated` cleared both errors at once.

Radio-group has the same pair of names and compiles, because no symbol owned by
`RadioGroupItem` reads `group.value` — the parts that read it (`itemtrigger`,
`itemindicator`, `itemfield`) are separate components that declare no `value`
prop of their own. So the collision needs all three: one component, a prop, and a
lifted symbol naming the same word through an instance.

The consumer-facing name is untouched: `ratinggroup.item` still takes `value`,
the same word `radiogroup.item` and `calendar.item` take. Only the instance
member moved, and the instance publishes `rated` (committed), `shown` (what the
marks draw, preview included) and `positions`.

## Preview is a cell nothing writes back

`previewAt` holds what a hover is offering, with `-1` for "nothing offered" —
not 0, because 0 is a rating a person can give. `shown` is `previewAt` when one
is offered and `rated` otherwise, and every fill attribute reads `shown` while
`aria-checked`, `ui-value` and `ratinggroup.valuelabel` read `rated`. That split
is the whole of "transient": a preview cannot reach a callback, a form or a
reader.

The sentinel is reached through `noPreview()` and `hasPreview()` rather than an
imported constant. A family body is lifted into its own symbol where a module
constant is out of scope (otp's `fieldStyle` note); an imported function is
re-resolvable there, so the calls are the portable spelling. The one literal
`-1` is in the `state()` seed, where a call is not allowed.

## CSS defaults

One rule, in `@layer markless` inside `ratinggroup.item`:

```css
[ui-star] { position: relative; -webkit-user-select: none; user-select: none; }
```

`position: relative` is the containing block a consumer's half-fill overlay
needs — the family publishes `--rating-fill` as a percentage and paints nothing.
`user-select: none` is behaviour, not decoration: without it a pointer moving
across the marks selects their glyphs. The root ships no CSS and does not own its
`style` attribute, so a consumer can style the group freely.

## Reader lanes

`rating-group.sr.ts` (virtual) is green, six rows, three consecutive runs. Two
things it measured are worth keeping:

- **`ratinggroup.valuelabel` is an `<output>`, so it is a polite live region.**
  After every rating change the reader repeats the readout, and *that* is what
  `lastSpokenPhrase()` answers with — not the mark's own announcement. Rows that
  care about the mark read the spoken log, or ask the reader again.
- **The reader speaks a mark the moment focus lands on it, a turn before the
  family's `aria-checked` write reaches the DOM.** Asserting "checked" straight
  off the focus announcement is flaky by construction: it passed once and failed
  the next run. The row now waits for `aria-checked` in the DOM first and then
  asks the reader again, which is deterministic. Radio-group pins its equivalent
  row `test.fails` for the same underlying ordering; here the re-read makes it
  provable instead.

`rating-group.nvda.ts` and `rating-group.voiceover.ts` carry the row the virtual
lane cannot: that a cumulative fill is heard as one checked mark among four
unchecked ones. **They cannot run yet.** The gallery has no rating-group section
and `FAMILY_ANCHORS` has no entry for it, so the anchor is a literal
(`RATING_GROUP_ANCHOR` in `rating-group-transcript.ts`) rather than a read of the
owning module. Adding the section, the anchor, and the swap to `FAMILY_ANCHORS`
is the registration unit's work; neither lane was run here.

## Not registered yet

`packages/headless/components/src/index.ts` does not export this family, so the
scenarios import their own barrel:

```ts
import * as ratinggroup from '../index.ts';
```

The call sites are the ones a consumer will write. Registration adds
`export * as ratinggroup from './rating-group/index.ts'` — the hyphen-free
spelling `radio-group` uses for `radiogroup` — after which the scenarios can
switch to `import { ratinggroup } from '../../index.ts'`.
