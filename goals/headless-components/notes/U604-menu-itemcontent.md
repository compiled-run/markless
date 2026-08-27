# menu: submenus are `menu.itemcontent`

The shipped shape, after the rewrite. `menu.itemtrigger` is gone; a submenu is
`menu.item` > `menu.itemcontent` > `menu.item`, recursive to any depth, with one
root and one `onChange`.

## What shipped

Two widget-scoped families in `menu.tsrx`, declared in that order so the seeding
rule puts the right root on each:

- `menuState`, rooted by `menu.root`: open/closed, activation, the checked set,
  the typeahead buffer, the context point, the callbacks, and the two plural
  rosters every walk is asked of - `itemEls` (every item, any depth) and
  `itemContentEls` (every submenu surface). `menu.content` is a part of this
  family only.
- `menuItemState`, rooted by **every** `menu.item`: that item's `expanded`, its
  `value`/`checkable`/`disabled`/`submenu`, its hover-intent timers, and its
  `itemEl` / `itemContentEl` handles. `menu.itemcontent` is a part of this
  family only. Tree's `treeItemState` precedent.

`menu.item` gains a boolean `submenu` prop (tree's `leaf` precedent): a
component cannot see its own children while it renders, and a served page needs
`aria-haspopup` and `aria-expanded` in its HTML before the `menu.itemcontent`
inside it exists. A nesting item keeps `role="menuitem"` and adds
`aria-haspopup="menu"`, `aria-expanded` and `aria-controls={item.itemContentEl}`;
the surface it opens is `role="menu"`, `aria-labelledby={item.itemEl}`, `hidden`
until open, `overlay`, `ui-side="end"`.

Each surface owns the keyboard walk over the items IT holds - "its own items"
being the item roster filtered to those whose deepest holding surface is that
surface. Roving tabindex, Home/End and typeahead are per surface; the typeahead
buffer itself is the menu's, so one window serves whichever surface is typed at.

## The four framework witnesses, verified before relying on them

Run on this tip: 3 files, 32 tests, all green.

- `packages/vitest-browser/browser/nested-widget-outer-write` - a component
  rooting one widget-scoped family stays an ordinary part of every enclosing
  family, and its writes land in that enclosing instance, CSR and SSR.
- `packages/vitest-browser/browser/handler-instance-handle` - a handler reads its
  own instance's singular `element()` handle at any depth. This is the exact wall
  the held attempt (`worktree-agent-a1d3e22c43cf7f04a`) reported as fatal; it is
  closed.
- `packages/vitest-browser/browser/root-idref` - a widget root's own element
  carries an IDREF to a part it seeds and is named back by it, with a third
  instance rooted inside the first one's panel.
- The seeding rule is stated and exercised in
  `nested-widget-outer-write/nested.tsrx`: the widget root is the FIRST component
  in the module that seeds the factory. `MenuRoot` is declared before `MenuItem`,
  and `MenuItem` never seeds `menuState`.

## Event bubbling: where each gesture is stopped

A gesture inside a submenu bubbles through every item and surface above it. Two
locks, in this order:

1. **Guards.** An item handler returns early when `item.itemContentEl` contains
   `event.target` - that event belongs to a deeper item. A surface handler
   returns early unless it is the deepest bound surface holding `event.target`.
   The guards alone are sufficient: with them, a deep gesture reaching an
   ancestor is a no-op.
2. **`stopPropagation()`.** The surface that answered a key stops it; the item
   that answered a click stops it. So a click on a leaf is never also read as an
   activation of the nesting item above it, and a walk key never reaches two
   surfaces.

Pointer crossings deliberately keep bubbling and rely on the guards alone,
because the submenu is written INSIDE its item: a pointer moving from an item
into its own submenu is not a leave at all, and no geometry is needed.

## No frame polling

`menu-walk.ts`'s `focusEdge` is a single `focus()`. The rAF retry loop the old
file carried (and that select, modal, tour, calendar and colorpicker still
carry) is gone, and the reveal-then-focus rows are green in both render modes -
so the runtime does commit the `hidden` write before the handler returns.

One exception is measured and named in the rows: the gesture that WAKES a served
page cannot also be measured for where it left focus, because the handler runs
after the demand load and the focus asked for inside that first dispatch is
refused and not replayed. Two rows (`SSR: ArrowDown opens…`, `SSR: the
ContextMenu key…`) warm the page with one open/close before measuring, and say
so in a comment. Without the warm-up they fail interchangeably - whichever runs
first pays the cold window.

## The one red, pinned rather than hidden

**An IDREF attribute's presence is decided for the module, not for the reading
instance.** `menu.item` writes `aria-controls={item.itemContentEl}` as ruled.
Once any item anywhere on the page renders a `menu.itemcontent`, every item of
the family emits the attribute - including plain commands whose own instance
never bound that handle - and those point at an id that resolves to nothing. Axe
reports one critical `aria-valid-attr-value` violation on the submenu and
three-level scenarios (measured: `item-new`, `sub-email`, `sub-link`).

Neither escape compiles today, both measured on this tip in
`packages/headless/components/src/menu/menu.tsrx`:

- `aria-controls={submenu ? item.itemContentEl : false}` →
  `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`: "An IDREF position takes element()
  handles written directly, not a join, a choice between handles, or an array the
  compiler cannot read while compiling."
- `computed(() => item.submenu ? item.itemContentEl?.id : false)` →
  `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`: "The emitted
  sync-computed-derive module for symbol:64 still names 'item' directly."

The two submenu axe rows are therefore pinned to exactly
`['aria-valid-attr-value']` rather than to `[]`, with the mechanism named at the
helper. The pin fails if the count changes in either direction, so it cannot
quietly absorb a new violation and it turns red the moment the framework is
fixed. The other four axe rows (closed, open, checkbox, radio, context) are
still zero.

**Owner decision needed** - one of:

- raise the framework capability: emit an IDREF only where the handle is bound in
  the reading instance (this is the clean fix, and it also removes the
  two-handle `aria-labelledby` hack other families carry);
- or allow a conditional IDREF position (`handle | false`);
- or drop `aria-controls` from `menu.item` and let `aria-haspopup` +
  `aria-expanded` + the submenu's `aria-labelledby` carry the relationship, which
  is what the APG's menubar example does and what would make the bar zero today.

## Rows

`menu.browser.ts`: 100 rows, all green (50 per render mode). Rewritten or new for
this shape:

- rewritten: the nesting-item contract row (was "a submenu trigger is an item of
  the menu above it"), the cross-the-nesting-item walk row, the
  ArrowRight/ArrowLeft row, the hover-open/leave-close row, the
  activation-closes-the-chain row (now asserts the ONE root's `onChange` and the
  focus return), the submenu Escape row, and the submenu axe row (now the pin).
- new: a plain item declares no popup/expanded; Enter on a nesting item opens
  rather than activates; the submenu walks its own items and wraps within them;
  typeahead in a submenu matches only that submenu; a pointer crossing into the
  item's own submenu never closes it; and six three-level rows over
  `scenarios/deep.tsrx` - the per-level IDREF contract with distinct ids, arrows
  in and out one level at a time, the deepest surface owning its own walk,
  deepest activation reporting to the one root and taking all three levels down,
  Escape stepping out one level at a time, and a three-levels-open axe row.

`menu.sr.ts` gains: the nesting item announcing menu item + has-popup +
collapsed; the submenu announcing itself as a menu under that item's name; and
Escape returning to the item, which then announces collapsed again. `pnpm
test:sr`: 31 files, 257 passed, 9 expected-fail (pre-existing), 4 skipped.

`menu-transcript.ts` now walks the submenu too (ArrowRight in, Escape out one
level, Escape again for the menu). The NVDA and VoiceOver lane titles follow it.
**Never executed locally** - CI only.

## Follow-up, outside this unit's contract

`api/**` and the sr-gallery still carry `menu.itemtrigger`; re-extracting the API
manifest after the drop and moving the gallery section onto the new markup belong
to the registration unit, as does adding the `menu`/`menuitem` words to the
shared `Vocabulary`.
