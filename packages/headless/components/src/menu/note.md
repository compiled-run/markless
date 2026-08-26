# menu

One family for both menus a person meets: the one a button opens, and the one a
right-click opens. Research memo:
`goals/headless-components/notes/U539-menu-research.md` (read-only survey of
React Aria, Base UI, Radix, Zag, Kobalte and the WAI-ARIA APG). Every reference
that shipped both shapes ended up with one implementation and two ways in, and
that is what this is: `menu.trigger` and `menu.contextarea` are two parts, not
two values of a mode prop.

## Parts

| Part               | Element  | Carries                                                                                                                                   |
| ------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `menu.root`        | `div`    | the family's state; `ui-open`, `ui-closed`, `ui-disabled`; the anchor scope                                                               |
| `menu.trigger`     | `button` | `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`, the opening keys, the anchor name                                               |
| `menu.contextarea` | `div`    | `ui-open`/`ui-closed` and **no ARIA at all**; right-click, long press, `Shift+F10`, the ContextMenu key                                   |
| `menu.content`     | `div`    | `overlay`, `role="menu"`, `aria-labelledby`, `hidden`, `ui-side`                                                                          |
| `menu.item`        | `div`    | `role="menuitem"` (or `menuitemcheckbox` / `menuitemradio`), `aria-checked`, `aria-disabled`, roving `tabindex`, the walk, the activation |
| `menu.itemtrigger` | `button` | `role="menuitem"` **plus** `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; opens the submenu it is written in                   |

**Separators and groups are the consumer's markup.** `<div role="separator"
aria-orientation="horizontal">` carries one attribute and no behaviour, and
`<div role="group" aria-label="Sort by">` around a set of radio items is what
makes a reader say "1 of 3". Neither is a role in `SPEC.md`, and a part that
renders one attribute is the wrapper recent families have refused to own.

**A menu is not navigation.** `navbar/note.md` is emphatic that site navigation
is a disclosure and must never be a menubar; this family is the mirror image of
that rule, not an exception to it. Menu items _do_ something. A browser row
fails if `menu.item` ever renders as an `<a href>` carrying `role="menuitem"`.

## State

```ts
menu.state() // per widget instance
  open: boolean            // whether this menu's surface is showing
  focused: string          // the `value` of the item holding the roving focus, or ''
  typeahead: string        // the live typeahead buffer
  checked: readonly string[]  // the checked values of this menu's checkbox or radio items
  position: { x, y } | null   // where a context menu was asked for; null when the trigger opened it
  show() / hide()
```

## Props

`menu.root`: `open`, `checked`, `disabled`, `loop` (arrow wrap, on), `radio`,
`side`, `delay` (700), `closeDelay` (300), `onChange(value)`,
`onOpenChange(open)`.
`menu.item`: `value` (required), `checked`, `disabled`.

`onChange` fires on every activation - a command, a checkbox item toggling, a
radio item being chosen - carrying the item's `value`. `onOpenChange` fires for
the surface. Select is the only shipped family with both things to report and it
ships both callbacks, so this matches it.

## The keyboard

On the trigger, `Enter` and `Space` are the button's own activation and open the
menu on the first item; `ArrowDown` does the same and `ArrowUp` opens on the
last. Inside the menu the arrows walk **wrapping** at both ends - the deliberate
divergence from `select`, whose note says a listbox has a top and a bottom -
`Home`/`End` jump to the ends, printable characters are typeahead over a 750 ms
window, `Enter` and `Space` activate, `Escape` closes the surface holding focus
and hands focus back, and `Tab` closes and keeps its native move.

`Space` on a checkbox or radio item toggles it and leaves the menu up; `Enter`
takes the whole menu down. `ArrowRight` on `menu.itemtrigger` opens its submenu
on the first item; `ArrowLeft` inside a submenu closes it back onto that
trigger. `ArrowLeft` in a root menu does nothing, which is what the APG asks for
when there is no menubar.

**A disabled item is a destination.** The arrows land on it and a reader
announces it; only activation is refused. That is the APG's rule and a straight
divergence from `select`, whose walk skips a disabled option.

Two shipped constraints this family did not have to rediscover, both from
`select/note.md`: `preventDefault()` from a deferred handler cannot suppress a
native click, so `Enter`/`Space` on the trigger stay the button's own
activation; and every prevented-key guard is written from `event.key` alone so
the decision is readable before the handler module loads.

## Submenus: a nested `menu.root`

A submenu is a `menu.root` written inside another menu's `menu.content`, holding
its `menu.itemtrigger` and its own `menu.content`:

```html
<menu.content>
	<menu.item value="new">New</menu.item>
	<menu.root side="end">
		<menu.itemtrigger>Share</menu.itemtrigger>
		<menu.content>
			<menu.item value="email">Email</menu.item>
		</menu.content>
	</menu.root>
</menu.content>
```

The nested root is a real second instance of the family, measured on this tip in
both render modes by
`packages/vitest-browser/browser/menu-gates/nested-scope.test.ts`, and that is
what gives the submenu its own open state, its own roving focus and its own
`onChange`. **A submenu's activations reach the callback written on the
submenu's root**, not the menu above it, because no handle and no read crosses an
instance boundary.

That boundary is also why this family reads the DOM where `select` and `navbar`
read `element()` handles. A `menu.itemtrigger` is an item of the menu _above_
it while belonging to the submenu's instance, so no plural handle can hold one
surface's items. `menu-walk.ts` asks for `[role="menu"]` and the three
`menuitem*` roles instead - the family's own output, read back - and the whole
walk, in and out of submenus, falls out of that one question.

**Hover intent without a safe polygon.** The pointer handlers sit on the nested
root, which wraps the trigger and the surface, so a move from a submenu's
trigger into that submenu is never a leave. `delay` opens, `closeDelay` closes,
and a timer re-delivers the crossing rather than opening from inside a callback
that cannot reach the graph. Every reference builds a geometric guard here -
Radix's five-point grace polygon, React Aria's `atan2` intent tracker, Base UI's
`safePolygon` - and all three measure boxes and install document-level pointer
listeners, which this library does neither of. **Revisit trigger:** if the
diagonal path across a _sibling_ item to an overhanging submenu is measured
failing at `closeDelay: 300`, that is a framework-capability conversation, not a
family edit.

**One level.** Two-deep submenus are where React Aria's `submenuLevel` and Base
UI's floating-tree bookkeeping start earning their keep; nothing here forbids
the markup, and nothing here has measured it.

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
and because iOS sends no `contextmenu` for a long press at all. The area carries
`-webkit-touch-callout: none` inline, which is the one place this family writes
a `style` on a part for behaviour rather than placement.

**Focus return, with no trigger to return to.** What held focus when the menu
was asked for is remembered in a `WeakMap` keyed by the surface, in
`menu-walk.ts`, because an element is not state a page can be served with. The
family does not make the area focusable: that would put a tab stop on what is
often a whole page body.

## Placement

The placement is CSS, not JavaScript. Each part ships a scoped `<style>` block
in `@layer markless` - a named layer a consumer's unlayered rule always beats -
carrying `anchor-scope` on the root, `anchor-name` on the trigger, and
`position: fixed` plus `position-anchor` plus one `position-area` per `ui-side`
value on the surface. So the surface is placed on its first layout with no
script, and a surface served already open is placed before anything runs.

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

`menu.content` owns its own `style` attribute, which carries `--x`/`--y` and
nothing else. The other parts leave `style` alone.

## Dismissal

`menu.content` carries the bare `overlay` attribute, so the primitive reports
Escape and outside presses and moves no focus itself. Escape hands focus back;
an outside press is a person choosing where to be, so it does not. **The menu is
never modal**: it writes no `aria-modal`, from which the primitive derives
modality, so the page behind it is never inert and never scroll-locked - a
divergence from Radix and Base UI, which default to modal. A wheel does not
dismiss, and there is a row for it.

The overlay stack reports to the topmost surface only, which here is exactly
what the APG asks for: with a submenu open, Escape closes the submenu and leaves
its parent up. There is a row asserting that, so a future change to the stack
cannot silently take it away.

**Activation closes the chain.** A command in a submenu has to take the whole
menu down, and it cannot reach the instances above it - so it reports the same
`dismiss` the primitive reports, on each surface above it in turn. That is not a
workaround dressed up: the outcome those surfaces are being told about is
exactly a dismissal, and each one closes and hands its focus back the way it
would for Escape.

## What v1 refuses, and why

- **No menubar.** It needs a `menubar` role, an orientation, and a cross-menu
  walk - and the one obvious consumer, site navigation, is ruled out by
  `navbar/note.md`.
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
   `menu-gates/nested-scope.test.ts`, and not about nesting: a single root is
   the same red. This is why items are parts. A part rendered from a loop
   variable is fine; a plain row reading menu state is not.
2. **A seed may only read its own component's props.** `menu.item` cannot report
   its own initial checked state to the root: the emitted shared-seed module
   names neither the component's local `state()` nor the shared instance
   (`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`), and calling a shared
   method from a component body throws `ReferenceError` on a served page. So the
   checked set is `menu.root`'s `checked` prop, which is also what a radio
   choice needs - unchecking a sibling is one decision about the whole menu.
   `checked` on an item says the item _has_ a checked state, which is what
   selects `menuitemcheckbox`; the root's `checked` says which items are in it.
3. **One `element()` handle cannot be bound by two parts**, even two that never
   render together: `menu.trigger` and `menu.itemtrigger` are the same role in
   this family's life and still need separate handles
   (`MARKLESS_ELEMENT_HANDLE_DUPLICATE`), and a plural handle is refused in an
   IDREF position (`MARKLESS_ELEMENT_HANDLE_PLURAL_IDREF`). So `menu.content`
   names itself with a two-handle `aria-labelledby` list, of which the opener
   this instance never rendered contributes an id that resolves to nothing.
   Inert for the platform, and no axe violation - measured by the submenu and
   context axe rows.
4. **A scheduled callback cannot reach the graph.** Every timer here re-delivers
   the gesture instead of acting: the submenu's open and close re-dispatch
   `pointerover`/`pointerout`, and the long press dispatches `contextmenu`. This
   has now bitten navbar, tooltip and hovercard in turn.
5. **A synchronous policy guard is `===` against a literal.** A bare event field
   (`event.shiftKey`) is not a condition the policy can carry, which is what
   flattened the context-key guard.
6. **`@if` and `@for` cannot be direct children of a component tag**, and a
   widget-rooting part inside a _flipping_ `@if` arm is
   `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`. "This item appears only when signed
   in" is the everyday menu, and it is a framework wall this family sits closer
   to than any that has met it so far.

## Divergences from the references, with mappings

| Reference                                                                                     | Ours                                                         | Why                                                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Base UI: ~20 menu parts plus 2 context-menu parts                                             | 6                                                            | `portal`, `positioner`, `viewport`, `arrow`, `group` are explicitly not roles in SPEC |
| React Aria `trigger: 'press' \| 'longPress' \| 'contextMenu'`                                 | two parts                                                    | SPEC: no mode/role/type enum props                                                    |
| React Aria `onAction` + `onSelectionChange`; Base UI `onCheckedChange`; Radix `onValueChange` | one `onChange(value)`                                        | SPEC's primary-callback rule                                                          |
| Radix `preventDefault`s Tab; Base UI and React Aria trap in a focus scope                     | Tab closes and keeps its native move                         | the APG says so, and the surface is neither portalled nor trapped, so it is free      |
| Radix and Base UI default `modal = true`                                                      | never modal                                                  | modality is derived from `aria-modal`, which a menu never writes                      |
| The safe polygon, three ways                                                                  | pointer handlers scoped to the nested root plus `closeDelay` | all three measure boxes and install document listeners                                |
| Zag's `aria-activedescendant`                                                                 | roving DOM focus                                             | the attribute is deliberately absent from `IDREF_ATTRIBUTES`                          |
| `Separator` / `Group` / `GroupLabel` parts                                                    | consumer markup                                              | not roles in SPEC; no behaviour to own                                                |
| Radix `data-highlighted`, `data-state`                                                        | `ui-open`, `ui-checked`, `ui-disabled`, `ui-side`            | SPEC's `ui-*` rule                                                                    |
| Base UI `LONG_PRESS_DELAY = 500`                                                              | 500                                                          | the packet's ruling; Radix and Kobalte use 700                                        |
| Base UI drops `aria-expanded` on a submenu under VoiceOver                                    | kept always                                                  | we cannot sniff the reader and would not; recorded as an inherited VoiceOver defect   |
| Radix `onCloseAutoFocus`, `onEntryFocus`, `onEscapeKeyDown`, and three more                   | one `onDismiss`, forwarded                                   | one primitive event; SPEC has no name for the others                                  |
| Radix and React Aria portal to `document.body`                                                | never portalled                                              | the library's standing rule, and what makes the two rows above free                   |

## Lanes

`menu.browser.ts` runs every row in a CSR and an SSR mode loop, including the
four axe rows (`wcag2a` + `wcag21a`, no exemptions, on a closed menu, an open
menu, checkbox and radio menus, an open submenu and an open context menu).
`menu.sr.ts` is the virtual reader. `menu-transcript.ts` is the reader-agnostic
transcript that `menu.nvda.ts` and `menu.voiceover.ts` run against real readers
on the sr-gallery page - **which does not have a menu section yet**: adding it,
along with the `menu` and `menuitem` words in the shared `Vocabulary` and the
`FAMILY_ANCHORS` entry the transcript names locally in the meantime, belongs to
the unit that registers this family.
