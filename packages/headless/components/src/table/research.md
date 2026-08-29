# table — research

Tabular data where the columns are load-bearing: header association, per-column
sort, and a person who navigates in two directions. Written before the build,
against the `CATALOG.md` "gridlist, then table" charter; the build follows it and
`note.md` will record what the compiler and runtime then force.

The charter's fence is the frame for everything below. **IN:** the widget layer —
grid semantics, 2D navigation, selection, header semantics, `aria-sort` and the
header sort-toggle protocol. **OUT:** the data engine — sorting, filtering,
grouping, pivoting, aggregation, virtualization. Every one of those is the
consumer's `computed()`. Two owner requirements hang off that: a TanStack Table
row model must drive the family with no adapter layer, and a bare table must
render correctly with zero configuration.

## 1. References read

Fetched 2026-08-29 unless noted.

- **React Aria Table** (`react-aria.adobe.com/Table`) — the charter's primary
  reference and the only tier-1 headless library that ships this family.
  Components: `Table`, `TableHeader`, `Column`, `TableBody`, `Row`, `Cell`,
  `TableFooter`, `ResizableTableContainer`, `ColumnResizer`, `TableLoadMoreItem`.
  Read alongside its source (`adobe/react-spectrum` on `main`):
  `react-aria/src/table/useTableColumnHeader.ts`, `useTableCell.ts`,
  `useTableRow.ts`, `react-aria/src/grid/useGridCell.ts`,
  `react-stately/src/table/useTableState.ts`, `react-aria/src/table/utils.ts`,
  and the `@adobe/react-spectrum` table tests. The source is quoted below where
  the docs are vaguer than the code.
- **React Aria GridList** (`react-aria.adobe.com/GridList`) — the sibling family,
  for the row-level focus model and the shared keyboard vocabulary.
- **TanStack Table v8/v9** — the acceptance test. Read from real consumer code
  rather than the docs site (several doc routes 404 today): the library's own
  `examples/react/with-tanstack-router/src/components/table.tsx` and
  `examples/preact/sorting/src/main.tsx`, plus `shadcn-ui/ui`
  `apps/v4/registry/new-york-v4/examples/data-table-demo.tsx`,
  `apache/airflow` `.../DataTable/TableList.tsx`, and `Stirling-Tools/Stirling-PDF`
  `.../core/ui/DataTable.tsx`. Row-model state shapes verified from
  `tanstack.com/table/latest/docs/framework/react/guide/table-state`.
- **WAI-ARIA APG** — the `grid` pattern (keyboard and roles) and the `table`
  pattern. The APG's table pattern says keyboard interaction is "Not applicable".
- **Adrian Roselli**, "Don't Turn a Table into an ARIA Grid Just for a Clickable
  Row" (2023) and "Be Careful Using 'Grid'" (2024). **Sarah Higley**, "Grids Part
  2: Semantics". Both are dissent against the charter's default and are quoted in
  §2 rather than buried.
- **QDS** `libs/components/src/table/` — research only, no implementation. Its
  sketched API is a data-engine table (`data`, `columns: ColumnDef[]`,
  `filterable`, `pagination`, `virtualScroll`, `onSort$`). That is precisely what
  this charter rules out, so QDS contributes its two open questions ("table
  pattern or grid pattern?", "should the root be the `table` element or a
  container div?") and nothing else. Both are answered below.
- **Checked and shipping nothing here:** Ark UI / Zag, Base UI, Radix, Melt UI,
  Kobalte, Ariakit, Headless UI, Corvu. React Aria is the *only* primitives-tier
  implementation. That is the same narrow evidence base `timebox` recorded, and
  it deserves the same plain statement: this family has one reference, not an
  ecosystem consensus.

## 2. The role question, which the experts do not agree with the charter about

The charter lists "grid role" as IN. The accessibility literature says the
opposite for the table this family is actually for, and the disagreement is
sharp enough to put in front of the owner.

Roselli, verbatim: "Don't use ARIA `grid` roles simply to make rows clickable in
a table, and Don't put click handlers on table rows (`<tr>`s) to make them
clickable." His alternative for row selection is a real checkbox per row, which
a person can toggle by clicking anywhere in the row through `<label>` and CSS,
with no script and no grid roles. In "Be Careful Using 'Grid'" he frames the grid
role as being for "rebuilding Excel" — a composite widget where individual cells
take focus — and notes twice that "you as the author must add all the
interactivity and focus management."

Higley: "The easiest way to create a grid is to use HTML table elements, and add
`role="grid"` to the top-level `<table>`." Her roles list is `table`/`grid`,
`row`, `rowgroup`, `columnheader`/`rowheader`, and `cell`/`gridcell`. Two
findings from her piece shape §4: "Screen readers are able to provide their
table and grid experience only if the software can parse the row and column
relationships" — DOM structure, not ARIA, carries the grid — and `aria-rowindex`
and `aria-colindex` "only affect announcements, not navigation behavior". She
marks `aria-selected` "use-at-your-own-risk".

React Aria is the counterweight: its Table sets `role="grid"` (and `treegrid`
when rows expand) unconditionally, and its tests assert
`aria-multiselectable="true"` on the grid in multiple-selection mode.

**Recommendation: make the role progressive, the same way the parts are.**

- A `table.root` with no selection and no cell navigation renders a plain
  `<table>` and writes **no role at all**. Native semantics; a sortable,
  read-only table stays a table, which is what both experts want and what
  matches the APG table pattern's "keyboard interaction: not applicable".
- The moment the family is actually managing focus and selection — the consumer
  passes `onChange`, or mounts `table.cell` parts as focus stops — the root
  writes `role="grid"`. Now the family owns the focus management the grid role
  obliges, so the role is honest.

**What shipped, 2026-08-29:** only the selection half. Mounting cells cannot make
the root a grid on this framework — a cell's render-time write never reaches the
root's already-rendered attribute, and an element handle cannot be read while
deriving — so a cells-only table navigates in two directions and writes no role.
The family note's "Known gaps" carries the measurement and what a framework
change would have to give.

This costs nothing at the API surface (there is no `role` prop; SPEC bans mode
enums anyway) and it is derived from what the consumer actually mounted, which is
the same rule the whole family runs on. It is recorded in §9 as an owner question
because the charter named the grid role outright.

**Unresolved:** whether a `<td>` inside a `<table role="grid">` maps to `gridcell`
automatically. HTML-AAM has conditional mappings for these elements but the
relevant sections did not come back in a fetch, so this note does not assert it.
React Aria sidesteps the question entirely by writing `role="gridcell"`,
`role="columnheader"` and `role="rowheader"` explicitly on the elements it
renders, regardless of the native tag. This family should do the same when it
goes to grid, and write nothing while it stays a table.

## 3. Parts: markup-first and progressive

The design test the charter sets is that a bare table renders correctly with zero
configuration, and that selection and sortable headers arrive by *adding* parts,
never by restructuring. That test rules out React Aria's shape before anything
else does.

React Aria needs `TableHeader`, `TableBody`, `Row` and `Cell` components because
it builds a **collection** by interpreting its own JSX — `TableCollection` in
`react-aria-components/src/Table.tsx` walks the children into `headerRows`,
`columns`, `rows` and `rowHeaderColumnKeys`. That interpretation *is* the
"proprietary collection-registration API a library couldn't feed" the charter
forbids. It is also why `TableHeader` takes a `columns` prop and `TableBody`
takes `items`: the collection has to be told the data.

This family registers through `element()` handles instead, so nothing has to be
told the shape. That has a pleasant consequence: **`<thead>`, `<tbody>`,
`<tfoot>`, the header `<tr>`, and `<caption>` need no parts at all.** They are
the consumer's own native elements, they already carry `rowgroup`, `row` and the
table's accessible name, and the family needs no state from them. Three or four
role questions evaporate.

### Recommended part set

| Part | Element | Role in SPEC's set? | What it owns |
| --- | --- | --- | --- |
| `table.root` | `<table>` | `root` ✅ | the widget's state home; label wiring; `role="grid"` and `aria-multiselectable` when §2's condition is met |
| `table.item` | `<tr>` in the body | `item` ✅ — "one unit of a repeated set" | one row: its `value` (identity), its selected state, its own cell roster, a row-level instance |
| `table.itemfield` | `<input type="checkbox">` | `itemfield` ✅ — SPEC lists it for select/combobox/radio-group | carries one row's selection into a form; optional |
| `table.cell` | `<td>` | ❌ **`cell` is a new role** | the 2D focus stop; `role="gridcell"` (or `rowheader`) when the root is a grid |
| `table.columntrigger` | `<th scope="col">` | ❌ **`column` is a new prefix**; `trigger` ✅ | a *sortable* header: `aria-sort`, the press that reports the toggle, `role="columnheader"` |

Everything else is the consumer's own markup. A non-sortable header is a plain
`<th scope="col">`; header association comes from `scope`, which is native and
which no library improves on.

### The progressive ladder, concretely

```tsx
// Rung 1 — zero configuration. No role, no focus management, no props.
<table.root>
  <caption>Files</caption>
  <thead><tr><th scope="col">Name</th><th scope="col">Size</th></tr></thead>
  <tbody>
    <table.item value="f1"><td>report.pdf</td><td>2.1 MB</td></table.item>
  </tbody>
</table.root>

// Rung 2 — sortable headers. One part swapped in; nothing restructured.
<thead><tr>
  <th scope="col">Name</th>
  <table.columntrigger value="size">Size</table.columntrigger>
</tr></thead>

// Rung 3 — selection. Two props on the root; the rows are unchanged.
<table.root value={picked} multiple onChange={setPicked}> … </table.root>

// Rung 4 — cell-level 2D navigation. td becomes table.cell; the root goes to grid.
<table.item value="f1">
  <table.cell rowheader>report.pdf</table.cell>
  <table.cell>2.1 MB</table.cell>
</table.item>
```

`rowheader` as a boolean presence prop on the cell renders `<th scope="row">`
with `role="rowheader"` and is what names the row for a reader. React Aria does
the same thing through `Column isRowHeader` and then labels the row with
`aria-labelledby` pointing at those cells (`getRowLabelledBy` in
`react-aria/src/table/utils.ts`: "A row is labelled by it's row headers"). A
boolean, not an enum, so it sits inside SPEC's capability rules.

### Selection has no `selectionMode`

React Aria takes `selectionMode: "single" | "multiple"`. SPEC bans mode enums.
This family derives it:

- No `onChange` and no `value` → no selection at all. That is rung 1.
- `value` / `onChange` present → single selection.
- `multiple` present → multiple, and the root writes `aria-multiselectable="true"`.

`value` is `readonly string[]` and `onChange` reports the whole new set, exactly
the `checklist` shape. A row's `value` is required and is its identity, because
position is never identity — the `checklist.item` and `resizable.item` ruling.

**Visible row checkboxes are the consumer's own `checkbox` family part**, placed
in the first cell and wired through a `table.itemstate` export (the
`tree.itemstate` / `toolbar.itemstate` precedent). That keeps one owner for the
selected set, and it is what Roselli asks for: a real checkbox per row rather
than a click handler on the `<tr>`.

## 4. ARIA, attribute by attribute

| Attribute | Where | When it applies here |
| --- | --- | --- |
| `role="grid"` | root | only under §2's condition; otherwise no role |
| `role="row"` | `table.item` | native from `<tr>`; written explicitly once the root is a grid |
| `role="gridcell"` / `rowheader` | `table.cell` | written explicitly once the root is a grid |
| `role="columnheader"` | `table.columntrigger` | always — React Aria writes it even on a `<th>` |
| `aria-multiselectable` | root | `"true"` in multiple selection. Verified in React Aria's own tests |
| `aria-selected` | `table.item` | on selected rows. Higley marks it "use-at-your-own-risk"; it is nonetheless the pattern's only way to say "selected" |
| `aria-sort` | `table.columntrigger` | see below |
| `aria-colcount` / `aria-rowcount` | root | **not shipped in v1** — see below |
| `aria-colindex` / `aria-rowindex` | cell / row | **not shipped in v1** — see below |
| `aria-label` / `aria-labelledby` | root | the consumer's, or a native `<caption>`, which needs no part |

### `aria-sort`, and the Android landmine

React Aria's `useTableColumnHeader.ts`, verbatim:

```ts
// aria-sort not supported in Android Talkback
if (node.props.allowsSorting && !isAndroid()) {
  ariaSort = isSortedColumn ? sortDirection : 'none';
}
```

Two things fall out and both are worth keeping:

1. **Every sortable column carries `aria-sort`**, `"none"` for the ones that are
   not currently sorted — not just the sorted one. A column that is not sortable
   carries nothing, which is exactly why a non-sortable header stays a plain
   `<th>` in §3 and needs no part.
2. React Aria *drops* the attribute on Android and moves the information into an
   `aria-describedby` string instead, because TalkBack does not support it. This
   family does **not** branch on the user agent — `timebox` recorded the same
   refusal for iOS VoiceOver spinbuttons, and `datebox` before it. The landmine
   is recorded here rather than coded around.

Only one column carries a non-`none` value at a time. The charter puts
multi-column sort in the data engine, so a sort descriptor here is one column,
not a list. ARIA's fourth value `other` is not shipped: no evidence any reader
does something useful with it.

### Why the counts and indexes are not shipped

`aria-rowcount`/`aria-colcount` exist to tell a reader that the DOM holds fewer
rows or columns than the dataset does. React Aria writes them **only when
virtualized** — `useGrid.ts` and `useGridList.ts` both guard with
`if (isVirtualized)`, and `useTableRow.ts` actively deletes `aria-rowindex` when
the table is not. React Spectrum's tests assert them because its TableView is
always virtualized.

Virtualization is out of charter, so every row is in the DOM and the counts would
say nothing the tree does not already say. Higley's finding seals it: the indexes
"only affect announcements, not navigation behavior".

There is also a hard framework conflict if a consumer paging server-side wants
them. `aria-rowindex` on page 3 needs an absolute row number, which the family
cannot derive — it knows render order, not the offset. Taking it as a prop is
banned: SPEC's recursion section says "a family never takes an index prop… a
consumer numbering its own parts by hand is a rename, a reorder or a loop away
from lying." So the honest v1 answer is no counts, no indexes, and the conflict
recorded as an open question (§9) rather than resolved by a prop that lies.

## 5. The sort protocol: state in, intent out

Sort state is plain data on the root. The toggle is a callback. There is no
sorting anywhere in the family.

```tsx
const [sort, setSort] = state({ column: 'size', direction: 'descending' });
const rows = computed(() => sortRows(data, sort));   // the consumer's, always

<table.root sort={sort} onSortChange={(column) => setSort(nextSort(sort, column))}>
  …
  <table.columntrigger value="size">Size</table.columntrigger>
```

`sort` is `{ column: string; direction: 'ascending' | 'descending' } | undefined`
— ARIA's own words, not `'asc'`/`'desc'`. `undefined` means nothing is sorted,
and every sortable header then reads `aria-sort="none"`.

### The callback reports the column, not the next descriptor

This is the one genuinely contested design choice here, and the references
disagree with each other:

- **React Aria toggles two ways.** `useTableState.ts`: if the pressed column is
  already the sorted one, flip to `OPPOSITE_SORT_DIRECTION`; otherwise
  `'ascending'`. There is no way back to unsorted.
- **TanStack toggles three ways** and makes it configurable —
  `column.getNextSortingOrder()` exists precisely because the answer depends on
  `enableSortingRemoval` and `sortDescFirst`, and consumers render its result as
  a tooltip ("Sort ascending" / "Sort descending" / "Clear sort"; see the
  library's own `examples/preact/sorting/src/main.tsx`).

A family that computes the next direction itself picks one policy and then fights
the other. So it computes nothing: `onSortChange(column: string)` says *this
column's header was activated*, and the consumer's own `nextSort` decides what
that means. A TanStack consumer wires it to
`header.column.getToggleSortingHandler()` and the disagreement never arises. A
consumer with no data library writes three lines, which is the same line the
charter already draws around `computed()`.

Cost, stated plainly: that three-line toggle becomes boilerplate every plain
consumer writes. The alternative — ship React Aria's two-state toggle and let
TanStack consumers ignore the computed direction — is recorded as the fallback in
§9.

The press lives on the `<th>` itself, not on a nested `<button>`. React Aria does
this (`usePress` on the column header element, `onPress: () => state.sort(node.key)`)
and it is why `aria-sort` and the activation sit on one element rather than split
across two. Enter and Space activate, because `usePress` handles both; the family
reproduces that directly rather than relying on a button's native behaviour.

## 6. The TanStack acceptance test, mapped

The requirement is that a TanStack row model drives the family with no adapter.
Here is the mapping, against the render shape the library's own examples and the
shadcn data table actually use.

| TanStack | This family | Note |
| --- | --- | --- |
| `table.getHeaderGroups()` → `headerGroup.headers` | the consumer's own `<thead><tr>` loop | no part needed |
| `header.id` | the loop key | framework-side row identity, not a family prop |
| `header.column.id` | `table.columntrigger` `value` | |
| `header.column.getCanSort()` | choose `table.columntrigger` or a plain `<th>` | sortability *is* which element you render — that is rung 2 |
| `header.column.getIsSorted()` → `'asc' \| 'desc' \| false` | the root's `sort` prop | one descriptor, so a small map: `false → undefined` |
| `header.column.getToggleSortingHandler()` | `onSortChange` | direct — §5 is why |
| `header.colSpan` | the native `colSpan` attribute | passes through `{...rest}` |
| `header.isPlaceholder` | the consumer's `@if` | grouped headers are the consumer's markup |
| `table.getRowModel().rows` | the consumer's own `<tbody>` loop | |
| `row.id` | `table.item` `value` | |
| `row.getIsSelected()` | the root's `value` array | `RowSelectionState` is `Record<string, boolean>`; one `Object.keys(...).filter(...)` |
| `row.getToggleSelectedHandler()` | `onChange` | the family reports the whole new set |
| `row.getVisibleCells()` | the consumer's own cell loop | column visibility is the data engine's |
| `cell.column.columnDef.cell` + `flexRender` | the cell's children | |

```tsx
<table.root
  value={Object.keys(rowSelection).filter((id) => rowSelection[id])}
  multiple
  onChange={(picked) => setRowSelection(Object.fromEntries(picked.map((id) => [id, true])))}
  sort={sortedColumn(table)}
  onSortChange={(column) => table.getColumn(column)?.toggleSorting()}
>
  <thead>
    @for (const group of table.getHeaderGroups()) {
      <tr>
        @for (const header of group.headers) {
          @if (header.column.getCanSort()) {
            <table.columntrigger value={header.column.id} colSpan={header.colSpan}>…</table.columntrigger>
          } @else {
            <th scope="col" colSpan={header.colSpan}>…</th>
          }
        }
      </tr>
    }
  </thead>
  <tbody>
    @for (const row of table.getRowModel().rows) {
      <table.item value={row.id}>
        @for (const cell of row.getVisibleCells()) { <table.cell>…</table.cell> }
      </table.item>
    }
  </tbody>
</table.root>
```

Two shape mismatches, both one expression wide and both deliberate: TanStack's
`RowSelectionState` is a record where this family's `value` is an array (the
`checklist` shape, which every other selecting family here already uses), and
TanStack's `SortingState` is an array (multi-sort) where this family's `sort` is
one descriptor (multi-sort is data-engine work). Neither needs an adapter layer —
they need `Object.keys` and `[0]`.

## 7. Keyboard

The engine being built in `gridlist` right now is a 1D roster walker, and the
shipped families already contain most of its parts. What follows separates what
lifts from what this family adds.

### Already shipped, lifts unchanged

- **Document-ordered roster from a plural `element()` handle.**
  `toolbar/toolbar-walk.ts` `orderedRoster` sorts registered handles with
  `compareDocumentPosition` — a predicate over elements the family already holds,
  never a lookup. This is the only DOM-legal way to get order under SPEC's DOM
  access ban, and it is exactly what a row roster and a per-row cell roster need.
  The second axis falls straight out of it: a row-level instance binds its own
  `cellEls`, so a cell's column is its index in *its row's* roster, and nothing
  is ever told a coordinate.
- **The roving stop, written from the container's handlers.** `applyStops` /
  `stopIndex` in the same file. An element handle cannot be read while deriving
  (`MARKLESS_ELEMENT_HANDLE_UNBOUND`), so no cell can render its own `tabindex`;
  the container writes them. Cold — before any handler has run — the container
  itself carries the page's single tab stop and hands focus on at `focusin`.
- **The composition rule for interactive children**, and this is the important
  one. `toolbar.tsrx` reads `document.activeElement` after a key: if the child
  control already moved focus for itself, the container only records where the
  stop now sits. It asks nothing of the control — no shared flag, no stopped
  propagation. This is how a row's interactive children get walked **without**
  React Aria's `getFocusableTreeWalker`, which is a selector-based DOM walk and
  is banned in family source outright. Recorded here because it is the single
  place where React Aria's implementation cannot be copied.
- **Typeahead.** `tree.tsrx` keeps the buffer on the root element as
  `ui-typeahead` / `ui-typeahead-at` attributes aged by a clock read, so no timer
  is outstanding across resume; `menu/menu-walk.ts` owns `TYPEAHEAD_WINDOW = 750`,
  `itemWords` and `matchingItem`. A table's typeahead matches row text, which is
  the row-header cell — the same `itemWords` over a different element.

### Table-specific

| Key | Behaviour | Source |
| --- | --- | --- |
| Right / Left Arrow | one cell along the focused row's own cell roster | APG grid |
| Down / Up Arrow | same column index, next/previous row | APG grid |
| Home / End | first / last cell in the focused row | APG grid |
| Ctrl + Home / End | first cell of the first row / last cell of the last row | APG grid |
| Page Down / Up | an author-determined number of rows | APG grid |
| Enter / Space on a `columntrigger` | reports the sort toggle | React Aria `usePress` |
| Space on a cell | toggles that row's selection | APG's "Shift + Space selects the row", simplified because cells are not selectable here |
| Shift + Down / Up Arrow | extends the selected range by row | APG |
| Ctrl / Cmd + A | selects every row (multiple only) | APG |
| Escape | clears the selection | React Aria `escapeKeyBehavior` |
| a–z | typeahead over the row-header text | React Aria; `tree`'s implementation |
| Tab | leaves the table entirely — the roving stop means one stop | APG grid |

**Not shipped, with reasons.** Ctrl + Space "selects the column that contains the
focus": there is no column selection in this family, and no reference ships it.
Shift + Right/Left Arrow extending a selection across cells: cells are not
selectable, only rows are. React Aria's `keyboardNavigationBehavior="tab"` (Tab
walks in and out of cells instead of arrows) is a second whole navigation mode
selected by an enum prop, which SPEC bans; the toolbar composition rule already
covers the case it exists for — a text field inside a cell that wants its own
arrows takes the key and the container notices. React Aria's `focusMode`
(`'cell' | 'child'`, defaulting to `'child'` in arrow mode per `useGridCell.ts`)
is the same enum problem; v1 focuses the cell, and a cell whose child took focus
is recognised through `document.activeElement`.

**The frame-polling trap.** SPEC's Timing section is directly load-bearing here:
a sort or a page change replaces the rows, and the family must then focus a cell
in the new set. No `requestAnimationFrame` retry loop — the runtime commits the
write so `focus()` lands, and a family that cannot focus what it just rendered
files a witness against the runtime instead of retrying.

## 8. Divergences from the references, collected

| # | Divergence | Reason |
| --- | --- | --- |
| 1 | No `TableHeader` / `TableBody` / header-`Row` parts; `<thead>`, `<tbody>`, `<caption>` stay native | React Aria needs them to build a collection; handle registration needs nothing. This *is* the "no proprietary collection-registration API" requirement |
| 2 | `role="grid"` only when the family manages focus or selection | §2 — the accessibility literature is against an unconditional grid, and an unmanaged grid role is a promise the family would not be keeping |
| 3 | `onSortChange(column)`, not `onSortChange(descriptor)` | §5 — React Aria toggles two ways, TanStack three and configurably; computing the next direction picks a fight with one of them |
| 4 | `'ascending' \| 'descending'`, not `'asc' \| 'desc'` | ARIA's own words; `aria-sort` takes them verbatim |
| 5 | No `selectionMode` / `selectionBehavior` / `keyboardNavigationBehavior` / `focusMode` enums | SPEC bans mode enums. Selection is derived from `multiple` + `onChange`; the navigation modes are covered by the toolbar composition rule |
| 6 | `value` is `readonly string[]`; no `"all"` sentinel and no `Set` | the `checklist` shape, which every selecting family here shares. React Aria's `selectedKeys="all"` is a virtualization affordance |
| 7 | No `aria-rowcount` / `aria-colcount` / `aria-rowindex` / `aria-colindex` | §4 — they mean nothing without virtualization, and the index prop they would need is banned |
| 8 | No `getFocusableTreeWalker` equivalent | selector-based DOM walks are banned in family source; the toolbar rule replaces it |
| 9 | No `ColumnResizer` / `ResizableTableContainer` | charter phase-2 at most. When it arrives it is `resizable`'s `role="separator"` machinery, not a new one |
| 10 | No `TableLoadMoreItem`, no `renderEmptyState` | an empty `<tbody>` and the consumer's own `@if` |
| 11 | No `disabledKeys` in v1 | `aria-disabled` on the row is the consumer's; nothing in the keyboard protocol needs the family to know |
| 12 | Nothing from QDS's sketch (`data`, `columns`, `filterable`, `pagination`) | it is a data-engine table; the charter rules that out |

## 9. Open questions for the owner

Four, in the order they block the build.

**1. `cell` as a new component role.** `table.cell` has no home in SPEC's
established set — the row is `item`, and a cell is not `content` ("the surface a
trigger reveals"), `label`, or `field`. Applying SPEC's three-use-case bar
honestly: table cells and gridlist cells (the sibling being built now) are two;
a future treegrid would be three; `calendar.item` deliberately is *not* one,
since calendar ships day buttons rather than grid cells and says so in its
source. So `cell` stands at two uses today, not three. Two ways out: mint it
anyway on the strength of the two families that will both ship it, or drop
cell-level focus from v1 and navigate at row level (React Aria's own GridList
model — arrows between rows, plus the toolbar composition rule inside a row),
which needs no new role at all and no `table.cell` part. The charter says "2D
navigation", which points at minting it. **Recommendation: mint `cell`.** This is
a blocking question: the part cannot be built under either name without a ruling.

**2. `column` as a new semantic prefix**, for `table.columntrigger`. A smaller
ask than a role: prefixes carry information, not behaviour, and
`carousel.navtrigger` and `carousel.playtrigger` are the precedent for
prefix-plus-`trigger`. Alternatives considered: `table.columnlabel` (accurate
about what a `<th>` is, wrong about it carrying a press) and naming the part
after its ARIA role, `table.columnheader` — which `resizable.thumb` wearing
`role="separator"` is the standing argument against. **Recommendation:
`columntrigger`.**

**3. Does the role stay progressive (§2)?** The charter named the grid role as
IN. The research says an unconditional grid role on a sortable read-only table is
what the two most-cited experts on this exact widget tell people not to do, and
that the role is honest only once the family is doing the focus management it
obliges. The progressive answer gives the charter its grid and gives rung 1 a
plain table. **Recommendation: progressive.** Not build-blocking — the
unconditional grid is one line different — but it should be ruled before the
browser rows are written, because the assertions differ.

**4. Server-side paging and `aria-rowindex`.** A consumer paging on the server
has a real need for `aria-rowcount` and per-row `aria-rowindex`, and this family
structurally cannot supply a row's absolute number: it knows render order, and
SPEC forbids taking an index prop. **Recommendation: ship neither in v1** and
revisit if a consumer appears — most likely as a single `firstrow` offset on the
root, which the family adds to its own render order and which cannot lie about
one row without lying about all of them. Recorded now so the gap is a decision
rather than an oversight.

Also owed, but not blocking: whether `onSortChange` reports the column (§5,
recommended) or a computed next descriptor (React Aria's shape, cheaper for a
consumer with no data library).

## 10. Known gaps, recorded not resolved

- Column resize, reorder and pinning are charter phase-2 candidates and are not
  designed here beyond §8 note 9.
- No drag-and-drop row reordering. React Aria ships `dragAndDropHooks`; nothing
  in the charter asks for it and it is a separate engine.
- No expandable rows and no `role="treegrid"`. `tree` owns disclosure machinery;
  a treegrid is a third family in this lineage, not a flag on this one.
- Multi-column sort is data-engine work, so `sort` is one descriptor. A consumer
  who needs it keeps their own array and passes the primary column in.
- No select-all part. `checklist.selectall` exists, but reusing it would put two
  families in charge of one selected set; the consumer's own checkbox wired to
  `onChange` with every row value is the v1 answer.
- `aria-sort` is dropped by Android TalkBack (§4). Not coded around, following
  `datebox` and `timebox` on user-agent branching.
- The HTML-AAM `<td>` → `gridcell` mapping question in §2 is unresolved; writing
  the roles explicitly makes it moot rather than answering it.
- The 2D engine is expected to be lifted from `gridlist`, which is being built in
  parallel with this note, so its actual shape could not be read here. §7
  describes what the *shipped* families already contain and what the table adds;
  the build unit should re-check the lifted engine's real surface before
  duplicating anything.
