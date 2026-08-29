# table

Tabular data where the columns are load-bearing: header association, per-column
sort, and a person who navigates in two directions. `gridlist` is the sibling for
a list of rich items, and this family lifts its engine.

Research: `./research.md` — React Aria Table read in full alongside its source,
the WAI-ARIA APG grid and table patterns, and Roselli and Higley on when a table
should not be a grid. The research note is the pre-build record; where the owner
ruled against its recommendation, this note is what shipped.

## Parts

`root` `item` `rowcontent` `coltrigger` `rowfield`

The owner's ruling of 2026-08-29 closed the research note's naming questions, and
it went the other way from the recommendation there. There is **no new `cell`
role**: a cell is `content` wearing a `row` prefix, so the part the research
called `table.cell` is `table.rowcontent`, and the part it called
`table.columntrigger` is `table.coltrigger`. `row` and `col` are the new
prefixes, both recorded in `SPEC.md`.

`root` is the `<table>` and the home of what is picked and what is sorted.

`item` is one body `<tr>`, carrying the row's own `value`. It keeps the bare role
name because the row *is* the repeated unit — the prefixes are for parts scoped
to a row or a column, not for the row itself.

`rowcontent` is one cell and the thing focus rests on. `rowheader` on it renders
`<th>` with `role="rowheader"` instead of `<td>`: that is the cell that names the
row for a reader.

`coltrigger` is a sortable `<th>` — `aria-sort`, `role="columnheader"`, and the
press, all on one element rather than split across a nested button, which is what
React Aria's `usePress`-on-the-header does and why the two facts stay together.

`rowfield` is a hidden checkbox carrying one row's picked state into a form. It
is `aria-hidden` and out of the tab order because the row already carries
`aria-selected`.

**`<thead>`, `<tbody>`, `<tfoot>`, the header `<tr>`, `<caption>` and every
non-sortable `<th>` need no parts at all.** They are the consumer's own elements,
they already carry `rowgroup`, `row` and the table's name, and the family needs
nothing from them. That is the whole reason there is no collection-registration
API here: the family registers through `element()` handles, so nothing has to be
told the shape of the data.

## The role is earned, not declared

The charter listed the grid role as IN and the accessibility literature says the
opposite for a sortable read-only table. The owner ruled progressive, so:

- A bare `table.root` writes **no role at all**, no tab stop and no ARIA. It is a
  plain HTML table, and `table.browser.ts` pins that with a row that asserts the
  absence.
- Swapping one `<th>` for a `coltrigger` still writes no role: sorting is not
  focus management.
- Passing `value`/`onChange`/`multiple`, or mounting `rowcontent` cells, makes
  the root `role="grid"` — and from there the family writes `row`, `gridcell` and
  `rowheader` explicitly rather than trusting the native mapping, which is React
  Aria's approach and sidesteps the unresolved HTML-AAM question in the research.

Mounting a cell is a graph write the cell part makes as it renders (`celled`),
which is how the root's role follows from what the consumer actually wrote
without a prop that announces it. A `sortable` cell is written the same way, and
only so the space bar knows whether to cancel the page scroll.

## Selection has no mode

Rows become selectable when the consumer has somewhere to put the picked set:
`value` written at all, or `onChange`, or `multiple`. There is no `selectable`
prop — this is a deliberate divergence from `gridlist`, which has one, and it is
the owner's ruling. `value` is `readonly string[]` and each row carries its own
`value` string, the shape every selecting family here shares.

`Space` picks the row the focused cell sits in — a cell is never itself
selectable. A `Shift` walk replaces the run measured from its anchor rather than
growing one, so walking back towards the anchor shrinks what is picked.

## Sort: state in, intent out

`sort` is `{ column, direction: 'ascending' | 'descending' } | undefined` —
ARIA's own words, taken by `aria-sort` verbatim. Every sortable header carries
`aria-sort`, `"none"` for the ones not currently sorted; a column that carries
nothing is a column that cannot be sorted.

`onSortChange(column)` reports **which header was activated** and nothing else.
React Aria toggles two ways and TanStack three and configurably, so a family that
computed the next direction would pick a fight with one of them. The cost is
real and stated: a consumer with no data library writes a three-line `nextSort`.

## The engine

`grid-walk.ts`, `grid-select.ts` and `grid-typeahead.ts` are imported straight
out of `../gridlist/` rather than copied or relocated. They are plain functions
over plain values and registered handles with no graph in them, which is what
makes sharing them a move rather than a fork; they stay internal to the two
families and are exported from nothing. `table-walk.ts` adds only what the second
axis needs: the reachable cell roster, and the cell a vertical move lands on.

The move here is **ordinal**, not geometric: `gridlist` measures because a card
gallery wraps, and a table is laid out by the table algorithm, so the row after
this one is the row written after it and a cell's column is its place among its
own row's cells. Nothing is ever told a coordinate.

## Known gaps

- **The cells-only rung of the role ruling is not implemented, and cannot be as
  written.** The owner ruled the root becomes `role="grid"` when selection props
  are present *or* cells are mounted. The first half works. The second does not:
  a cell's render-time write to the widget's shared state (`celled`) never
  reaches the root's already-rendered attribute, in CSR or in SSR — the write is
  seeding, not an update, and there is no descendant-to-ancestor precedent in any
  shipped family. Reading the cell handle while deriving is
  `MARKLESS_ELEMENT_HANDLE_UNBOUND`, so the root cannot ask the roster either.
  Five rows in `table.browser.ts` are red against this and are left red on
  purpose: they pin the ruled behaviour, and they are the evidence for the owner
  decision this needs — either the role comes from selection props alone, or the
  framework grows a way for a root to see what its descendants mounted.
  Behaviour is unaffected: the handlers read `cellEls.length` instead of the
  flag, so the 2D walk, selection and typeahead all work on a cells-only table
  once focus is inside it.
- **`scope` cannot be written.** The JSX type service ships no table attributes
  at all — `scope`, `colspan`, `rowspan`, `headers` are all absent from
  `TagNameSpecificAttributes`, so `<th scope="col">` does not typecheck anywhere,
  in family source or in a consumer's own page. The family writes
  `role="columnheader"`/`role="rowheader"` outright and does not depend on it,
  but a consumer cannot write `scope` on their own plain headers today and
  `colspan` is unavailable to the row model the charter's acceptance test names.
  This is a framework gap owned by `packages/typescript-plugin`, not by this
  family, and it is the one thing here that needs a fix elsewhere.
- A loop cannot open directly inside a component tag, and a `<tr>` may hold
  nothing but cells to open one in — so a page with a variable column set has to
  put its cell loop one component deeper. `scenarios/row-model.tsrx` records the
  shape.
- A sortable header is an ordinary tab stop (`tabindex="0"`) rather than part of
  the roving walk, so a grid with N sortable columns has N+1 tab stops instead of
  the APG's one. The APG's single stop assumes the family owns every header cell;
  this family deliberately leaves non-sortable headers as the consumer's own
  markup, so it cannot walk a header row it only partly knows.
- Clicking anywhere in a row picks it when the table is selectable, and there is
  no `itemtrigger`-shaped part to carve an exception out for, so a control a
  consumer drops in a cell picks the row too. Roselli's objection to click
  handlers on `<tr>` is on the record; `rowfield` plus the consumer's own
  checkbox is the recommended shape.
- Typeahead matches everything a row reads rather than its row-header cell alone.
  Binding the header cell to a second handle would have meant two handles on one
  element, which is untried.
- No `aria-rowcount`/`aria-colcount`/`aria-rowindex`/`aria-colindex`. They mean
  nothing without virtualization, and the absolute row number a server-paged
  consumer would need cannot be derived from render order — SPEC bans the index
  prop that would supply it.
- No `PageUp`/`PageDown`: they need a viewport height and a scroll container this
  family does not own.
- No column resize, reorder or pinning; no drag-and-drop row reordering; no
  expandable rows and no `treegrid`; no select-all part; no `disabledKeys`.
- `aria-sort` is dropped by Android TalkBack. Not coded around, following
  `datebox` and `timebox` on user-agent branching.
- Not registered: the gallery, manifest, conformance and chaos lanes do not know
  this family yet, and `table-transcript.ts` carries a literal `'/#table'` where
  every registered family reads `FAMILY_ANCHORS`. Registration is a follow-up
  unit and swaps that literal.
