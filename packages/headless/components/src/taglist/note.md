# taglist

A row of committed `string[]` values. Mount `taglist.input` inside the root and the static row
becomes a tokenizing field; leave it out and the row is display-only with its delete buttons still
fully operable. One family, both shapes.

The full survey (Ark UI / Zag, React Aria TagGroup, Melt UI, Base UI), the semantics decision with
its rejected alternatives, the behaviour rulings and the multi-select-combobox relationship live in
`goals/headless-components/notes/U692-taglist.md`. This file records what shipped and what is still
open.

## Anatomy

| Part | Element | Notes |
| --- | --- | --- |
| `taglist.root` | `div role="group"` | named by `taglist.label`; renders a live region that is not a part |
| `taglist.label` | `label` | `for` the field; names the root through `aria-labelledby` either way |
| `taglist.input` | `input type="text"` | optional; mounting it is what makes the row a tags input |
| `taglist.item` | `div` | **no ARIA role**; carries `ui-value`, `ui-highlighted`, `ui-editing` |
| `taglist.itemlabel` | `span` | the tag's words; hidden while that tag is being edited |
| `taglist.itemclose` | `button` | named `Remove <value>`; an ordinary tab stop |
| `taglist.iteminput` | `input` | the inline-edit field, `hidden` unless this tag is being edited |
| `taglist.description` | `div` | named by the field's `aria-describedby` |
| `taglist.error` | `div role="alert"` | named first in `aria-describedby` |
| `taglist.field` | `div` | one `input type="hidden"` per tag under the root's `name` |

Every name comes from SPEC's established roles and prefixes. Nothing new was minted.

## Semantics, in one paragraph

No collection role. `option` has presentational children, so a delete button inside one is
unreachable; `grid` (React Aria's choice) would need a row part and a cell part per tag and cannot
contain the text field at all. So the root is a plain `role="group"`, each tag's delete button is a
real `<button>` whose accessible name carries the tag's own words, and the root renders an
always-mounted `output[aria-live="polite"]` that speaks every add, removal, edit and refused cap.
The live region is the guarantee; there is no `aria-activedescendant`, because naming a highlighted
item would need a hand-minted id and because pointing that attribute at a role-less item (what Zag
ships) is the weakest link in the ecosystem's accessibility story.

## Keyboard

In the field: the delimiter or Enter commits the typed words; ArrowLeft from an empty field or a
caret at 0 walks into the row from its right end; ArrowRight walks back out; Backspace walks first
and removes on the second press; Delete removes the highlighted tag; Escape gives the walk back to
the caret. Home and End are left to the caret.

On a delete button: ArrowLeft/ArrowRight/Home/End move focus along the row; Enter and Space remove
through native button activation; Backspace and Delete remove and move on.

In an edit field: Enter commits, Escape restores, blur commits.

## Consumer shape

The chips are the consumer's own markup, repeated over the consumer's own array, inside the root:

```tsrx
const own = state({ tags: ['alpha', 'beta'] as readonly string[] });

<taglist.root value={own.tags} onChange={(next) => { own.tags = next; }}>
  <div role="presentation">
    @for (const tag of own.tags; key tag) {
      <taglist.item value={tag}>
        <taglist.itemlabel />
        <taglist.itemclose>×</taglist.itemclose>
      </taglist.item>
    }
  </div>
  <taglist.input />
</taglist.root>
```

Two things about that shape are load-bearing and were found the hard way:

- The array must live on a state **object** (`own.tags`), not in a reassigned `let tags = state([])`.
  A repeat follows a property write; reassigning the binding leaves it showing the old array.
- The repeat must sit in a plain element, because a construct may not be the direct child of a
  component tag.

## Findings

- **A consumer component that reads `taglist.state()` in a child position sees empty cells.**
  Moving the repeat into a nested `function Row()` that calls `taglist.state()` gave `undefined` for
  every seeded cell, including `name`, while the family's own parts in the same tree read the right
  values. The `fileupload` scenarios do the identical thing and work, so the trigger is **not
  isolated** and no runtime witness is filed on this evidence. Scenarios repeat over the consumer's
  own array instead, which is the better idiom for a controlled `string[]` anyway.
- **Focus after a keyboard removal does not survive the keyed repeat.** Deleting a focused tag with
  Backspace or Delete moves the highlight to the neighbour correctly, but the neighbour's button —
  looked up through the family's own plural handle, before or after the write — does not hold DOM
  focus: it lands on `<body>`. The browser row pins the highlight and says so in a comment rather
  than pinning focus. This is a candidate runtime witness (keyed reconcile replacing sibling nodes),
  not a family bug that a retry loop may paper over.
- **One red row: `the form field hands back one entry per tag under one name`** (CSR and SSR). In
  `topics-form.tsrx` the delimiter clears the field — so the handler ran and committed — but
  `taglist.value` never changes, and the hidden inputs stay at the tag the scenario started with.
  The identical gesture against `basic.tsrx` passes. Ruling out `required`/`invalid` by removing
  them changed nothing, so the difference is the `<form>` ancestor or the extra `error`/`description`
  parts. Not diagnosed; the row is left red rather than weakened.
- **No `<style>` block.** SPEC calls for CSS defaults where the family needs them — anchor
  positioning, hidden-until-open, stacking. taglist needs none: the edit field is hidden with the
  `hidden` attribute and chip layout is entirely the consumer's.
- **Registration is a follow-up.** Scenarios import `* as taglist from '../index.ts'` because the
  barrel has no `taglist` export yet, and `taglist-transcript.ts` spells its own gallery anchor
  because `FAMILY_ANCHORS` has no `taglist` key. Both are marked in place for the registration unit.
