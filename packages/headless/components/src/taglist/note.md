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
through native button activation; Backspace and Delete remove and move on; F2 opens the tag for
editing when the row is `editable` and that tag mounts a `taglist.iteminput`.

In an edit field: Enter commits, Escape restores, blur commits.

The two ways in are the two focus regimes, not two spellings of one gesture. With the caret in the
field the tag under the walk is opened with **Enter**, which is what every reference ships and what
the field has spare. With DOM focus on the tag itself — the display-only row, and anyone who tabs to
a chip — Enter and Space are already that delete button's native activation, so the key there is
**F2**, the APG's edit-in-place key. Neither route changes what Enter does anywhere it already
meant something.

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

## The edit session is shared with editable

`taglist.iteminput` and the edit mode on `taglist.item` run
`packages/headless/components/src/editable/edit-walk.ts` rather than a second copy of it: `editKey`
decides what one press inside an open session means, `settled` decides the words it leaves behind,
`landCaret` puts them in the field and selects them, and `opensEdit` decides whether a press on the
tag opens one. What stays here is the list arithmetic — `rename` splices, dedupes and merges on
collision, which is what a keyed row of an array needs and a single string does not.

## Findings

- **The field never mints a hidden input for a tag the first render did not carry.** Dropping a tag
  the row started with takes its input away, and typing that same tag back brings it back; a tag the
  first render never carried gets no input, ever. An attribute binding over `taglist.value` on the
  field's own host element refreshes on the same write, so the cell is subscribed and the write
  reaches the DOM — the row minting is what is missing. Not the `<form>`, not `required`/`invalid`,
  not the `error`/`description` parts: `basic.tsrx` fails the same way and only looked green because
  no row read the hidden inputs after an add. Two rows stay pinned `test.fails`. Framework, not
  family; the measurements and the reduction are in
  `goals/headless-components/notes/U697-taglist-defects.md`.
- **A consumer component's text over `taglist.value` does not refresh.** `scenarios/consumer-state.tsrx`
  mounts a consumer-owned component inside the root that calls `taglist.state()`. Every seeded cell
  reads correctly, so U692's "empty cells" does not reproduce. After an add, an attribute over the
  collection refreshes and a text child derived from it on the same element does not. One pinned row.
- **Focus after a keyboard removal lands on `<body>`, and the keyed repeat is not why.** The
  neighbour's button is the same DOM node before and after the gesture and is still connected, so
  nothing replaced it. The family focuses that live element; the commit that removes the previously
  focused element then blanks focus. Looking the neighbour up after the write rather than before
  changes nothing, and that is the ordering that ships because it is the one the repo rule asks for.
  The browser row pins the highlight, not focus. Runtime, not family — no retry loop.
- **No `<style>` block.** SPEC calls for CSS defaults where the family needs them — anchor
  positioning, hidden-until-open, stacking. taglist needs none: the edit field is hidden with the
  `hidden` attribute and chip layout is entirely the consumer's.
- **Registered.** The barrel exports `taglist`, `package.json` exports `./taglist`, the conformance
  battery carries a descriptor, and the sr-app serves `#taglist` with the tags input, the
  display-only row and the editable one. Scenarios import `{ taglist }` from the barrel the way a
  consumer would, and `taglist-transcript.ts` reads `FAMILY_ANCHORS.taglist` and the shared
  `GALLERY_WALK_LIMIT`. What that unit found is in
  `goals/headless-components/notes/U706-taglist-registration.md`.
