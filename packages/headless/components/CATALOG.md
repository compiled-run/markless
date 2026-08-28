# @markless/ui — component catalog decisions

Owner rulings from the 2026-08-28 catalog review (Ark UI, React Aria, Bits UI, Melt UI survey).
Complements SPEC.md: SPEC.md governs how families are built; this file records which families
exist, their names, and the scope fences decided before any charter runs.

The admission test used throughout: a family earns its place by owning a real state machine plus
focus management, a keyboard protocol, or ARIA semantics that app developers reliably get wrong.
Pure CSS, pure logic, and visual skins do not qualify.

## Naming scheme

- `-list` — selectable collections of discrete items (taglist, gridlist).
- `-box` — textbox-lineage editing surfaces (tokenbox, datebox, timebox).
- Bare nouns where HTML/ARIA already owns the word (table, menu, modal).
- Behavior names belong to families; use-case names belong to docs recipes (see tokenbox).
- `toggle` is this library's switch: `switch` is a JS reserved word and cannot be an export name.
  Consequence (owner, 2026-08-28): the pressed-buttons group is `buttongroup`, never `togglegroup` —
  "group of toggles" would falsely read as a group of switches. The radio-group item-symmetry
  rule yields to the reserved-word substitution.
- Rejected patterns: visual-skin names (chips, cards, gallery), single-use-case names (prompt),
  names colliding with framework vocabulary (bare `grid` = CSS Grid; `tags-input` was renamed
  because "tag" means element in a markup framework — "taglist" reads as its own noun).

## Separator ruling (owner, 2026-08-28)

A display separator belongs to base: `base.separator`, static `role="separator"` (or decorative),
no focus, no machinery — not yet built (base has button/label/visually-hidden today; add it with
a registration pass). The resizable family's divider is NOT a reuse of it: ARIA gives
`role="separator"` two natures — non-focusable is structure, focusable is the window-splitter
widget with value semantics — and the interactive one is family-owned machinery that only shares
the role string (the modal-content/role=dialog precedent). Never compose interactive machinery
onto a base display part.

## Active queue (build in this order)

### 1. taglist (core catalog)

Chip list of committed `string[]` values, with an optional input part that turns the static row
into a tokenizing field — one family covers both the display-only filter-chip row and the full
tags input. Renamed from the ecosystem's "tags input"; also chosen over `tokens`/`tokenfield`
(the design-token collision in a headless library's theming docs is worse than the HTML-tag one,
and "tags" wins discoverability).

Family shape: `taglist.root` > `taglist.item` (+ item delete/edit parts), `taglist.input` optional.

Why it survived: split focus model (DOM focus stays in the input while a highlighted tag is
tracked activedescendant-style), caret-position-aware navigation (Left/Backspace at caret 0 walks
into the tag list), paste-splitting/dedupe/max-count pipeline, per-item inline edit.

Charter notes:
- No canonical WAI-ARIA pattern exists; libraries genuinely diverge (grid vs listbox vs plain
  buttons). The semantics choice is a real owner decision — full research pass required.
- Decide the relationship to a future multi-select combobox up front; chips-in-combobox should
  share the highlight/delete mechanics.
- The per-item edit mode is the editable family's machinery (see editable).
- Good stress test for the keyed-reconcile follow-up queue.

### 2. rating (owner ruling 2026-08-28: renamed from rating-group)

Named `rating`, not `rating-group` and not `review`. `review` is a use-case name (a review is
stars plus author and text; the docs recipe owns that word — the prompt/tokenbox precedent).
`-group` described the implementation (radiogroup semantics under the hood), not the concept: the
root owns its items, so unlike radio-group the consumer never composes independent parts into a
group. Half the ecosystem already says just Rating (MUI, PrimeVue, Ant's Rate); RatingGroup is
the Ark/Zag spelling.

Standalone family with radiogroup semantics under the hood — explicitly NOT an extension of the
radio family, which it breaks in three places: transient preview state (hover highlights a value
that isn't committed), cumulative fill (item highlighted when index ≤ value, not per-item checked),
and half values (fractional pointer math inside an item; a radio can't be half-checked). Needs a
first-class read-only mode — most rendered ratings are display-only aggregates.

Small, well-bounded, common in real apps; exercises machinery no existing family does.

### 3. editable

Inline rename (list titles, file names): preview ↔ edit mode machine with activation variants
(click, double-click, focus), Enter commits / Esc restores previous value / configurable
submit-on-blur, and focus that lands in the input on activation and returns on commit without a
frame gap.

Reassess after taglist lands: its item-edit mode is the same machinery, so editable may reduce to
a recomposition rather than a from-scratch family.

## Parked charters (in the catalog; each needs a prerequisite or an up-front decision)

### gridlist, then table (collection lineage)

Prerequisite: a listbox/select foundation. Gridlist is structurally listbox + 2D spatial
navigation + interactive children in rows (`role="grid"`); building it first without listbox
means building listbox implicitly, unnamed.

Gridlist and table are SEPARATE families sharing one internal grid-navigation/selection engine —
build order, not identity. Gridlist is "a list of rich items" (card gallery, file browser; one
logical column; the author thinks in items). Table is tabular data (columns are load-bearing:
header association, aria-colcount, per-column sort; the author thinks in rows and columns).
Merging would force gallery authors through table-shaped parts or vice versa. React Aria keeps
them separate for the same reason.

Name notes: `gridlist` over bare `grid` (CSS Grid collision; also reserves the name a future
spreadsheet-style data grid would want), over `gallery`/`cardlist` (use-case/visual names).
`table` is a bare noun because HTML owns it.

Table scope fence (decided now, before any charter):
- IN: the widget layer — grid role, 2D navigation, selection, header semantics, `aria-sort` and
  the header sort-toggle protocol. Phase-2 candidates at most: column resize, reorder, pinning.
- OUT: the data engine — sorting, filtering, grouping, pivoting, aggregation, virtualization.
  Data operations are the consumer's `computed()` (React Aria's sortDescriptor line). Anyone who
  needs the rest needs AG Grid / TanStack Table, and this library should not pretend otherwise.

Table owner requirements:
- Extensible by data-layer libraries: rows/columns/sort state flow as plain data in and plain
  callbacks out. Acceptance test: a TanStack Table row model can drive the family directly, no
  adapter layer. No proprietary collection-registration API a library couldn't feed.
- Intuitive: markup-first — parts shaped like the HTML table (thead/tbody/th/td analogs), and
  progressive: a bare table renders correctly with zero configuration; selection and sortable
  headers arrive by adding parts/attributes, never by restructuring.

References: https://react-aria.adobe.com/GridList · https://react-aria.adobe.com/Table ·
https://next.melt-ui.com/components/spatialmenu/ (WIP, no documented ARIA; its tolerance-based
spatial navigation over unaligned items is worth stealing for the nav engine).

### datebox / timebox (date/time cluster)

Time field parked as the beachhead of the cluster: it establishes segment machinery without
calendar complexity. Two decisions owed up front at charter time:

- Interaction model. Segmented spinbuttons (React Aria lineage — each segment
  `role="spinbutton"`, arrow increment, typed-digit auto-advance, locale-driven segment order)
  vs free-text parse input (Ark's date approach) vs column picker. Segments are the recommendation:
  the only model with a strong accessibility story that also beats `<input type="time">` on more
  than styling. Note the honest landscape: segments are ONE lineage (React Aria → Bits UI), not an
  ecosystem convergence — Ark/Zag ship no time component at all (verified: Zag's machines directory
  has date-picker only, a parse input + calendar).
- Intl vs library. React Aria/Bits stand on `@internationalized/date`. For time-of-day, platform
  `Intl.DateTimeFormat.formatToParts` likely suffices (segment order, 12/24h) and a plain
  time value dodges calendars and time zones. This choice determines what the eventual date
  cluster inherits.

Architecture ruling: shared INTERNAL segment engine (roving segment focus, auto-advance,
per-segment role assignment) with thin domain families on top — datebox, timebox, and a pin/OTP
input (same skeleton, textbox segments without increment semantics). Do NOT ship a generic public
`inputgroup` family: the hard 80% of a date/time field is the domain value model (locale segment
order, clamping — minutes 0–59, days depend on month — placeholder cycles, 12/24h), and a generic
family would hand exactly that back to the consumer. React Aria's own anatomy proves the split:
their Group is a dumb `role="group"` styling wrapper; the machinery lives in DateSegment and the
field hook.

References: https://react-aria.adobe.com/TimeField · https://www.bits-ui.com/docs/components/time-field ·
https://melt-ui.com/docs/builders/date-field (segments; time rides along via CalendarDateTime,
no separate time field).

### tokenbox

Contenteditable textbox with atomic inline tokens in flowing text: mentions (@), slash commands,
structured search queries, AI prompt fields. Value is an interleaved text-and-token sequence.
Gated on a real consumer (the moment a demo or the docs site wants a mention or prompt-composer
field) — it sits on contenteditable, the hardest widget substrate there is (selection/Range
management, IME composition, paste sanitization, undo, mobile keyboards), harder than the entire
date/time cluster.

NOT a superset of taglist in practice, though it can imitate one: the value model inverts
(interleaved text+tokens vs `string[]`; free text is part of the value), the accessibility
contract differs (one textbox whose tokens are atomic characters vs a list with per-item focus
and real delete buttons), and every plain chip input would pay the contenteditable tax. React
Aria ships both TagGroup and TokenField side by side for this reason.

Name ruling: `tokenbox` stays (it IS a `role="textbox"`; `-box` is earned ARIA lineage; not
copying React Aria's "TokenField" avoids implying API parity). "Prompt" was considered and
rejected as the family name — it names one use case, `window.prompt()` has meant a blocking
dialog for thirty years, and it breaks the scheme. Instead, the flagship docs recipe is named the
"prompt field": use-case names belong to recipes, behavior names to families.

Sole reference implementation: https://react-aria.adobe.com/TokenField — study its
`findText`/DOM-range utilities for anchoring autocomplete popovers to in-text anchors (@, /).

## Cut (with the right home for each)

- **clipboard** — `navigator.clipboard.writeText` + a copied boolean + a timeout, dressed as
  anatomy. No focus/keyboard/positioning machinery; Radix, Base UI, and React Aria all skip it.
  If copy buttons proliferate in the docs site (code blocks, install commands), ship a small
  utility that owns the copied-state timeout and the aria-live announcement — not a family.
- **timer** — pure logic, no element anatomy: `state()` + `computed()` + `setInterval`. Right
  form is a docs example whose prose carries the two real landmines: drift correction (count from
  timestamps, never accumulate ticks; background tabs throttle) and sparse announcements
  (aria-live on a ticking display announces every second — actively harmful; announce at
  milestones).
- **marquee** — pure CSS: duplicated content + animation. The headless payload is two one-liners
  (`aria-hidden` on duplicates, `prefers-reduced-motion`). Pause-on-hover is
  `animation-play-state: paused` on `:hover`/`:focus-within`, no JS. Docs snippet at most; note
  WCAG 2.2.2 wants a real pause control if it runs > 5s.
- **floating-panel** — a miniature window manager (drag-by-titlebar, resize handles,
  minimize/maximize, stacking). Only Ark/Zag ship it. Out unless a concrete consumer appears:
  it is a different engine entirely (free pixel positioning from pointer deltas, not the anchor
  positioning the families are built on), keyboard drag/resize has no established pattern, and
  continuous pointer-drag writes are a reactivity stress case. If a consumer shows up, charter it
  as its own family with the pointer-drag engine as the explicit design problem.
