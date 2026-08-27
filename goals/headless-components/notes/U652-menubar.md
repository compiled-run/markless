# Menubar as a boolean on `menu.root`

**Built:** 2026-08-27, on `feat/headless-ui-pilot`.
**Research this implements:** `goals/headless-components/notes/U651-menubar-toolbar-research.md`
(§3.3 and §4.5 recommended the boolean; the owner ruled it, with the root rather than
`menu.content` carrying the role).
**Files:** `packages/headless/components/src/menu/**`, `packages/headless/components/api/manifest.json`.

## What shipped

`menu.root menubar` renders `role="menubar"` with `aria-orientation="horizontal"` and is always
showing. There is no `menu.trigger` and no `menu.content` under the flag — the root **is** the
surface — and the `menu.item`s written directly inside it are the bar's menus, each a `submenu`
item whose `menu.itemcontent` is its dropdown. Below the dropdowns, the shipped recursion is
untouched.

It cost one seeded field (`menubar`), two pure helpers in `menu-walk.ts` (`barTarget`,
`isAnyShowing`), one CSS rule, and about ninety lines across `menu.tsrx`. **No new part, no new
role, no new state cell.** Which menu is showing is each bar item's own `expanded`, exactly as the
research predicted; mutual exclusion is not written anywhere, because opening a neighbour takes
focus and the item that had focus closes its own menu from the `focusout` handler the family
already shipped.

The keyboard, and where each piece is answered:

| Gesture | Answered by |
| --- | --- |
| `ArrowLeft`/`ArrowRight`, `Home`/`End`, typeahead on a bar item | `menu.item` |
| `ArrowDown`/`Enter`/`Space` opens on the first command; `ArrowUp` on the last | `menu.item` |
| `ArrowLeft`/`ArrowRight` inside an open bar menu: close it, open the neighbour's | `menu.itemcontent` |
| `ArrowRight` on a nesting item inside a bar menu: open that submenu, travel nothing | `menu.item`, which stops the event |
| `Escape`: close onto the bar item, bar stays | `menu.itemcontent`'s shipped dismissal |
| hover: nothing until a menu is open, then every neighbour opens with no delay | `menu.item` |

Two decisions worth their reasons. The bar's movement keys sit on `menu.item`, **not** on the root,
because the root also wraps whatever a `menu.contextarea` holds — a `preventDefault` chain on the
root would take the arrows away from a caret inside it. And the neighbour's menu is opened by
**re-delivering the gesture** (an `ArrowDown` dispatched at the neighbouring bar item) rather than
by writing to it, because an item instance cannot reach a sibling's; this is the same wall the hover
timers already work around.

`delay`/`closeDelay` stay the nested submenus' hover intent. The bar never consults them: Radix
gates hover-after-open on "some menu is already open" and so does this, asked of the live
`menu.itemcontent` roster rather than of any one instance. Kobalte's `focusOnAlt` is out, as ruled.

## Four things measured, not assumed

**1. A component body may not read the shared instance.** The `menu.trigger` refusal was first
written as an `if (menu.menubar === true) throw` before the JSX. Every SSR row in the family turned
red with `ReferenceError: menu is not defined` — 43 of 102. The read has to sit inside a
`computed()`, so the refusal now throws from the cell that renders `aria-expanded`. This is the
mirror of the family's shipped compiler fact 2 and is now written up as fact 6 in `menu/note.md`. A
part that must refuse itself needs an attribute to ride in.

**2. The family's known-red axe pin is stale, and the menubar did not fix it.** The research
expected a pure menubar to turn `aria-valid-attr-value` green because every bar item has a dropdown.
What is actually true on this tip: a plain `menu.item` emits **no `aria-controls` at all** — probed
on the menubar scenario *and* on the shipped `submenu` scenario, so the module-wide IDREF presence
described in `menu/note.md` fact 3 no longer happens anywhere. Every axe row in the family is at
zero, including the two the note still described as pinned red. Fact 3 is now marked as re-measured
rather than left standing.

**3. The bar's unconditional hover is loud enough to catch the test harness's own pointer.**
`test-support/pointer-parking.ts` documents that Chromium re-hit-tests on mount and delivers a
trusted `pointerover` to whatever is under the resting cursor. With hover-after-open delay-free,
that stray crossing opens a menu no row asked for: seven rows failed on it, deterministically, and
passed in isolation. The rows now park the real pointer clear **after** the mount as well as before
(the shared setup only parks before). Any future family with an unconditional hover will meet this.

**4. What the virtual reader actually says.** `"menubar, Application, orientated horizontally"` —
the role, the name and the axis, with **no item count**. The owner's row asked for "a menu bar with
N items"; that reader does not speak a count, so the row pins the axis instead and asserts the count
from the page, with how many menus the bar holds conveyed by walking it in the row below.

## Lanes

139 browser rows in the menu file (CSR and SSR), 284 in the screen-reader lane, api manifest
re-extracted and checked, lint clean at `--deny-warnings`. The menubar rows cover the shape, the tab
stop, all four movement keys, typeahead, the three opening keys, cross-menu travel both ways,
Escape, hover-after-open including that nothing opens before a menu is, the nested submenu's own
walk, the placement default, a checkbox item, an activation, the trigger refusal, and axe at zero on
the bar at rest and with a bar menu plus a nested submenu open.

`menu-transcript.ts` now carries a second reader-agnostic transcript, `readMenubarTranscript`, and
`menu.nvda.ts` / `menu.voiceover.ts` each gained a test that runs it. **Never executed locally.**
Both need an sr-gallery `#menubar` section, which does not exist yet — the same registration unit
that owes the family its `#menu` section and the `menubar` word in the shared `Vocabulary`.

One flake seen and not caused here: `radio-group.sr.ts`'s "arrowing to the next option moves the
reader onto that option" failed on two of five whole-lane runs and passed on the rest, including
with every menubar row skipped, and passes alone. It is that lane's, not this change's.

## If the owner prefers the composed shape instead

The alternative on the table is a `menubar.root` wrapping N whole `menu.root`s, each `menu.trigger`
registering itself into the bar through `menubar.state()`. That is Radix's structure, and it depends
on a capability nobody here has measured: a part of one family reading and binding an **enclosing**
family's instance. `U651` §3.4 records the framework fact that makes it plausible — a component
rooting one family is still a plain part of every family enclosing it, and its writes land in that
enclosing instance in both render modes — and lists the reverse read as an open framework and owner
question. It is also the same capability a `toolbar` family is blocked on, so proving it buys two
things rather than one.

**Carries over unchanged.** Everything in `menu-walk.ts` is a pure function over a roster of
elements and does not care which family bound them: `barTarget` (the inline-axis step with `loop`),
`stepTo`, `matchingItem`/`itemWords` for the typeahead across the bar, `focusEdge`. The roster would
be the bar's registered triggers instead of the bar's items; the functions are identical.

Three behaviours carry over as written, and they are the ones that were actually hard:

*Opening a neighbour by re-delivering the gesture.* It exists because one instance cannot reach a
sibling's — and in the composed shape the neighbour is a whole separate `menu.root`, which is more
unreachable, not less. The dispatch is still the answer.

*Mutual exclusion from `focusout` rather than from a `value` cell.* Same reasoning, same code path,
and it is what would keep the composed bar from needing Radix's `value` on its root either.

*The "is a menu already open" gate asked of a live roster.* `isAnyShowing` would read each menu's
own `content` element instead of the `itemcontent` roster. Same shape, one line different.

**Changes.** The bar's movement keys move from `menu.item` to `menu.trigger`, and the reason they
are on the item — protecting a caret inside a `menu.contextarea` under the same root — stops
applying, because a trigger is a button. The `isBar` containment test
(`surfaceOf(surfaces, mine) === top`) disappears entirely: a bar member is structurally a
`menu.trigger`, so no depth question is asked. Escape's focus return becomes the shipped
`menu.content` → `menu.trigger` handoff, which is simpler than what the flag needed. And the
dropdown's `block-end` placement is already `menu.content`'s shipped default, so the composed shape
needs no CSS rule at all.

**What it costs that the boolean does not.** `menu.trigger` would have to render `role="menuitem"`
instead of being a plain `<button>` when a bar encloses it — the bar's children must be menuitems —
which is an ARIA fork driven by a *foreign* family's presence, a larger fork than a boolean on the
root. Radix does exactly this, so it is proven, but it is the first thing to check. The trigger
refusal and its measured `ReferenceError` wall go away, and the mirror wall arrives in their place:
`menubar.root` cannot see whether its children are `menu.root`s either.

**Recommendation if asked.** Keep the boolean until the enclosing-instance capability is measured
for its own sake — most likely on the toolbar question, where it is the only door. Nothing built
here is wasted if that measurement goes well: the walk helpers, the gesture re-delivery, the
focus-driven mutual exclusion and the hover gate all move across, and the bar's rows describe
behaviour rather than structure, so most of them would survive a rewrite of where the keys live.
