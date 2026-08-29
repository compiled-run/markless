# gridlist

A list of rich items — a card gallery, a file browser — where a row may hold
controls of its own. One logical column: the author thinks in items, not in rows
and columns. `table` is the sibling for tabular data, and it will lift this
family's engine.

Research: `./research.md` — React Aria GridList and the WAI-ARIA APG grid pattern
read in full, plus Melt's work-in-progress `spatialmenu` for the navigation
engine.

## Parts

`root` `label` `item` `itemcontent` `itemlabel` `itemtrigger` `itemindicator`

Every name is an established role with an established prefix, so nothing here is
an owner question.

`itemcontent` is `role="gridcell"`. It is not optional: ARIA gives a row no
meaning without a cell in it, and React Aria's examples carry the same wrapper
for the same reason. One column, because that is what a list of rich items is.

`itemtrigger` is a control the row holds — a rename button, an overflow menu. It
sits at `tabindex="-1"` because the row is the tab stop.

`itemindicator` is the picked mark, `aria-hidden="true"`. The row already carries
`aria-selected`; a checkbox beside it would announce the same fact twice. React
Aria ships a real `<Checkbox slot="selection">` here and this is a deliberate
divergence, recorded in the research note.

`root` renders the `role="grid"` element one component deeper, so `gridlist.label`
can name it: a widget root cannot read its own instance token, which is the
`timebox` precedent.

## Keyboard

Arrows move between rows. `Home`/`End` go to the ends. `Enter` or `F2` moves
focus onto the first control the row holds; the arrows then step between those
controls, and `Escape` brings focus back to the row. `Space` picks the focused
row, `Escape` on a row lets go of everything, `Control`/`Command`+`A` picks every
row of a list that takes several, and a `Shift` walk picks the run from the row it
started on. Printable keys are typeahead.

`Escape` means two things, and which one is decided by where focus is rather than
by a prop: inside a row's controls it restores grid navigation (the APG's
wording), on a row it clears the selection (React Aria's `escapeKeyBehavior`
default).

The one knowing divergence from React Aria: `ArrowLeft`/`ArrowRight` move between
rows rather than stepping the controls inside one. The APG allows exactly this
for a layout grid, a card gallery is two-dimensional and needs it, and it removes
React Aria's `keyboardNavigationBehavior` enum. `Tab` still steps the controls
natively once focus is inside a row. Full reasoning in the research note.

## The move is measured, not counted

`grid-walk.ts` resolves a direction by geometry: the neighbour upwards is the box
above this one in the same column, within a 16px tolerance — Melt's
`spatialmenu` idea and its number. Failing that, the nearest box on that side.
Failing that — every centre identical, which is what an unlaid-out document looks
like — the row written before or after.

This is what lets one list work stacked in one column and wrapped across a
gallery **with no layout prop**. React Aria takes `layout: 'grid' | 'stack'`;
that is an enum that forks the component, and the geometry already knows the
answer. In a single column the aligned pass finds the row above and below exactly
as an index walk would.

`wrap` is a boolean and defaults off, which is what a list of files behaves like.

## Selection

`value` is `readonly string[]` and each row carries its own `value` string — the
shape `taglist` ships, and the only channel from an element a handle hands back to
the family that names the row. `selectable` picks one row at a time; `multiple`
picks several and implies `selectable`, so no pair of props can contradict.

Single selection is not a second code path: it is the same toggle held to one
entry. A `Shift` walk replaces the run measured from its anchor rather than
growing one, so walking back towards the anchor shrinks what is picked.

## The engine

`grid-walk.ts`, `grid-select.ts` and `grid-typeahead.ts` are internal to this
family and exported from nothing. That is the owner's ruling of 2026-08-28: no
public listbox family, the engine stays inside family code and is liftable later
the way the date/time segment engine is. They are named `grid-*` rather than
`gridlist-*` because `table` is the one that lifts them, and they are plain
functions over plain values with no graph in them, which is what makes that a
move rather than a rewrite.

## Known gaps

- The arrows are cancelled on every keystroke, inside a row's controls as well as
  on a row. Harmless on a button, which is all the walk manages, but a bare text
  field dropped into a row would lose caret movement. The guard that would have
  narrowed it is `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`; the research note records
  the exact shape that fails.
- No `PageUp`/`PageDown`. They need a viewport height and a scroll container this
  family does not own; the work belongs with whatever brings virtualization.
- The widget walk only knows controls written as `gridlist.itemtrigger`. A bare
  `<button>` in a row is still reachable with `Tab`, but `Enter` on the row will
  not find it. The family binds handles rather than querying the DOM, so what it
  manages is what it binds.
- No `aria-rowcount`/`aria-colcount`: the DOM holds every row, so the browser
  computes them. `table` will owe the decision the moment it windows.
- No drag and drop, no virtualization, no empty state, no `onAction` callback.
- Not registered: the gallery, manifest, conformance and chaos lanes do not know
  this family yet, and `gridlist-transcript.ts` carries a literal `'/#gridlist'`
  where every registered family reads `FAMILY_ANCHORS`. Registration is a
  follow-up unit and swaps that literal.
