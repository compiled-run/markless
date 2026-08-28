# rating-group — research and the shape it produced

Built in one go: the research below and the family in
`packages/headless/components/src/rating-group` are the same unit.
Implementation notes (compiler landmines, measured behaviour) live in that
folder's `note.md`; this file is the survey and the decisions it settled.

## What was surveyed

| Library | Has one? | Semantics it chose |
| --- | --- | --- |
| Ark UI / Zag | yes (`rating-group`) | radiogroup: `control` is `role="radiogroup"`, each item is `role="radio"` with `aria-roledescription="rating"`, an `aria-label` from a `"{index} stars"` translation, `aria-setsize`/`aria-posinset`, plus one hidden `<input type="text">` for the form |
| Bits UI | yes (`RatingGroup`) | slider: the **root** is `role="slider"` with `aria-valuenow/min/max` and one tab stop; items are `role="presentation"`; `aria-valuetext` defaults to `"{value} out of {max}"` |
| Melt UI | no | not in the builder list, in either the v0.x `create*` API or the Svelte 5 rewrite |
| React Aria | no | open request since 2023. Maintainers' guidance: build it on a radio group, referencing the APG radio-rating example, with the labelling tweaked so the total is announced; they also name the slider pattern as a candidate for touch |

The two shipped libraries disagree on the ARIA outright, and the third library's
maintainers name both options without picking one. The catalog already ruled
radiogroup semantics for this family, and that ruling matches Ark and React
Aria's stated guidance; Bits' slider reading is recorded here as the minority
position, with its one real advantage — a single tab stop, and a value text that
reads the whole rating at once — taken as far as radiogroup allows (below).

## Parts

Every name is from the established set in `SPEC.md`. No new role, no new prefix.

| Part | Element | What it is |
| --- | --- | --- |
| `ratinggroup.root` | the group `<div role="radiogroup">` | owns `count`, `value`/`defaultValue`, `half`, `readonly`, `disabled`, `required`, `name`, `onChange`, and publishes `positions` |
| `ratinggroup.label` | `<span>` | the group's name, reached by `aria-labelledby` |
| `ratinggroup.description` | `<div>` | supporting text, in the group's `aria-describedby` |
| `ratinggroup.error` | `<div>` | validation message, in `aria-describedby` **before** the description |
| `ratinggroup.item` | `<div role="radio">` | one position; carries the fill, the half state and the gestures |
| `ratinggroup.valuelabel` | `<output>` | the rating as text, `"3 of 5"` |
| `ratinggroup.field` | clipped `<input>` | what a form receives |

Ark's `control` part is absent: the root's own element is the radiogroup, so a
second wrapper would be an element with nothing to do. Ark's `ItemContext` is a
React render-prop seam with no analogue here.

## Keyboard

One tab stop for the whole group, on the mark the rating reaches — the first
mark while nothing is rated. Every key both moves the rating and takes focus
with it, which is the radio-group rule, not the tab-list one.

| Key | What it does |
| --- | --- |
| `ArrowRight` / `ArrowUp` | rating up by one step; `ArrowRight` becomes `ArrowLeft` in right-to-left text |
| `ArrowLeft` / `ArrowDown` | rating down by one step; the same flip |
| `Home` | no rating (0) |
| `End` | every mark filled (`count`) |
| `Space` / `Enter` | rate the focused mark whole, halves or no halves |

Only the horizontal pair flips in right-to-left text: a vertical arrow means the
same thing in either direction, which is what both surveyed libraries do.

### Where this diverges, and why

- **`Home` clears the rating.** Ark sends `Home` to 1, the lowest mark. Bits
  sends it to `min`, which defaults to 0 — the same key, a different answer,
  because the two libraries disagree about whether a rating has a way back to
  nothing. It does: unlike a radio group, "I have not rated this" is a state a
  person can want back, and no other key spells it. `ArrowLeft` from 1 reaches 0
  in both surveyed libraries too.
- **No number typing.** Bits accepts `3` and `2.5` typed straight in. Left out:
  it is a second, undiscoverable input mode over a control with at most ten
  positions, and it collides with nothing today only because the family has no
  typeahead.
- **No `PageUp`/`PageDown`.** Bits maps them to ±1, which is what an arrow
  already does in a whole-mark group. A big step over a five-item range is not a
  step, it is `End`.

## ARIA

- Group: `role="radiogroup"`, `aria-labelledby` → `ratinggroup.label`,
  `aria-describedby` → error then description, `aria-readonly` and
  `aria-disabled` only when set, `aria-required` when required.
- Mark: `role="radio"`, `aria-checked`, `aria-posinset`, `aria-setsize`,
  `aria-disabled`, and an `aria-label` the family defaults to `"{n} of {count}"`
  which a consumer's own `aria-label` replaces — it is written before the prop
  spread for exactly that reason.
- **No `aria-roledescription="rating"`**, which Ark sets on every item. ARIA
  defines `aria-roledescription` as *replacing* the role word a reader speaks, so
  taking it would trade "radio" — a word every reader has, and whose keys every
  reader's user knows — for a word the family invented, in exchange for
  information the mark's own name already carries.
- `aria-checked` is on exactly one mark: the one the rating reaches
  (`Math.ceil(value)`), including a half rating, which checks the mark it half
  fills. This is the family's sharpest split between what is seen and what is
  heard, and it is the row the real-reader lanes exist to carry: the fill is
  cumulative on screen and singular in the tree.

### What was taken from the slider reading

Bits' single tab stop is right, and it is what this family does. Its
`aria-valuetext` (`"3 out of 5"`) has no home on a radiogroup, so the same
sentence is rendered by `ratinggroup.valuelabel` as an `<output>` — a polite
live region, so a reader hears the whole rating after every change without any
element claiming a value it cannot carry.

## Researched defaults

- **Step: 1, or 0.5 with `half`.** Both libraries spell this `allowHalf`; the
  prop here is `half`, because the shipped grammar takes booleans as bare native
  words and adds no `allow`. It is a boolean rather than slider's numeric `step`
  on purpose: a rating step of 0.3 is not a thing, and an enum would fork the
  component, which `SPEC.md` forbids.
- **`count`: 5.** Both libraries default to five. Ark calls it `count`, Bits
  calls it `max`. `count` is taken because it is how many marks there are; `max`
  would suggest the value's ceiling is configurable apart from the number of
  positions, which it is not.
- **`readonly`: first class.** Both libraries ship it. A read-only group keeps
  its role, its names, its `aria-checked` and its tab stop, and refuses every
  gesture, with `aria-readonly="true"` on the group. That is the "display-only
  aggregate is still a rating" ruling: a reader gets the same reading of a
  rendered average as of an editable one. `disabled` is the one that leaves the
  tab order.
- **Preview on hover: on, and transient.** Both libraries preview. The preview
  is a separate cell (`previewAt`) that the fill reads and that nothing writes
  back: `onChange` never fires for a hover, and `aria-checked` and the readout
  keep saying the committed rating while a preview is on screen. Hovering the
  near half of a mark previews the half value. There is no `onHoverChange`
  (Ark has one) — a consumer who needs the previewed number reads
  `ratinggroup.state().shown`.
- **Cumulative fill: `ui-filled` on every mark up to the rating**, plus
  `ui-half` on a half-filled one and `--rating-fill` as a percentage for the
  overlay a consumer paints. Not per-mark "checked": that is the radio reading,
  and it is the thing this family is not.
- **Right-to-left: read from the element**, never taken as a prop —
  `getComputedStyle(group).direction`, the same seam `slider` uses. It flips both
  the arrow pair and the pointer's midway test.
- **Value: a number**, controlled (`value`) or uncontrolled (`defaultValue`),
  with `onChange` on every commit. `pad`'s shape. 0 means no rating.

## The no-index-props ruling, and how the root owns the list

`SPEC.md` and `U689-render-order-ordinal.md` between them say a family may not
take a position as a prop and cannot derive one from render order today: seam (b)
— a roster position readable while deriving — is the right seam, and it is a
four-part build across the compiler and the browser runtime that has not
happened.

So the root owns the list. `count` is a prop on `ratinggroup.root`, and the root
publishes `positions` — `[1 … count]` — on its instance. The consumer repeats
over that and hands each mark the rating it commits:

```tsx
<ratinggroup.root count={5} name="score">
	<ratinggroup.label>Overall rating</ratinggroup.label>
	<Stars />
	<ratinggroup.field />
</ratinggroup.root>

function Stars() @{
	const rating = ratinggroup.state();

	<div>
		@for (const position of rating.positions; key position) {
			<ratinggroup.item value={position} />
		}
	</div>
}
```

`value` on a mark is not an index in disguise. It is the rating that mark
commits — the same meaning `value` carries on `radiogroup.item` and
`calendar.item` — and the list it comes from is derived by the root from
`count`, not counted by the consumer and not counted by a part. Nothing anywhere
counts rendered elements: the fill, the checked mark, the tab stop and the
keyboard walk are all arithmetic on `value` and `count`. `otp.item`'s `index`
prop, which the catalog wants gone, has no counterpart here.

The consumer's repeat component sits inside the root, because a component that
reads the group's state is part of that group's widget — `calendar`'s `Month`
precedent, and the reason a repeat opens in a plain element rather than sitting
directly under a component tag.

## Open question for the owner

None blocking. One worth recording: **`ratinggroup.field` carries no
`required`.** The group's focusable elements are `role="radio"` divs, so nothing
in the family can carry native constraint validation the browser could focus
when it fails. `required` is therefore announced (`aria-required="true"` on the
group) and enforced by the consumer. Ark puts `required` on its hidden input,
which produces an unfocusable invalid control. If the owner would rather have
native validation at that cost, it is a one-line change.
