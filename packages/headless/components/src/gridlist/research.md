# gridlist research

Sources read for this build:

- React Aria **GridList** — <https://react-aria.adobe.com/GridList> and its hook
  page `GridList/useGridList`. The reference implementation of "a list whose rows
  hold controls".
- WAI-ARIA APG **Grid pattern** — <https://www.w3.org/WAI/ARIA/apg/patterns/grid/>.
  The normative keyboard model, and the only source that says what happens when a
  cell contains a widget.
- Melt **spatialmenu** (work in progress, no documented ARIA) —
  <https://next.melt-ui.com/components/spatialmenu/>. Read for its navigation
  engine only.

The catalog's ruling is the frame: gridlist and table are separate families over
one internal engine, gridlist is "a list of rich items" with one logical column,
and the engine stays inside family code until `table` lifts it.

## Why a grid at all

React Aria's own answer, and it is the right one: a plain `<ul>`/`<ol>` cannot
hold a button a keyboard user can reach without either putting every button in
the tab order (a tab stop per row per control — unusable at fifty rows) or
inventing a focus model HTML does not have. `role="grid"` is the ARIA role that
licenses a roving tabindex over rows plus a documented way into the controls a
row holds. That is the whole reason this family is not `list`.

A consequence carried over verbatim: **ARIA gives a row no meaning without a
cell in it.** React Aria's examples all carry an extra wrapper with
`gridCellProps` for exactly this. Ours is `gridlist.itemcontent`, and it is not
optional. One column, because that is what "a list of rich items" means; a
second column is what `table` is for.

## Keyboard: what each source says, and what shipped

| Key | APG grid | React Aria GridList | Shipped |
| --- | --- | --- | --- |
| `ArrowDown`/`ArrowUp` | one cell up/down | one row up/down | one row up/down, **measured** (see below) |
| `ArrowLeft`/`ArrowRight` | one cell left/right; a layout grid **may** wrap to the next row | steps the focusable children of the row (`keyboardNavigationBehavior="arrow"`) | one row left/right, measured, wrapping to the neighbouring visual row |
| `Home`/`End` | first/last cell in the row | first/last row | first/last row |
| `Control+Home`/`Control+End` | first/last cell in the grid | — | not shipped; `Home`/`End` already mean the ends of a one-column list |
| `PageUp`/`PageDown` | several rows, optional in a layout grid | several rows | not shipped (see gaps) |
| `Enter` | "disables grid navigation … places focus on the first widget" | — | focus moves to the row's first `gridlist.itemtrigger` |
| `F2` | same as `Enter` | — | same as `Enter` |
| `Escape` | "restores grid navigation" | clears the selection (`escapeKeyBehavior`, default `clearSelection`) | **both**, disambiguated by where focus is: inside a row's controls it returns focus to the row; on a row it lets go of everything picked |
| `Space` | `Shift+Space` selects the row | picks the focused row | picks the focused row |
| `Control/Command+A` | "selects all cells" | selects all | picks every row, only when several may be picked |
| `Shift`+arrow | extends the selection | extends the selection | replaces the run measured from the anchor row |
| printable keys | activate edit mode in an editable cell | typeahead (unless `disallowTypeAhead`) | typeahead |
| `Tab` | moves between grid widgets once navigation is disabled | leaves the list (`arrow`) or steps children (`tab`) | leaves the list; the controls a row holds are at `tabindex="-1"` |

### The one real divergence: Left/Right

React Aria's default binds `ArrowLeft`/`ArrowRight` to *stepping the controls
inside a row*, and offers `keyboardNavigationBehavior="tab"` as the alternative.
The APG binds them to *moving between cells*, and explicitly allows a layout grid
to wrap them onto the next row.

We took the APG's meaning, and the APG's `Enter`/`Escape` pair for getting into
and out of a row's controls. Three reasons:

1. A card gallery is the family's headline use case and it is two-dimensional.
   With React Aria's binding, `ArrowRight` in a gallery does nothing on a card
   with no buttons, which is most cards.
2. `Enter` → first widget, `Escape` → back to the row is the normative model, is
   the same in every grid a person has used, and needs no prop.
3. It removes `keyboardNavigationBehavior` — an enum prop, which the naming spec
   bans outright — without losing anything: `Tab` still steps the controls
   natively once focus is inside a row.

Recorded as a divergence rather than a fix: React Aria's binding is defensible
for a stacked list, and if a consumer report says the `Enter` step is a barrier,
this is the decision to revisit.

## Navigation: the Melt steal

Melt's `spatialmenu` navigates a grid of items by geometry rather than by index.
Its documented knobs:

- `toleranceCol` (default 16px) — "the maximum distance the centerX of an item
  can be in relation to the highlighted item to be considered as being on the
  same column".
- `toleranceRow` (default 16px) — the same for `centerY` and rows.
- `crossAxis` (default true) — "arrow keys will navigate cross-axis as well, if
  no item is available on the current axis".
- `wrap` (default false), `scrollBehavior` (default `smooth`).

What we took: the tolerance idea, and the cross-axis fallback. `grid-walk.ts`
resolves a direction in three passes, each claiming less than the last:

1. **Aligned.** Boxes whose centre is within `TOLERANCE_PX` (16, Melt's number)
   of this one on the cross axis are in the same column (for up/down) or the same
   row (for left/right). The nearest one wins. This is what makes `ArrowDown` in
   a three-column gallery land on the card *below*, three places further on in
   document order.
2. **Nearest.** Nothing lines up, so the nearest box anywhere on that side wins,
   scored on squared distance. This carries a gallery whose last visual row is
   short, and it is Melt's `crossAxis` in a different shape.
3. **Written order.** Every centre is identical — a document that has not been
   laid out, or a server render being read back — so the row written before or
   after this one is the answer, and `wrap` decides what happens at the ends.

Why this matters beyond elegance: **it removes React Aria's `layout: 'grid' |
'stack'` prop.** A one-column stack and a wrapping gallery are the same
arithmetic once the engine measures. `layout` is an enum prop that forks the
component, which the naming spec does not allow, and the geometry already knows
the answer. In a one-column list the aligned pass finds the row above and below
exactly as an index walk would, and `ArrowLeft`/`ArrowRight` fall through to
written order, which is the same thing a single column means.

Not taken: `scrollBehavior`. Scrolling a focused element into view is the
browser's own job on `focus()`, and a family that overrides it is fighting the
consumer's CSS. `toleranceCol`/`toleranceRow` are not props either — one constant
serves both axes, and no use case has been produced that needs them apart.

Melt documents no ARIA for `spatialmenu`, which is why it contributed the engine
and nothing else. That is the naming spec's rule working as intended: reference
libraries contribute behaviour, not names.

## ARIA rendered

On the grid (`gridlist.root` renders it one component deeper, because a widget
root cannot read its own instance token for an IDREF):

- `role="grid"`, `tabindex="0"` until focus lands on a row.
- `aria-labelledby` pointing at `gridlist.label`.
- `aria-multiselectable="true"` only when several rows may be picked. Absent
  otherwise rather than `"false"`.
- `aria-disabled`.

On a row (`gridlist.item`):

- `role="row"`, `tabindex="-1"`, roved to `"0"` on the row that has focus.
- `aria-selected` **only while the list is selectable at all**. A row reporting
  `aria-selected="false"` in a list with no selection has said something untrue,
  and every reader would announce it.
- `aria-disabled`.

On the cell (`gridlist.itemcontent`): `role="gridcell"`.

Not rendered, deliberately:

- `aria-rowcount` / `aria-colcount` / `aria-rowindex` / `aria-colindex`. The APG
  wants these when the DOM does not hold every row — a virtualized grid. Ours
  does, so the browser computes them. `table` will need them the moment it grows
  a windowing story; that is the right place for the decision.
- `aria-readonly`. It means "the cells cannot be edited", and no cell here is
  editable.
- A real checkbox in the row. React Aria ships `<Checkbox slot="selection">`.
  Ours is `gridlist.itemindicator`, `aria-hidden="true"`: the row already carries
  `aria-selected`, and a checkbox beside it announces the same fact a second
  time. A consumer who wants a real checkbox writes one; it will be a control the
  row holds like any other.

## API shape, and the mapping from React Aria

The naming spec's rules did most of the work here: booleans over enums, no
mode/role/type props, `onChange` as the primary callback, `ui-*` for state.

| React Aria | Here | Why |
| --- | --- | --- |
| `selectionMode="none" \| "single" \| "multiple"` | `selectable`, `multiple` | An enum that forks the component. `multiple` alone implies `selectable`, so no pair of props can contradict each other. |
| `selectionBehavior="toggle" \| "replace"` | — | Picking always toggles. `replace` is the desktop-file-manager convention that a plain click clears the rest, which is what `Escape` and a fresh `Space` already do here. |
| `layout="grid" \| "stack"` | — | The engine measures; see above. |
| `keyboardNavigationBehavior="arrow" \| "tab"` | — | `Enter`/`Escape` is the APG's one model; see above. |
| `disabledBehavior="all" \| "selection"` | — | A disabled row is out of the walk and cannot be picked. The other half of that enum ("focusable but not selectable") has no use case in a list of rich items. |
| `escapeKeyBehavior="clearSelection" \| "none"` | — | Kept as the only behaviour, disambiguated by focus. |
| `selectedKeys` / `defaultSelectedKeys` (`'all' \| Iterable<Key>`) | `value: readonly string[]` | One shape, and the same shape `taglist` ships. `'all'` as a magic value is a second shape for one saving. |
| `onSelectionChange` | `onChange` | The house grammar. |
| `onAction(key)` | — | The consumer's own `onClick`/`onKeydown` on `gridlist.item` already reaches them through the spread, and inventing a second event name is not worth it. Revisit if `table` needs one. |
| `disabledKeys` | `disabled` on the row | The row already exists in the markup; a parallel key list is a second source of truth. |
| `disallowEmptySelection` | — | No use case yet. Cheap to add. |
| `disallowTypeAhead` | — | Typeahead is on. Turning it off is a prop nobody has asked for. |
| `textValue` | `gridlist.itemlabel` | The part the typeahead reads, which is markup the consumer already writes. Falls back to everything the row reads. |
| `items` / `renderEmptyState` / `dragAndDropHooks` | — | Rendering is the consumer's loop; drag and drop is out of charter. |
| `data-selected`, `data-disabled`, `data-layout` | `ui-selected`, `ui-disabled`, `ui-selectable`, `ui-multiple`, `ui-inside` | House spelling. Presence attributes, no `data-*` state. |

Row identity is `value: string` on `gridlist.item`, and the row carries it in the
markup as `ui-value` — the same channel `taglist` uses, and the only way an
element a handle hands back can tell the family which row it is. No index prop:
the roster is the position, which is the naming spec's rule.

## Selection arithmetic

`grid-select.ts` is four pure functions over `readonly string[]`. Two notes worth
keeping:

- Single selection is not a second code path. It is `toggled(...)` held to one
  entry. Picking the row already picked lets it go in both cases.
- A `Shift` walk **replaces** the run measured from its anchor rather than
  growing one. A walk that only grew could never shrink back towards the anchor,
  which is the behaviour every file browser has and the thing a person notices
  first when it is missing.

## Typeahead

`tree`'s model, moved off the DOM and into the family's own cells: a buffer and a
clock reading, aged by comparing timestamps rather than by a timer, so a page
that resumes has nothing outstanding. 750ms window, matched against
`gridlist.itemlabel` where a row has one. A single letter starts the walk *after*
the row under focus, so pressing it again steps through the rows that share it; a
grown buffer starts *on* that row, so the search that just matched it still does.

## What a reader actually said

Measured, not predicted — the virtual reader's own transcript for the disabled
starter, which is why `gridlist.sr.ts` marks its `virtual` words as observed:

```
grid, Files, disabled
row, README.md Rename, disabled, not selected
gridcell, README.md Rename
README.md
button, Rename, disabled
end of row, README.md Rename, disabled, not selected
row, LICENSE, disabled, not selected
```

Two things this settles. The grid/row/gridcell nesting reads as the pattern
intends, and a control the row holds is announced as a button in its own right
rather than swallowed. And a row's accessible name is **everything it reads** —
the row holding a Rename button is announced as "README.md Rename", not
"README.md". That is correct ARIA and worth knowing before writing a row
assertion: the sr suite asserts against a row with only a label for that reason.

## A compiler constraint this build hit

`MARKLESS_SYNC_POLICY_UNEXTRACTABLE`, at the cost of one round trip. A
`preventDefault` guard joining a list of key comparisons to a graph-state read in
one condition —

```ts
if ((event.key === 'ArrowDown' || … || event.key === ' ') && gridlist.inside !== true)
```

— cannot be extracted, even though each half is extractable alone (`tree` ships
the bare key list, `taglist` ships a single key joined to a state read). Split
into two statements it compiles. The behavioural consequence was taken rather
than worked around: the arrows are now cancelled whether or not focus is inside a
row, which costs nothing on a button and is a further reason the widget walk
manages buttons only.

## Gaps this build knowingly leaves

- `PageUp`/`PageDown`. They need a viewport height and a scroll container the
  family does not own. Real work, and it belongs with whatever brings
  virtualization.
- The widget walk only knows the controls written as `gridlist.itemtrigger`. A
  bare `<button>` dropped into a row is still reachable with `Tab`, but `Enter`
  on the row will not find it. The family cannot query the DOM for focusable
  descendants — the DOM-access rule forbids it, and for good reason — so what it
  manages is what it binds.
- No drag and drop, no virtualization, no empty state.
- Not registered: the gallery, manifest, conformance and chaos lanes do not know
  this family yet, and `gridlist-transcript.ts` carries a literal `'/#gridlist'`
  where every registered family reads `FAMILY_ANCHORS`.
