# editable — research and the shape it produced

Built in one go: the research below and the family in
`packages/headless/components/src/editable` are the same unit. Implementation
notes (compiler landmines, measured behaviour) live in that folder's `note.md`;
this file is the survey and the decisions it settled.

CATALOG.md item 3 asked one question up front — "reassess after taglist lands:
its item-edit mode is the same machinery, so editable may reduce to a
recomposition rather than a from-scratch family". The answer is at the bottom,
under **Sharing with taglist**: a separate family, sharing a pure helper file.

## What was surveyed

| Library | Has one? | Shape it chose |
| --- | --- | --- |
| Ark UI | yes (`Editable`) | `Root` > `Label`, `Area` > (`Input`, `Preview`), `Control` > (`EditTrigger`, `SubmitTrigger`, `CancelTrigger`). Root props: `activationMode` (default `'focus'`), `submitMode` (default `'both'`), `selectOnFocus` (default `true`), `autoResize`, `maxLength`, `edit`/`defaultEdit`, `value`/`defaultValue`, `disabled`, `invalid`, `readOnly`, `required`, `name`, `form` |
| Chakra UI v3 | yes | the same component: Chakra v3 is built on Ark, so its Editable is Ark's parts and Ark's props with a skin. Contributes no independent evidence |
| Zag | yes (`@zag-js/editable`) | the machine underneath both of the above. Two states, `preview` and `edit`. `EDIT` → `setPreviousValue` + `focusInput`; `SUBMIT`/`CANCEL` → back to `preview`, with `revertValue` on the cancel path reading the stored `previousValue` |
| React Aria | **no** | ships `TextField` only. Inline edit is a known gap; the maintainers' guidance for editing inside collections is to open a dialog instead, because roving focus fights a text input. So there is no React Aria naming or ARIA precedent to weigh here at all |

Two shipped libraries, and they are the same library. That is a thinner
landscape than taglist's or rating-group's, and it means the ecosystem
"consensus" is really one design — worth naming, because it makes divergence
cheaper to justify than usual, not more expensive.

The APG has no editable pattern either. There is no canonical ARIA answer; what
follows is reasoned from what a person has to hear, not copied.

## Parts

Every name is from the established set in `SPEC.md`. No new role, no new prefix.

| Part | Element | What it is |
| --- | --- | --- |
| `editable.root` | `<div role="group">` | owns `value`/`defaultValue`, `placeholder`, the three activation booleans, `cancelOnBlur`, `readonly`, `disabled`, `required`, `invalid`, `name`, `onChange`, `onEditChange` |
| `editable.label` | `<label>` | the value's name |
| `editable.trigger` | `<button type="button">` | the preview control; renders the value |
| `editable.input` | `<input type="text">` | the field, `hidden` outside a session |
| `editable.description` | `<div>` | supporting text |
| `editable.error` | `<div role="alert">` | validation message, named first |
| `editable.field` | `<input type="hidden">` | what a form receives |

### The preview control is `trigger`, and that is a SPEC lookup, not a coin toss

`SPEC.md` has no `preview` role and minting one would need three component use
cases and owner sign-off. It also does not need one: `trigger` is defined as
"the control that opens/activates/selects", and opening the edit session is
exactly what this control does. Ark calls it `Preview` because Ark names parts
after what they show; this package names them after what they do.

### It is a real `<button>`, which is the one real divergence from Ark

Ark's `Preview` is a `<span>` with `tabIndex: 0`, no role, and
`aria-label: translations.edit` — so a reader hears "edit" and the value is not
in the announcement at all, only in the text the label overrode. This family
renders a `<button>` whose accessible name is the value's own words.

The trade is deliberate:

- A reader hears "Quarterly plan, button" — both the words and the fact that
  they can be changed. Ark's shape gives the second without the first.
- Enter and Space activate natively, so the double-click variant stays operable
  from a keyboard for free.
- A focusable element with no role is the weakest link in Ark's accessibility
  story here; `button` is the role the behaviour already is.

Cost: an empty value has no accessible name, which is why `placeholder` is
documented as required for anything that can be empty, and why the empty
scenario has a screen-reader row of its own.

### Ark's parts that are absent

- **`Area`** and **`Control`** — layout wrappers with no behaviour. Nothing here
  needs an element to exist for CSS's sake; the consumer's own markup does that.
- **`EditTrigger` / `SubmitTrigger` / `CancelTrigger`** — separate buttons for
  "edit", "save" and "cancel". These are genuinely useful for touch, where there
  is no Escape key. They cannot ship under the established names: `trigger` is
  taken by the preview, and `edittrigger`/`submittrigger`/`canceltrigger` would
  mint three new prefixes. **Open owner question**, deliberately not improvised.
  A recommendation for whoever answers it: `submit`/`cancel` read as roles, not
  prefixes, and `close` (established) is arguably what a cancel button is — but
  that is a three-use-case argument, not a build decision.

## Props, and where the names diverge

`SPEC.md` bans mode/role/type enum props, which rules out Ark's two central
props outright. Both become booleans in the shipped idiom
(`selectOnFocus`, `removeOnBackspace`, `closeOnInteractOutside` are the
precedents):

| Ark / Zag | Here | Why |
| --- | --- | --- |
| `activationMode: 'click'` | (the default) | the preview is a button; a click activating it is what a button already means |
| `activationMode: 'dblclick'` | `editOnDoubleClick` | |
| `activationMode: 'focus'` | `editOnFocus` | Ark's default; opt-in here, because a Tab that silently swaps a control for a text field is a surprise nobody asked for |
| `activationMode: 'none'` | — | left out: with no controlled `edit` prop there is nothing to drive it. Noted below |
| `submitMode: 'both' \| 'blur'` | (the default) | |
| `submitMode: 'enter' \| 'none'` | `cancelOnBlur` | inverted so the boolean is off by default, which is this package's rule for behavioural booleans, AND so the default is commit-on-blur: a person who clicked away from a field they were typing in meant what they had written. taglist's per-tag edit already ships that ruling |
| `selectOnFocus: true` | (always) | a rename that does not select the old name makes every rename start with Ctrl+A. Not worth a prop |
| `onValueCommit` | `onChange` | SPEC: the primary change callback is `onChange`, never a reference's noun |
| `onValueRevert` | — | a revert is `onEditChange(false)` arriving without an `onChange`. No second noun |
| `onEditChange` | `onEditChange` | Ark's name already fits the `on<State>Change` grammar |
| `maxLength` | — | `editable.input` spreads the rest of its props onto a real `<input>`, so `maxlength`, `spellcheck` and `inputmode` pass straight through. A family prop would only re-spell the platform |
| `autoResize` | — | `field-sizing: content` is CSS. JS never builds CSS strings here |
| `placeholder` (string or `{preview, edit}`) | `placeholder` (string) | the per-mode object is a second value model for one string. One placeholder serves both |
| `edit` / `defaultEdit` | — | a controlled mode flag. Nothing in the queue needs it; noted below |
| `form` | — | `editable.field` is a plain input, so a consumer's own `form=` attribute passes through |

### Researched defaults

- **Enter commits, Escape restores the previous value.** Unanimous across every
  library and every hand-rolled inline edit; no decision to make.
- **The previous value is captured when the session opens**, which is Zag's
  `setPreviousValue`, and restoring it is Zag's `revertValue`. Here that is one
  pure function, `settled(previous, typed, keep)` — the cancel path ignores the
  typed text entirely rather than diffing it.
- **The words are trimmed on commit.** taglist's `rename` already trims.
- **Textarea + Cmd/Ctrl+Enter.** Zag supports a textarea whose commit key is
  modified. Out of scope for a rename family; noted as a follow-up shape, not a
  gap.

## Keyboard

| Where | Key | What it does |
| --- | --- | --- |
| preview | Enter, Space | opens the session (native button activation) |
| preview | Tab | moves on — unless `editOnFocus`, where landing opens it |
| field | Enter | commits the trimmed words; focus returns to the preview |
| field | Escape | restores the value from before the session; focus returns to the preview |
| field | everything else | the native input's: caret, selection, typing |

There is no arrow handling anywhere in this family, which is the point of the
`editKey` helper returning `undefined` for everything but two keys.

## ARIA

- Root: `role="group"`, `aria-labelledby` → `editable.label`, `aria-disabled`
  only when disabled.
- Preview: `button`, name = the value's words (or the placeholder),
  `aria-describedby` → error then description, `aria-disabled="true"` when
  read-only.
- Field: `aria-labelledby` → the label, `aria-describedby` → error then
  description, `aria-invalid`, `aria-required`.
- `ui-editing` on the root is the mode; `ui-empty` on the preview says the words
  are the placeholder.

**`aria-readonly` is not an attribute `button` supports**, so Ark's read-only
signal has no home on this element. Read-only reaches a reader as
`aria-disabled="true"` on a control that stays focusable and readable — a
read-only value is still a value somebody has to be able to hear. The
screen-reader rows pin exactly that.

`required` is announced, not enforced: a hidden input cannot carry constraint
validation, so it reaches a person through `aria-required` on the field.

## Focus, and the one place this diverges from Zag on principle

Zag's `restoreFocus` action is wrapped in `raf(...)`. This family does not and
may not: `SPEC.md`'s Timing section says the runtime commits the write so
`focus()` lands, and a family that cannot focus what it just revealed files a
witness against the runtime instead of retrying frames. Both directions were
measured green in the browser suite — the caret lands in the field with the old
words selected on activation, and lands back on the preview after Enter and
after Escape, with no frame gap and no retry.

Blur is the exception, and deliberately: focus is already wherever the person
put it, and taking it back to the preview is the classic inline-rename bug.

## Sharing with taglist — the ruling CATALOG asked for

**A separate family that shares a pure helper file; taglist is not a
recomposition of it, and editable is not a recomposition of taglist.**

What is genuinely the same, and is now extracted into
`packages/headless/components/src/editable/edit-walk.ts` for taglist to import
later (no taglist edits in this unit):

- `editKey(key)` — Enter means commit, Escape means cancel, everything else is
  the input's. taglist's `TagListItemInput` hand-writes this.
- `opensEdit(detail, onDoubleClick)` — the click-count decision, including the
  `detail === 0` case that keeps a double-click control keyboard-operable.
  taglist's `TagListItem` hand-writes `event.detail === 2`, and therefore has no
  keyboard route through the item itself.
- `settled(previous, typed, keep)` — the value a session leaves behind, trimmed.
  taglist's `rename(held, was, now)` is this function plus a list splice.
- `landCaret(box, words)` — put the old words in the field and select them.
  taglist does this inline in `edit()`.

What does **not** transfer, and is why this is not one family:

- taglist's edit target is one row of a `string[]` whose identity IS its value,
  so its settle has to splice, dedupe and merge-on-collision. That is list
  arithmetic and belongs in `tag-walk.ts`.
- taglist has no preview control. Its edit mode is entered from the row's
  highlight — which is a split focus model with the caret parked in a different
  field — and there is no button to hand focus back to. editable's whole
  anatomy is the preview/field pair.
- The value models differ: one string with a placeholder versus a keyed row of
  an array. Making one family serve both would put a `string[]` and a `string`
  behind the same `value` prop.

Recommended follow-up (not this unit): a small unit that rewrites taglist's
`TagListItemInput` and `TagListItem` handlers over these four functions and
deletes the hand-written duplicates. It is a behaviour-preserving change with
one visible improvement — `opensEdit` gives taglist's double-click-to-edit a
keyboard route it does not have today.

## Open questions for the owner

1. **Submit and cancel buttons.** Touch has no Escape key, and Ark ships three
   trigger parts for it. Every name for them is outside the established set.
   Blocked on a naming ruling, not on effort.
2. **A controlled `editing` prop.** Ark's `edit`/`defaultEdit` lets an app open
   the session from elsewhere ("rename" in a context menu), which is a real use
   case for the list-title case CATALOG names. Deliberately not shipped
   unasked; it is one cell and one prop when wanted.
3. **The empty-value name.** `placeholder` is currently the only thing naming an
   empty preview button. The alternative is naming the preview from the label
   part as well, which reads "Document name, Quarterly plan" and is noisier for
   the common case. Left as documentation for now.

## What shipped

Seven parts, `edit-walk.ts` (seven pure functions plus `landCaret`), eight
scenarios, 63 browser rows green across CSR and SSR (anatomy, all three
activation variants, both keys, both blur policies, placeholder, disabled,
read-only, form, two on a page, part cardinality, and six axe runs), five
virtual-reader rows, and NVDA/VoiceOver lanes over one shared transcript.
Registration in the barrel and the gallery is the follow-up unit, which is also
what makes the two real-reader lanes runnable.
