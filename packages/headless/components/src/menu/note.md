# menu

One family for both menus a person meets: the one a button opens, and the one a
right-click opens. Research memo:
the goal notes (read-only survey of
React Aria, Base UI, Radix, Zag, Kobalte and the WAI-ARIA APG). Every reference
that shipped both shapes ended up with one implementation and two ways in, and
that is what this is: `menu.trigger` and `menu.contextarea` are two parts, not
two values of a mode prop.

## Parts

| Part                | Element  | Carries                                                                                                                                    |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `menu.root`         | `div`    | the menu's state; `ui-open`, `ui-closed`, `ui-disabled`; the anchor scope. With `menubar`, also `role="menubar"` and `aria-orientation="horizontal"` - the root IS the bar |
| `menu.trigger`      | `button` | `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, the opening keys, the anchor name                                                |
| `menu.contextarea`  | `div`    | `ui-open`/`ui-closed` and **no ARIA at all**; right-click, long press, `Shift+F10`, the ContextMenu key                                    |
| `menu.content`      | `div`    | `overlay`, `role="menu"`, `aria-labelledby`, `hidden`; the walk over the items IT holds                                                    |
| `menu.item`         | `div`    | `role="menuitem"` (or `menuitemcheckbox` / `menuitemradio`), `aria-checked`, `aria-disabled`, roving `tabindex`, the activation, the hover intent; with `submenu`, also `aria-haspopup="menu"`, `aria-expanded` and `aria-controls` |
| `menu.itemcontent`  | `div`    | one item's submenu: `overlay`, `role="menu"`, `aria-labelledby` naming that item, `hidden`; the walk over the items IT holds               |

**Separators and groups are the consumer's markup.** `<div role="separator"
aria-orientation="horizontal">` carries one attribute and no behaviour, and
`<div role="group" aria-label="Sort by">` around a set of radio items is what
makes a reader say "1 of 3". Neither is a role in `SPEC.md`, and a part that
renders one attribute is the wrapper recent families have refused to own.

**A menu is not navigation.** `navbar/note.md` is emphatic that site navigation
is a disclosure and must never be a menubar; this family is the mirror image of
that rule, not an exception to it. Menu items _do_ something. A browser row
fails if `menu.item` ever renders as an `<a href>` carrying `role="menuitem"`.

That rule survives the `menubar` flag below, and is the reason the flag is
described the way it is: **a menu bar is for an application's own commands** -
File, Edit, View - not for the links across the top of a site. The APG does ship
a navigation menubar example, so the caution is a calibrated one rather than an
absolute: the pattern is legal for navigation, and it is still the wrong choice
for site navigation, because it takes a set of links a person can Tab through and
puts it behind a menu keyboard they have to learn. `navbar/note.md` points site
navigation at a disclosure; nothing here moves it.

## State

Two widget-scoped families, one per level of ownership.

```ts
menu.state() // rooted by menu.root - one per menu, however deep it nests
  open: boolean               // whether the top surface is showing
  focused: string             // the `value` of the item holding the roving focus, or ''
  typeahead: string           // the live typeahead buffer, shared by every surface
  checked: readonly string[]  // the checked values of this menu's checkbox or radio items
  position: { x, y } | null   // where a context menu was asked for; null when the trigger opened it
  show() / hide()
  // plural rosters every walk is asked of: every item and every submenu surface,
  // at every depth, live and in document order
  itemEls / itemContentEls

menu.itemstate() // rooted by EVERY menu.item - one per item, at any depth
  expanded: boolean           // this item's submenu is showing
  value / checkable / disabled / submenu
  itemEl / itemContentEl      // this item's own element, and the submenu it opens
```

## Props

`menu.root`: `open`, `checked`, `disabled`, `loop` (arrow wrap, on), `radio`,
`menubar`, `delay` (700), `closeDelay` (300), `onChange(value)`,
`onOpenChange(open)`.
No placement prop of any kind - see below.
`menu.item`: `value` (required), `checked`, `disabled`, `submenu`.

`onChange` fires on every activation at every depth - a command, a checkbox item
toggling, a radio item being chosen - carrying the item's `value`.
`onOpenChange` fires for the top surface. Select is the only shipped family with
both things to report and it ships both callbacks, so this matches it.

`submenu` is written rather than inferred from the `menu.itemcontent` inside the
item, for tree's `leaf` reason: a component cannot see its own children while it
renders, and a served page has to carry `aria-haspopup` and `aria-expanded` in
its HTML before anything inside the item exists.

## The keyboard

On the trigger, `Enter` and `Space` are the button's own activation and open the
menu on the first item; `ArrowDown` does the same and `ArrowUp` opens on the
last. Inside a surface the arrows walk **wrapping** at both ends - the deliberate
divergence from `select`, whose note says a listbox has a top and a bottom -
`Home`/`End` jump to the ends, printable characters are typeahead over a 750 ms
window, `Enter` and `Space` activate, `Escape` closes the surface holding focus
and hands focus back, and `Tab` closes and keeps its native move.

`Space` on a checkbox or radio item toggles it and leaves the menu up; `Enter`
takes the whole chain down. On an item carrying `submenu`, `ArrowRight`, `Enter`
and `Space` all open its submenu on the first command inside; `ArrowLeft` inside
a submenu closes it back onto the item that opened it. `ArrowLeft` in the top
surface does nothing, which is what the APG asks for when there is no menubar.

**Every surface owns the walk over its own items**, and no surface can see
another's. What a surface holds is the item roster filtered by containment: an
item belongs to the deepest surface holding it, so a submenu's commands are the
submenu's and the nesting item stays a command of the surface above it.

**A disabled item is a destination.** The arrows land on it and a reader
announces it; only activation is refused. That is the APG's rule and a straight
divergence from `select`, whose walk skips a disabled option.

Two shipped constraints this family did not have to rediscover, both from
`select/note.md`: `preventDefault()` from a deferred handler cannot suppress a
native click, so `Enter`/`Space` on the trigger stay the button's own
activation; and every prevented-key guard is written from `event.key` alone so
the decision is readable before the handler module loads.

## The menu bar: `menu.root menubar`

A menu bar is the same family with one more boolean, on the precedent `radio`
already set here - a boolean on `menu.root` that changes what an ARIA role is.
Under it the **root itself is the bar**: it renders `role="menubar"` with
`aria-orientation="horizontal"`, it is always showing, and the `menu.item`s
written directly inside it are the bar's items. Each of those is a `submenu`
item, and the `menu.itemcontent` inside it is that menu's dropdown. Everything
below the dropdowns is the recursion described above, unchanged.

```html
<menu.root menubar aria-label="Application" onChange={run}>
	<menu.item value="file" submenu>
		File
		<menu.itemcontent>
			<menu.item value="new">New</menu.item>
			<menu.item value="recent" submenu>
				Open Recent
				<menu.itemcontent>
					<menu.item value="draft">draft.md</menu.item>
				</menu.itemcontent>
			</menu.item>
		</menu.itemcontent>
	</menu.item>
	<menu.item value="edit" submenu>Edit<menu.itemcontent>…</menu.itemcontent></menu.item>
</menu.root>
```

**No `menu.trigger` and no `menu.content`.** The bar is the surface, so there is
nothing to open and `open` says nothing under the flag. `menu.trigger` cannot be
refused at compile time - a component cannot see its own children - so it refuses
itself at runtime with a plain message, and a browser row in both render modes
pins that.

**Which menu is showing is each bar item's own `expanded`.** No new cell, no
`value` on the root, no second source of truth: the flag adds one seeded field
and nothing else. Mutual exclusion is not written anywhere either - opening a
neighbour takes focus, and the item that had focus closes its own menu from its
`focusout`, which is behaviour this family already shipped.

The bar's keyboard, and where each piece lives:

| Gesture | What happens | Answered by |
| --- | --- | --- |
| `ArrowLeft` / `ArrowRight` on a bar item | move along the bar, wrapping with `loop` | `menu.item` |
| `Home` / `End` on a bar item | the ends of the bar | `menu.item` |
| a printable character on a bar item | typeahead across the bar, one shared 750 ms buffer | `menu.item` |
| `ArrowDown`, `Enter`, `Space` on a bar item | open its menu on the first command | `menu.item` |
| `ArrowUp` on a bar item | open its menu on the last command | `menu.item` |
| `ArrowLeft` / `ArrowRight` inside an open bar menu | close it and open the neighbour's, on that menu's first command | `menu.itemcontent` |
| `ArrowRight` on a nesting item inside a bar menu | open that submenu, and travel nothing | `menu.item`, which stops the event |
| `Escape` | close the open menu, focus back on its bar item; the bar stays | `menu.itemcontent`'s dismissal |
| hover | nothing until a menu is open; from then on, every bar item opens on the crossing, with no delay | `menu.item` |

Two of those are worth their reasons. The **cross-menu travel is answered on the
content, not on the bar item**, which is where Radix puts it: the gesture is made
where focus is, inside the open menu. And it opens the neighbour by
**re-delivering the gesture that opens it** - an `ArrowDown` dispatched at the
neighbouring bar item - because an item instance cannot reach a sibling's, the
same wall the hover timers already work around.

**Hover-after-open ignores `delay` on purpose.** `delay` and `closeDelay` are the
nested submenus' hover intent and stay theirs; a bar whose menus followed the
pointer on a timer would feel broken. Radix gates the same behaviour on "some
menu is already open", and the bar asks that of the live `menu.itemcontent`
roster rather than of any one instance. A pointer wandering off the bar leaves
the open menu up; only the next bar item, or a dismissal, takes it down.

**The bar is a tab stop; an ordinary menu's trigger is.** Which bar item owns the
stop is togglegroup's rule - until a focus says, every item is tabbable, and the
items inside a closed dropdown are unreachable anyway - so there is no
construction-order counter and no sibling to ask.

Kobalte's `focusOnAlt` is deliberately not here: it is a desktop convention
neither Radix nor Base UI ships.

## Submenus: `menu.item` > `menu.itemcontent` > `menu.item`

A submenu is a `menu.itemcontent` written inside a `menu.item` that says
`submenu`. It recurses with the same two parts, to any depth:

```html
<menu.content>
	<menu.item value="new">New</menu.item>
	<menu.item value="share" submenu>
		Share
		<menu.itemcontent>
			<menu.item value="email">Email</menu.item>
			<menu.item value="social" submenu>
				Social
				<menu.itemcontent>
					<menu.item value="bluesky">Bluesky</menu.item>
				</menu.itemcontent>
			</menu.item>
		</menu.itemcontent>
	</menu.item>
</menu.content>
```

**There is one root.** `menu.state()`, `checked` and `onChange` are the root's,
and an activation at any depth reports to it. There is no second `menu.root`, no
`sub*` part, and no `menu.itemtrigger`: the item IS the opener.

Every `menu.item` roots its own `menu.itemstate()` - tree's `treeItemState`
precedent - which is what gives each item its own `expanded`, its own element
handles and its own submenu, while leaving it an ordinary part of the enclosing
menu. Four framework facts this shape stands on, each with a witness:

- a component rooting one family is still a plain part of every other family
  enclosing it, and its writes land in that enclosing instance, CSR and SSR
  alike (`vitest-browser/browser/nested-widget-outer-write`);
- a handler reads its OWN instance's singular `element()` handle at any depth
  (`vitest-browser/browser/handler-instance-handle`) - the wall the previous
  attempt at this shape hit, now closed;
- a widget root's own element can carry an IDREF to a part it seeds, and be
  named back by it (`vitest-browser/browser/root-idref`) - which is exactly
  `menu.item`'s `aria-controls` and `menu.itemcontent`'s `aria-labelledby`;
- a family's widget root is the FIRST component in the module that seeds it, so
  `menu.root` is declared before `menu.item` and never lets `menu.item` seed
  `menuState`.

**No DOM query anywhere.** `menu-walk.ts` is asked only of the handles this
family binds: the top surface, the plural roster of every `menu.itemcontent`,
and the plural roster of every `menu.item`, all live and in document order.
`contains` is the one platform question, and only of a bound handle about a node
the platform handed over.

**A gesture inside a submenu bubbles through every item and surface above it.**
Each handler first asks whether the target is in its own level - an item checks
its own `itemContentEl`, a surface checks that it is the deepest surface holding
the target - and leaves the event alone when it is not. The surface that
answered a key then calls `stopPropagation()`, and an item that answered a click
does the same, so nothing above ever sees a gesture as its own. The guards alone
are sufficient; stopping is the second lock.

**Hover intent without a safe polygon.** The submenu is written INSIDE its item,
so a pointer crossing from the item into its own submenu is never a leave and
needs no geometry at all. `delay` opens, `closeDelay` closes, and a timer
re-delivers the crossing rather than acting from inside a callback that cannot
reach the graph. Focus leaving the item entirely - a keyboard walk onto a
sibling, or the whole menu closing - closes its submenu at once, which is what
makes a walk across siblings behave. Every reference builds a geometric guard
here (Radix's five-point grace polygon, React Aria's `atan2` intent tracker,
Base UI's `safePolygon`) and all three measure boxes and install document-level
pointer listeners, which this library does neither of. **Revisit trigger:** if
the diagonal path across a _sibling_ item to an overhanging submenu is measured
failing at `closeDelay: 300`, that is a framework-capability conversation, not a
family edit.

**Typeahead reads the item's whole text.** An item holding a submenu contains
every command inside it, and a decoration marked `aria-hidden` is in there too.
Subtracting either would mean walking child nodes, which this family may not do;
a match is `startsWith`, and both follow the item's own label rather than
preceding it, so the label is still what answers. A consumer writing a
decoration BEFORE the label makes that decoration typeable.

**Three levels are measured**, in both render modes: `scenarios/deep.tsrx` plus
the arrow-in/arrow-out, per-surface-walk, deepest-activation and step-out-Escape
rows.

## The context menu

`menu.contextarea` carries no role, no name and no ARIA state. `aria-haspopup`
says a control opens a menu when it is _activated_, which a region answering a
right-click does not do, and a context menu is equally discoverable to everyone
without a reader-only announcement. React Aria states the reasoning and cites
w3c/aria#1971; Base UI, Radix, Kobalte and Zag independently write nothing
either. The cost is real and is the family's one irreducible screen-reader gap:
**nothing announces that a region has a context menu.** Give `menu.content` an
`aria-label` - with no trigger, there is nothing else to name the surface.

**The cold first right-click is the gate, and it is green.** The handler writes
`event.preventDefault()` unconditionally, reading nothing, as the first
statement. That is the only shape the compiler can lift into the synchronous
policy the resumer applies in its own capture listener, which is what cancels
the browser's own menu on a served page _before_ the handler module has been
fetched. Measured both ways in
`packages/vitest-browser/browser/menu-gates/context-gate.test.ts`: the cancel
lands inside the dispatch on served and client-rendered pages alike, while the
handler itself runs at `eventPhase` 0, long after. One graph read in front of
that `preventDefault()` and the first right-click shows the browser's menu.

The consequence for `disabled`: **a disabled menu's context area still cancels
the browser's own menu**, it simply opens nothing. Deciding it at render time
means the consumer not mounting `menu.contextarea` at all; the family cannot
branch its own handler off a graph cell without giving up the cancel.

**`Shift+F10` and the ContextMenu key are opened by the family itself.** On a
real desktop the platform synthesises a `contextmenu` event for both, and every
reference relies on that. Headless Chromium does not - measured, and pinned in
the gate file - so the keys arrive as keydowns and nothing follows them. The
family opens on the keydown, at the middle of the focused element's box, and
records when it did so a platform that _does_ synthesise `contextmenu` 300 ms
later does not open a second menu on top of the first. `F10` without Shift is
prevented as well: the extractable policy grammar is `===` against a literal, so
the guard is a flat chain of key comparisons, and plain `F10` has no default
action here to lose.

**Long press** is our own timer, 500 ms with a 10 px drift threshold (Base UI's
threshold: cancelling on any movement makes the gesture fail for anyone whose
finger is not perfectly still). The timer synthesises the `contextmenu` event
rather than opening, both because a scheduled callback cannot reach the graph
and because iOS sends no `contextmenu` for a long press at all.

**Focus return, with no trigger to return to.** What held focus when the menu
was asked for is remembered in a `WeakMap` keyed by the surface, in
`menu-walk.ts`, because an element is not state a page can be served with. The
family does not make the area focusable: that would put a tab stop on what is
often a whole page body.

## Placement

The placement is CSS, not JavaScript. Each part ships a scoped `<style>` block
in `@layer markless` - a named layer a consumer's unlayered rule always beats -
carrying `anchor-scope` on the root, `anchor-name` on the trigger, and
`position: fixed` plus `position-anchor` plus one default `position-area` on the
surface. So the surface is placed on its first layout with no script, and a
surface served already open is placed before anything runs.

`menu.content` defaults to `block-end span-inline-end` and `menu.itemcontent` to
`inline-end span-block-end`. A consumer moves either with one unlayered rule of
their own - `.my-menu { position-area: block-start span-inline-end }` - and
brings their own `position-try-fallbacks`. There is no `side` prop, and there is
no `placement`, `align` or `offset` under another name.

**One anchor name, re-scoped per item.** `menu.item` declares both
`anchor-name: --ui-menu` and `anchor-scope: --ui-menu`, so inside an item the
name resolves to that item and outside it resolves to the trigger. That is what
lets one `position-anchor` rule place the top surface against the trigger and
every submenu against its own item, at any depth, with no per-instance name and
no identity attribute. The two surfaces are told apart in CSS by structure: a
submenu is the module's only `role="menu"` sitting inside a `menuitem*`, which is
what gives it the inline-end default the submenu convention asks for.

The context-opened surface has no anchor to resolve against - a context menu has
no `menu.trigger` - which leaves the `position-area` inert and hands the
placement to `left`/`top`. Those read `--x` and `--y`, the only thing JavaScript
still writes here: a `computed()` style string carrying the point in client
coordinates.

**Nothing measures a box, so nothing flips.** A context menu asked for near the
bottom right corner overflows. The anchored path can be given
`position-try-fallbacks` from a consumer's stylesheet; the point path cannot.
Base UI and Radix get flipping free from floating-ui, and this is the price of
not carrying a positioner.

## Dismissal

Both surfaces carry the bare `overlay` attribute, so the primitive reports
Escape and outside presses and moves no focus itself. Escape hands focus back;
an outside press is a person choosing where to be, so it does not. **The menu is
never modal**: it writes no `aria-modal`, from which the primitive derives
modality, so the page behind it is never inert and never scroll-locked - a
divergence from Radix and Base UI, which default to modal. A wheel does not
dismiss, and there is a row for it.

The overlay stack reports to the topmost surface only, which here is exactly
what the APG asks for: with a submenu open, Escape closes the submenu, hands
focus to the item that opened it, and leaves every surface above it up. Three
levels step out one at a time, and there are rows for both.

**Activation closes the chain.** A command at any depth has to take the whole
menu down. It reports the same `dismiss` the primitive reports, on each surface
holding it, innermost first - every level answers for itself, and the outermost
runs last, so focus ends on the control that opened the menu. That is not a
workaround dressed up: the outcome those surfaces are being told about is
exactly a dismissal. An outside press reaches only the topmost surface, so a
`menu.itemcontent` receiving one passes it up the same way.

## What v1 refuses, and why

- **No safe polygon** (above), **no portal**, **no arrow**, **no positioner**,
  **no backdrop**, **no scroll lock**.
- **No `aria-activedescendant`.** It is deliberately absent from the compiler's
  `IDREF_ATTRIBUTES`, so roving real DOM focus is the only model - which is also
  what Radix, Base UI and React Aria ship.
- **No press-drag-release.** Holding the right button, dragging onto an item and
  releasing is about forty lines of pointer bookkeeping for a gesture few people
  use.
- **No `'indeterminate'` checked state.** Only Radix has one, and a mixed _menu_
  item has no use the memo could find.
- **RTL is not handled.** `ArrowLeft`/`ArrowRight` do not swap: `@markless/ui`
  depends on `@markless/core` and nothing else, so there is no locale source.
- **macOS `Control+Enter`** is not worked around. Both upstream bugs (WebKit PR
  62278, Chrome 147) are fixed and shipping.
- **`menu.state()` is not a repeat source.** A repeat over widget-scoped shared
  state adds rows and never removes one, so a menu whose item list _shortens_ -
  a filtered command palette - hits that wall. Items are the consumer's markup
  or the consumer's own array.

## What the compiler and the browser forced

1. **A repeat row may not read the menu's shared state.** A keyed `@for` whose
   row body reads the enclosing widget's shared instance mints **zero rows**,
   silently, with no diagnostic - measured on this tip and pinned in
   `menu-gates/nested-scope.test.ts`. This is why items are parts. A part
   rendered from a loop variable is fine; a plain row reading menu state is not.
2. **A seed may only read its own component's props.** `menu.item` cannot report
   its own initial checked state to the root: the emitted shared-seed module
   names neither the component's local `state()` nor the shared instance
   (`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`), and calling a shared
   method from a component body throws `ReferenceError` on a served page. So the
   checked set is `menu.root`'s `checked` prop, which is also what a radio
   choice needs - unchecking a sibling is one decision about the whole menu.
3. **~~An IDREF attribute's PRESENCE is decided for the module, not for the
   instance.~~ No longer true on this tip - re-measured 2026-08-27.** A plain
   `menu.item` in the shipped submenu scenario, and in a bar menu, emits **no**
   `aria-controls` at all, so nothing points at an id that resolves to nothing
   and every axe row in this family is at zero. The paragraph below is kept as
   the record of what the behaviour was when the family was built. What was
   measured then: `menu.item` writes `aria-controls={item.itemContentEl}`, and once
   any item anywhere on the page renders a `menu.itemcontent`, every item of the
   family emits the attribute - including the plain commands whose own instance
   never bound that handle, which then point at an id that resolves to nothing.
   Axe calls that a critical `aria-valid-attr-value` violation, and it is the one
   red in this family's accessibility bar, **pinned as such** by the two submenu
   axe rows rather than hidden. Neither escape works today: a choice in an IDREF
   position is `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`, and reading the id off
   the handle inside a `computed()` is
   `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`. Both measured on this
   tip. The capability to raise: emit an IDREF only where the handle is bound in
   the reading instance.
4. **A scheduled callback cannot reach the graph.** Every timer here re-delivers
   the gesture instead of acting: the submenu's open and close re-dispatch
   `pointerover`/`pointerout`, and the long press dispatches `contextmenu`. This
   has now bitten navbar, tooltip and hovercard in turn.
5. **A synchronous policy guard is `===` against a literal.** A bare event field
   (`event.shiftKey`) is not a condition the policy can carry, which is what
   flattened the context-key guard.
6. **A component BODY may not read the shared instance.** The mirror of fact 2:
   `menu.trigger`'s refusal under `menubar` was first written as an `if` over
   `menu.menubar` before the JSX, and every SSR row in the family turned red with
   `ReferenceError: menu is not defined` - measured on this tip. The read has to
   sit inside a `computed()`, which is where the refusal now throws from. A part
   that has to refuse itself therefore needs an attribute to ride in.
7. **The gesture that WAKES a served page cannot also be measured for where it
   left focus.** The handler runs after the demand load, and the focus it asks
   for inside that first dispatch is refused and not replayed. Two rows warm the
   page with one open/close before measuring the opening focus, and say so. No
   frame polling anywhere in the family: the reveal-then-focus that every other
   family retries per frame lands on the first call here, in both render modes.
8. **`@if` and `@for` cannot be direct children of a component tag**, and a
   widget-rooting part inside a _flipping_ `@if` arm is
   `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`. "This item appears only when signed
   in" is the everyday menu, and it is a framework wall this family sits closer
   to than any that has met it so far.

## Divergences from the references, with mappings

| Reference                                                                                     | Ours                                                       | Why                                                                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Base UI: ~20 menu parts plus 2 context-menu parts                                             | 6                                                          | `portal`, `positioner`, `viewport`, `arrow`, `group` are explicitly not roles in SPEC |
| Radix `SubTrigger` / `SubContent`; Base UI `SubmenuRoot`                                      | `menu.item` with `submenu`, holding `menu.itemcontent`     | SPEC: a family that nests recurses with the same parts, no `sub*` prefix, one root    |
| React Aria `trigger: 'press' \| 'longPress' \| 'contextMenu'`                                 | two parts                                                  | SPEC: no mode/role/type enum props                                                    |
| React Aria `onAction` + `onSelectionChange`; Base UI `onCheckedChange`; Radix `onValueChange` | one `onChange(value)`                                      | SPEC's primary-callback rule                                                          |
| Radix `preventDefault`s Tab; Base UI and React Aria trap in a focus scope                     | Tab closes and keeps its native move                       | the APG says so, and the surface is neither portalled nor trapped, so it is free      |
| Radix and Base UI default `modal = true`                                                      | never modal                                                | modality is derived from `aria-modal`, which a menu never writes                      |
| The safe polygon, three ways                                                                  | the submenu is inside its item, plus `closeDelay`          | crossing into your own child is not a leave; all three references measure boxes       |
| React Aria's `submenuLevel`, Base UI's floating tree                                          | one item instance per item, depth is only markup depth     | tree's `treeItemState` precedent; measured to three levels                            |
| Zag's `aria-activedescendant`                                                                 | roving DOM focus                                           | the attribute is deliberately absent from `IDREF_ATTRIBUTES`                          |
| `Separator` / `Group` / `GroupLabel` parts                                                    | consumer markup                                            | not roles in SPEC; no behaviour to own                                                |
| Radix `data-highlighted`, `data-state`                                                        | `ui-open`, `ui-checked`, `ui-disabled`                     | SPEC's `ui-*` rule                                                                    |
| Base UI `LONG_PRESS_DELAY = 500`                                                              | 500                                                        | the packet's ruling; Radix and Kobalte use 700                                        |
| Base UI drops `aria-expanded` on a submenu under VoiceOver                                    | kept always                                                | we cannot sniff the reader and would not; recorded as an inherited VoiceOver defect   |
| Radix `onCloseAutoFocus`, `onEntryFocus`, `onEscapeKeyDown`, and three more                   | one `onDismiss`, forwarded                                 | one primitive event; SPEC has no name for the others                                  |
| Radix and React Aria portal to `document.body`                                                | never portalled                                            | the library's standing rule, and what makes the two rows above free                   |
| Radix's and Kobalte's second `Menubar` namespace (~15-17 parts); Base UI's one `Menubar` part wrapping N `Menu.Root`s | one `menubar` boolean on `menu.root` | SPEC: recursion reuses the same parts, no second root - and Base UI's shape needs a `render` prop we do not have |
| Radix and Kobalte hold "which menu is open" as a `value` on the menubar root | each bar item's own `expanded` | the cell already exists; a second source of truth would have to be kept in step with it |
| Kobalte's `focusOnAlt` | not shipped | a desktop convention neither Radix nor Base UI ships |

## Lanes

`menu.browser.ts` runs every row in a CSR and an SSR mode loop, including the
axe rows (`wcag2a` + `wcag21a`, no exemptions, on a closed menu, an open menu,
checkbox and radio menus, an open submenu, three open levels, an open context
menu, the menu bar at rest, and a bar menu with a nested submenu open). All of
them are at zero on this tip.

The menubar rows cover the bar's shape and its tab stop, all four of its
movement keys, its typeahead, the three opening keys, the cross-menu travel in
both directions, Escape, hover-after-open (including that nothing opens on hover
before a menu is), the nested submenu's own walk, the placement default, a
checkbox item, an activation, and the `menu.trigger` refusal. They park the real
pointer clear of the mount after rendering as well as before: the bar's
hover-after-open is unconditional, so the trusted `pointerover` Chromium
delivers when a tree mounts under the cursor is enough to open a menu no row
asked for - the hazard `test-support/pointer-parking.ts` documents.

`menu.sr.ts` is the virtual reader, and covers the nesting item announcing its
popup and expanded state, the submenu announcing itself under that item's name,
Escape returning to the item, and the bar - which that reader announces as
`"menubar, Application, orientated horizontally"`, measured, with no item count
of its own, so how many menus the bar holds is what walking it conveys. `menu-transcript.ts` carries two reader-agnostic
transcripts - the menu and the bar - that `menu.nvda.ts` and `menu.voiceover.ts`
run against real readers on the sr-gallery page - **which does not have a menu section yet**: adding it,
along with the `menu` and `menuitem` words in the shared `Vocabulary` and the
`FAMILY_ANCHORS` entry the transcript names locally in the meantime, belongs to
the unit that registers this family. The real-reader lanes are never run
locally; CI only.

The gallery has no menu section and no menubar section yet; adding both, and the
`menubar` word alongside `menu` and `menuitem` in the shared `Vocabulary`, is the
registration unit's. `api/manifest.json` is re-extracted and carries `menubar`.
