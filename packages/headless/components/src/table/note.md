# table

Tabular data where the columns are load-bearing: header association, per-column
sort, and a person who navigates in two directions. `gridlist` is the sibling for
a list of rich items, and this family lifts its engine.

Research: `./research.md` — React Aria Table read in full alongside its source,
the WAI-ARIA APG grid and table patterns, and Roselli and Higley on when a table
should not be a grid. The research note is the pre-build record; where the owner
ruled against its recommendation, this note is what shipped.

## Parts

`root` `item` `itemcontent` `coltrigger` `itemfield`

The owner's ruling of 2026-08-29 closed the research note's naming questions, and
it went the other way from the recommendation there. There is **no new `cell`
role**: a cell is `content` wearing a `row` prefix, so the part the research
called `table.cell` is `table.itemcontent`, and the part it called
`table.columntrigger` is `table.coltrigger`. `row` and `col` are the new
prefixes, both recorded in `SPEC.md`.

`root` is the `<table>` and the home of what is picked and what is sorted.

`item` is one body `<tr>`, carrying the row's own `value`. It keeps the bare role
name because the row *is* the repeated unit — the prefixes are for parts scoped
to a row or a column, not for the row itself.

`itemcontent` is one cell and the thing focus rests on. `rowheader` on it renders
`<th>` with `role="rowheader"` instead of `<td>`: that is the cell that names the
row for a reader.

`coltrigger` is a sortable `<th>` — `aria-sort`, `role="columnheader"`, and the
press, all on one element rather than split across a nested button, which is what
React Aria's `usePress`-on-the-header does and why the two facts stay together.

`itemfield` is a hidden checkbox carrying one row's picked state into a form. It
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
- Swapping one `<th>` for a `coltrigger` still writes no role on the root:
  sorting is not focus management. The header itself carries
  `role="columnheader"` — which is what a `<th>` in a `<thead>` already means, so
  it restates the native mapping rather than overriding it, and it keeps
  `aria-sort` on an element whose role is not left to a mapping question.
- Passing `value`, `onChange` or `multiple` makes the root `role="grid"` — and
  from there the family writes `row`, `gridcell` and `rowheader` explicitly
  rather than trusting the native mapping, which is React Aria's approach and
  sidesteps the unresolved HTML-AAM question in the research.
- Mounting `itemcontent` cells gives the table its second axis — the arrows walk
  cell by cell and column by column, `Home`/`End` reach the ends of a row and the
  corners of the table, and the space bar picks the row the focused cell sits in
  — but writes **no role**. The owner's ruling had cells earn the role too; the
  framework cannot do it, and "Known gaps" below is the record.

`gridcell` rides the same condition the root's role does because it is the one
role here that would be a lie on its own: `gridcell` is only meaningful inside a
grid, whereas `row`, `rowheader` and `columnheader` restate what the elements
already mean.

**The HTML-AAM question the research left open — does a `<td>` inside a
`role="grid"` map to `gridcell` on its own — is settled by measurement, and the
answer is yes.** `scenarios/prepicked.tsrx` is a selectable table whose cells are
the consumer's own plain `<td>`s with no `itemcontent` mounted, so the family
writes no cell role anywhere in it, and the virtual reader still announces
`gridcell, README.md` for each cell and reads every row with its name and its
picked state. So a selectable table is structurally valid without cell parts: the
grid's required-children chain holds on the native mapping, and writing the roles
explicitly is insurance against a reader that does not, not the thing keeping the
rows in the tree. The transcript is in `table.sr.ts`, "a row of a selectable
table conveys whether it is picked".

Nothing a descendant renders is a graph write any more. Every cell in
`TableInstanceState` is written by the root from its own props, which is the only
direction that reaches a rendered attribute.

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

- **A root cannot see what its descendants mounted, so a cells-only table has no
  role and no tab stop.** The owner ruled the root becomes `role="grid"` when
  selection props are present *or* cells are mounted; the second half is not
  implementable on this framework and was cut on 2026-08-29. Two mechanisms were
  measured and both refuse:
  - A cell's render-time write to the widget's shared state never reaches the
    root's already-rendered attribute, in CSR or in SSR. The write is seeding,
    not an update, and no shipped family has a descendant-to-ancestor precedent.
  - Reading the cell handle while deriving is `MARKLESS_ELEMENT_HANDLE_UNBOUND`,
    so the root cannot ask the roster instead. A *handler* may — which is why the
    same fact is available to the keyboard and to focusin and not to the role.

  What this costs, precisely: a table with `itemcontent` cells and no selection
  prop writes no `grid`, no `row`, no `gridcell` and no `rowheader`, and it is
  not in the tab order, so a person reaches it by clicking a cell rather than by
  tabbing to it. Everything else works — the 2D walk, roving focus, `Home`/`End`
  including the corners, and typeahead all read `cellEls.length` in the handler
  and are pinned green on the cells-only scenario. Passing any of
  `value`/`onChange`/`multiple` restores the whole ruling.

  To lift this, the framework needs one of: a shared-state write from a
  descendant that re-derives an ancestor's already-rendered attribute, or a
  bound-element handle that is readable inside `computed()`. Either would let the
  role come back from the roster with no change to the family's public API. The
  browser rows to restore are the two role assertions in "cells become focus
  stops without making the table a grid" and the tab-stop assertion in "a
  cells-only table has no tab stop".

- ~~**On the server path a `table.itemcontent` renders as an empty `<table>`.**~~
  **Fixed in the compiler.** The measurement was: `renderSSR(scenarios/cells.tsrx)`
  served the cell as the family's own `<table>` tag carrying the cell's props
  (`rowheader=""` among them, so the destructured prop had not even been
  consumed), with the cell's text left outside the row.

  The cause was one compiler predicate, not anything in this family.
  `TableItemContent` is the only part here whose body is nothing but an
  `@if`/`@else` over two other components, so it has markup but no element tag of
  its own. `sameModuleSsrComponentNames` in
  `packages/compiler/src/passes/public-render/same-module.ts` asked
  `firstComponentRoot`, which answers only for a body that opens with an element.
  A branch-only component therefore got no server render function and was
  published under no SSR export name, and the composing page's lookup fell back to
  the module's default component — the `<table>`. The fix asks
  `componentMarkupRoot` instead, which is the same root the semantic graph already
  uses to build the component's chunks, and is why CSR was always correct. Module
  root selection still uses `firstComponentRoot`: a page root really does need an
  element to be the container.

  The general witness is `packages/web/test/branch-only-component-ssr.test.ts` —
  two differently-shaped branch-only fixtures, server-rendered, plus the export
  name a cross-module placement resolves by. The three `table.browser.ts` rows
  that were pinned `test.fails` under SSR are unpinned and green.
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
  handlers on `<tr>` is on the record; `itemfield` plus the consumer's own
  checkbox is the recommended shape.
- Typeahead matches everything a row reads rather than its row-header cell alone.
  Binding the header cell to a second handle would have meant two handles on one
  element, which is untried. It costs less than it looks like it does: a row is
  named from its contents, so a reader announces the row under that same whole
  text ("row, README.md 4.1 kB"), and typeahead matches what was said.
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
