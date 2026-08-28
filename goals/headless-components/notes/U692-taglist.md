# U692 — taglist research memo

Charter: `packages/headless/components/CATALOG.md` § "Active queue / 1. taglist". The catalog says
no canonical WAI-ARIA pattern exists and that the semantics choice (grid vs listbox vs plain
buttons) is a real owner decision. This memo makes that call as a **confirmable default** and
records what it rejected, so the owner can overturn one paragraph rather than re-derive the field.

References read: [Ark UI tags-input](https://ark-ui.com/docs/components/tags-input) (and the Zag
machine behind it, `packages/machines/tags-input/src/tags-input.connect.ts`),
[React Aria TagGroup](https://react-aria.adobe.com/TagGroup) plus
[useTagGroup](https://react-spectrum.adobe.com/react-aria/useTagGroup.html),
[Melt UI tags-input](https://melt-ui.com/docs/builders/tags-input), and Base UI. Bits UI's
tags-input page 404s at `bits-ui.com/docs/components/tags-input`; Bits is the Melt/Zag-lineage
Svelte port and contributes nothing the two upstreams do not.

**Base UI has no tags input and no chip primitive.** Its own guidance is to compose one out of
Combobox plus consumer-rendered chips. That is a data point for the multi-select question below,
not an argument against the family.

## What each reference ships

| | Ark UI / Zag | React Aria | Melt UI |
| --- | --- | --- | --- |
| Parts | `Root`, `Label`, `Control`, `Item`, `ItemPreview`, `ItemText`, `ItemInput`, `ItemDeleteTrigger`, `Input`, `ClearTrigger`, `HiddenInput` | `TagGroup`, `Label`, `TagList`, `Tag`, `Button slot="remove"`, `Text slot="description"`, `Text slot="errorMessage"` | `root`, `tag`, `deleteTrigger`, `edit`, `input` |
| Has a text input | yes — that is the point | **no** — TagGroup is display-only; TokenField is the separate editing widget | yes |
| ARIA on the collection | none. Root, control and item carry `data-*` only | `role="grid"` on the list, `role="row"` per tag, `role="gridcell"` inside | none stated; semantic elements only |
| Highlight tracking | `aria-activedescendant` on the text input | roving `tabindex` into the grid | real DOM focus moves onto the tags |
| Walk into the list | ArrowLeft when the input is empty or the caret is at position 0 | n/a (no input) | Backspace/ArrowLeft from an empty input |
| Remove | Backspace (focused tag, else last), Delete | Backspace / Delete on the focused tag | Delete removes and shifts focus right; Backspace removes and shifts left |
| Inline edit | Enter or double-click on a highlighted tag → `ItemInput` | none | Enter on a focused tag → `edit` |
| Paste | `addOnPaste`, default **false**; splits on `delimiter` | n/a | `addOnPaste` |
| Delimiter | `delimiter`, default `,`; string or RegExp | n/a | Enter only |
| Count cap | `max` (default `Infinity`) + `allowOverflow` | n/a | `maxTags` |
| Duplicates | `validate` callback | n/a | `unique` flag |
| Blur | `blurBehavior: 'add' \| 'clear'` | n/a | — |

The one honest summary: **Ark/Zag and Melt are the same widget** (a tokenizing field), React Aria's
TagGroup is a **different** widget (a display-only, selectable chip row), and React Aria ships
TokenField separately for the editing case. Our catalog decision is to cover both shapes with one
family — the input part is what turns the static row into the tokenizing field — so this family has
to answer for both focus regimes, which no single reference does.

## Semantics ruling (confirmable default)

**Chosen: `role="group"` on the root, no collection role, a real `<button>` per tag as the delete
affordance, and an always-mounted polite live region in the root that speaks every add, remove,
edit and refusal.**

Concretely:

- `taglist.root` → `<div role="group">`, named by `taglist.label` through `aria-labelledby`.
- `taglist.item` → a plain `<div>` with **no ARIA role**, carrying `ui-value`, `ui-highlighted`,
  `ui-editing`.
- `taglist.itemlabel` → the tag's words.
- `taglist.itemclose` → a real `<button type="button">` whose accessible name defaults to
  `Remove <value>`. This is the object a reader lands on and the object a pointer clicks.
- `taglist.iteminput` → the inline-edit `<input>`, `hidden` unless this tag is the one being edited.
- The root renders a visually hidden `<output aria-live="polite" aria-atomic="true">` that is not a
  part, exactly as `numberbox.root` does: an announcement a consumer has to remember to mount is not
  a guarantee.

### Why not grid (React Aria)

`role="grid"` is the only collection role that legally contains a focusable child, which is why
React Aria picked it: `option` children are presentational, so a remove button inside an `option` is
not reachable, and `gridcell` must be owned by `row` which must be owned by `grid`. That legality
comes at a price we cannot pay:

1. It needs **two parts our anatomy does not have** — a row wrapper and a cell wrapper per tag. The
   owner's shape is `root > item (+ delete/edit) > optional input`. Minting `itemrow`/`itemcell`
   would be two new roles against SPEC's 3-use-case bar, for one family.
2. A `grid` cannot contain the text input. Our root does. React Aria's TagGroup dodges this by
   having no input at all; the moment the input part is mounted the grid becomes illegal.
3. What readers actually say over a chip row is "table, row 1, column 1" before every tag. MDN
   records `gridcell` support in assistive technology as poor and recommends against re-purposing.

### Why not listbox/option (our own combobox lineage)

`aria-activedescendant` is best supported when it points at an `option` inside a `listbox`, and this
package already ships that pairing in `combobox`. Two things kill it here:

1. `option` has presentational children. A delete button inside one is not reachable by any reader.
   Both of our shapes need a real delete button, so this would demote deletion to a keyboard-only
   gesture plus an `aria-hidden` pointer target — worse for everybody.
2. A `listbox` cannot contain the text input either, and there is no part between root and item to
   hang the listbox on.

### Why plain buttons wins here

The delete button is the only element in a chip that a person actually operates. Giving it a real
`<button>` role and a name that carries the tag's words (`Remove alpha`) means every reader, in
every mode, gets the tag's text and the one action available, with zero re-purposed roles and zero
axe exposure. The cost — no "list, 3 items" preamble and no ordinal — is paid back by the live
region, which is a stronger channel than anything the collection roles buy: a role tells you the
shape once, the live region tells you what just changed every time.

### `aria-activedescendant` is deliberately not written

The catalog's split focus model ("DOM focus stays in the input while a highlighted tag is tracked
activedescendant-**style**") is implemented as the *pattern* — the highlight is family state, DOM
focus does not move — not as the attribute. Two reasons:

1. The family cannot name the highlighted item without an identity attribute. SPEC's capability
   rules ban `data-*` state and identity attributes, and per-item `element()` handles live on the
   item's own shared instance, which the root's input cannot reach. Writing the attribute would
   mean hand-minting ids, which is exactly the thing the runtime owns.
2. Zag ships the attribute onto an item that carries no role at all. `aria-activedescendant`
   pointing at a role-less `div` outside a listbox is the weakest link in the whole ecosystem's
   accessibility story; it is not worth reproducing.

What replaces it: `ui-highlighted` for CSS, the live region for speech, and — for anyone who wants
DOM focus on a tag — the delete buttons are ordinary tab stops.

### Tab stops: ordinary buttons, not a roving tabindex

React Aria uses a roving tabindex, but only because `grid` licenses it. Without the grid role, a
`<button>` in flow content that is not a tab stop is a WCAG 2.1.1 hazard, and the family cannot
reliably tell at render time whether an input part is mounted (the items render before the input, so
any inferred `tabindex` would be wrong in the server-rendered HTML and only correct itself on
resume). So: **delete buttons are ordinary tab stops in both shapes.** The arrow walk is the fast
path, not the only path.

This is the one place the family knowingly diverges from every reference, and it is recorded as a
finding rather than hidden: a 20-tag row is 20 tab stops. If the owner wants that capped, the fix is
a roving tabindex plus an explicit prop naming the shape, not an inference.

## Behaviour rulings

- **Value is a set in order.** `value: readonly string[]`, deduped on every write. Adding a tag that
  is already held is a no-op that highlights the existing one. There is no `duplicates` prop,
  because the highlight, the edit target and `@for`'s key are all the tag's own value — duplicates
  would make two tags indistinguishable, and the owner rule bans an index prop that would
  distinguish them. Melt's `unique` and Ark's `validate` are collapsed into this.
- **Trim and drop empties** on every admission. `"a, ,b"` pasted with `,` yields `['a','b']`.
- **`max`** is a count cap; `0` means no limit (not `Infinity`, which does not survive
  serialization). A refused add speaks through the live region rather than failing silently. Ark's
  `allowOverflow` is not ported: a cap that can be exceeded is not a cap.
- **`delimiter`** defaults to `,`. Typing it commits the text before it; pasting splits on it.
- **Paste always splits.** Ark's `addOnPaste` defaults to `false`, which means the out-of-the-box
  behaviour of every Ark tags input is to paste `a,b,c` as one tag named `a,b,c`. That is the wrong
  default; splitting is what a person pasting into a chip field means.
- **Home/End are not stolen.** The caret owns them while focus is in the text input. The arrow walk
  into the list is ArrowLeft at caret 0 only. (Ark takes Home/End; that breaks text editing.)
- **Backspace at caret 0 walks before it deletes.** First press highlights the last tag, second
  press removes it. Melt's protocol. Ark deletes on the first press, which is the classic
  "I lost a tag I could not see" complaint.
- **Delete on a highlighted tag removes it** and lands the highlight on the next one, or the
  previous one if it was last, or back in the input if the list is now empty.
- **Inline edit** is opt-in (`editable`), matching this package's boolean grammar where every
  behavioural boolean is opt-in (`multiple`, `loop`, `inline`, `removeOnBackspace`). Ark defaults it
  on; we do not, because an accidentally editable filter-chip row is a worse failure than a missing
  affordance. Enter on a highlighted tag, or a double-click on the tag, opens the edit input;
  Enter commits, Escape restores, blur commits.
- **No `blurBehavior`.** Ark's `'add' | 'clear'` is a mode enum. Blur leaves the typed text alone,
  which is what a native field does.
- **No `clear` part.** A "clear all" button is one `onChange([])` call in consumer markup and owns
  no state machine.
- **`required`** is conveyed as `aria-required` on the input. The form field is one hidden input per
  tag under the root's `name`, so the browser hands back `formData.getAll(name)`. A hidden input
  cannot carry `required`, and that is stated rather than faked.

## Keyboard protocol

Focus in `taglist.input`:

| Key | Effect |
| --- | --- |
| printable | ordinary typing |
| `delimiter` | commits the text before it as a tag |
| Enter | commits the typed text; with a tag highlighted and `editable`, opens that tag's edit input |
| ArrowLeft (caret at 0, no selection) | highlight walks left; from no highlight, lands on the last tag |
| ArrowRight | highlight walks right; from the last tag, returns to the input |
| Backspace (caret at 0) | with a tag highlighted, removes it; otherwise highlights the last tag |
| Delete | removes the highlighted tag |
| Escape | clears the highlight |

Focus on a `taglist.itemclose` button (the display-only row's protocol, and available in the
tokenizing shape too):

| Key | Effect |
| --- | --- |
| ArrowLeft / ArrowRight | moves focus to the neighbouring tag's delete button |
| Home / End | first / last delete button |
| Enter / Space | removes the tag (native button activation) |
| Backspace / Delete | removes the tag; focus lands on the neighbour |

Focus in a `taglist.iteminput` (edit mode): Enter commits, Escape restores, blur commits.

## Relationship to a future multi-select combobox

Decided up front, as the catalog asks. **chips-in-combobox is a recomposition, not a fork.** The
combobox already owns the popup, the filtering and the `multiple` value; what it does not own is the
chip row. taglist owns exactly that, and the reusable surface is:

1. **`taglistState()` is exported as `taglist.state`** (the shipped idiom — see `fileupload.state`).
   A combobox chip row mounts `taglist.root value={combobox.value}` and forwards `onChange` back
   into the combobox. Nothing new is needed on the combobox side.
2. **`tag-walk.ts` is pure over `readonly string[]`.** `nextHighlight`, `afterRemoval`,
   `splitPasted` and `admit` take arrays and return arrays; they touch no DOM and read no instance.
   That is what makes them reusable from a second family — the combobox's own highlight walk had to
   go through the DOM because its options are consumer markup, whereas a chip's order IS the value
   array.
3. **The delete mechanics live on `taglist.itemclose`**, whose only contract is "remove the tag whose
   value this button carries". A combobox that renders chips gets the same button, the same
   accessible name, and the same Backspace/Delete protocol for free.

What must NOT be shared: the input part. A combobox's field is `role="combobox"` with
`aria-expanded`/`aria-controls`; taglist's is a plain textbox. Mounting both would produce a control
claiming two roles. So the composition is `combobox.input` + `taglist.item`s, never
`taglist.input` inside a combobox. That is the line to hold when the multi-select charter runs.

## Findings and open items

- **Registration is a follow-up and the packet fences it off.** The consequence is that this
  family's scenarios cannot yet write `import { taglist } from '../../index.ts'`: the barrel has no
  `taglist` export, so that import fails `pnpm typecheck`. They import the family's own index
  (`import * as taglist from '../index.ts'`) instead, which is the identical namespace object. The
  registration unit should add `export * as taglist from './taglist/index.ts'` to
  `src/index.ts` and rewrite those imports to the shipped form.
- **The real-reader lanes name their gallery anchor locally.** `FAMILY_ANCHORS` in
  `apps/sr-gallery/preview-server.ts` has no `taglist` key and the packet fences the gallery off, so
  `taglist-transcript.ts` declares `TAGLIST_ANCHOR` itself. Registration must move that constant
  into `FAMILY_ANCHORS` and import it, per the repo rule that config facts come from their owning
  package.
- **No `<style>` block ships.** SPEC calls for CSS defaults where the family *needs* them — anchor
  positioning, hidden-until-open, stacking. taglist has none of those: the edit input is hidden with
  the `hidden` attribute, and chip layout is entirely the consumer's. Adding a layer block with
  nothing to say would be decoration.
- **Open for the owner:** the tab-stop divergence above (20 tags = 20 tab stops). Capping it needs
  either the grid role we rejected or an explicit prop naming the display-only shape; both are
  bigger than this unit and neither is needed for correctness.
