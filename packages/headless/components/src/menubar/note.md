# menubar — implementation notes

An application's menu bar: File, Edit, View, reachable with one Tab and then the
arrows, each one opening a whole ordinary menu.

The family exists because the shape it replaced was a role fork. `menu.root` used
to take a `menubar` boolean that turned the root itself into `role="menubar"`,
made the top-level `menu.item`s the bar's items, refused a `menu.trigger` at
runtime, and gave four of the family's handlers a second keyboard. The owner
retired it (2026-08-27) for the composed shape below. Nothing here is a mode of
`menu`; a bar is its own family that whole, unedited menus stand inside.

```tsx
<menubar.root aria-label="Application">
  <menu.root>
    <menu.trigger>File</menu.trigger>
    <menu.content>
      <menu.item value="new">New</menu.item>
      <menu.item value="recent" submenu>
        Open Recent
        <menu.itemcontent>…</menu.itemcontent>
      </menu.item>
    </menu.content>
  </menu.root>
  <menu.root>…</menu.root>
</menubar.root>
```

## Shape

| Part | Element | Carries |
| --- | --- | --- |
| `menubar.root` | `div` | the family's state; renders one private component a level down that owns `role="menubar"`, `aria-orientation="horizontal"`, `aria-labelledby`, the bar's own tab stop, and the whole bar keyboard |
| `menubar.label` | `span` | the bar's accessible name |

`menubar.state()` per widget instance: `mounted`, `active`, `entered`, the
typeahead buffer and its clock, and the `barEl` / `labelEl` / `triggerEls` /
`menuEls` handles.

**No props at all.** A bar is a grouping and a tab-stop policy: it holds no value
and reports no change, because every menu inside it already reports for itself
through its own `onChange`. There is no `orientation` either — an application
menu bar is horizontal, and a vertical stack of menus is a different pattern.
No `<style>` block: nothing the bar itself renders is positioned or hidden.

## What a menu gives up to go in one

Three lines in `menu.tsrx`, the same three every control in a `toolbar` took:

```tsx
const menubar = menubarState();
…
<button el={[menu.triggerEl, menubar.triggerEls, toolbar.itemEls]} role={triggerRole} tabindex={stop} …>
```

- `menu.trigger` registers into the bar's roster, renders `role="menuitem"`
  keeping `aria-haspopup`, `aria-expanded` and `aria-controls`, takes its
  `tabindex` from the bar, and writes `ui-menubar`. It leaves `Home` and `End` to
  the bar; on its own those keys open the menu, and on a bar they walk it.
- `menu.root` registers into the bar's roster of menus, which is what says WHICH
  menu a gesture landed in.
- `menu.content` writes `ui-menubar`, which is what its own CSS default keys off.

**Outside a bar, nothing changes.** A menu standing outside every bar resolves to
no menubar instance, registers in no roster, reads `mounted` as the seed —
`false` — and renders no `role`, no `ui-menubar` and no `tabindex`. That is
measured from both ends: `two-bars.tsrx` puts a loose menu beside two bars and
asserts the arrows never reach it, its `tabindex` is absent, and its own `Home`
still opens it; and all 100 of `menu`'s rows stayed green under the edits that
retired the flag.

`menu.trigger` also registers into an enclosing `toolbar` — the follow-up
`toolbar/note.md` named and this unit did. In a toolbar the trigger keeps
`role="button"`: a toolbar does not change what its controls are, and only a
menubar makes a trigger a menu item.

## The bar drives the menus by re-delivering their own gestures

A bar instance cannot reach a menu instance's cells, and the menus are whole and
unedited, so a gesture is the only thing the bar has to write with. Every menu
already answers the two it needs:

- **open** — `keydown` `ArrowDown` on the trigger, which is what opens a menu on
  its first command.
- **close** — `click` on an open menu's trigger, which is what shuts it, and
  moves no focus.

Travel (Left/Right with a menu open) opens the neighbour *first* and closes the
one being left after, because the focus the neighbour takes is what collapses any
nested submenu the old menu had open, through that item's own `focusout`. The
re-dispatch idiom is the retired build's, kept: this handler is a component's
own, so the module answering the re-delivered gesture is already loaded.

## The bar owns the roving tabindex, because nothing else can

The same wall `toolbar/note.md` records: an `element()` handle cannot be read
while deriving (`MARKLESS_ELEMENT_HANDLE_UNBOUND`), so no trigger can ask "am I
the first menu in this bar?" at render time. The bar writes `tabIndex` onto the
roster from its own handlers (`applyStops` in `menubar-walk.ts`), and cold —
before any handler has run — carries the page's single stop itself: the bar
renders `tabindex="0"` while `entered` is false, every trigger renders `-1`, and
the first `focusin` hands focus straight to the trigger holding `active` and
drops the bar out of the tab order for good.

That is a deliberate divergence from the retired flag, which used togglegroup's
rule (every bar item tabbable until a focus says otherwise) and therefore offered
three tab stops on a cold page. One is right.

### The bar is in its own rosters, on purpose

`orderedRoster` skips the bar's own element, and the bar binds itself into both
plural handles. That is not decoration: **a module that only READS a plural
`element()` handle, never binding it in its own markup, reads `undefined`.** The
read is lowered against the bindings the reading module carries
(`elementHandleValueLowering`, `packages/compiler/src/passes/symbol-modules.ts`),
and every element in these two rosters is registered by the `menu` family from
its own components. `toolbar` never met this because `toolbar.item` binds
`itemEls` in the same module. Measured here: with no in-module binding the bar
read `undefined` for a roster the trigger side read as three elements.

## Keyboard

| Key | Where | What |
| --- | --- | --- |
| Left / Right | on a trigger, nothing open | walk the bar, wrapping at both ends |
| Left / Right | with a menu open, anywhere in it | close it and open the neighbour on its first command |
| Home / End | on a trigger | the first and last menu |
| a letter | on a trigger | typeahead across the triggers, on `menu`'s own 750 ms window |
| ArrowDown / ArrowUp | on a trigger | the menu's own: open on the first / last command |
| Enter / Space | on a trigger | the button's own activation, which opens on the first command |
| Escape | in an open menu | the menu's own dismissal: it closes and hands focus to its trigger |

The bar wraps, which `toolbar` does not: the APG has a menubar wrap, and the
retired flag already shipped it. A toolbar refuses wrapping because it has a
Tab-out to keep discoverable; a bar of menus does not.

Everything below a trigger is the menu family's, untouched: a nested `submenu`
item still opens on ArrowRight and steps back out on ArrowLeft, and a bare
ArrowRight on a leaf inside a submenu bubbles to the bar and travels, which is
the APG's rule for that key.

## Hover

Nothing opens on hover until something is open; from then on every trigger the
pointer crosses opens at once and the one showing closes. No delay is consulted
at all — `menu`'s `delay` is the nested submenus' hover intent alone, and
`served-open.tsrx` runs on the stock 700 ms to prove a bar menu arrives inside a
400 ms budget.

## CSS defaults

One rule, and it lives in `menu.tsrx` because the element it keys off is
`menu.content`: `[role="menu"][ui-menubar] { position-area: block-end }`, under
`@layer markless`. A bar menu hangs straight under its trigger where a standalone
menu runs `block-end span-inline-end` and a nested submenu sits beside its item.
`ui-menubar` is a presence attribute the trigger and the content write when they
are enclosed — never a prop, and never a placement prop.

## What v1 refuses

No props. No `orientation`. No `loop` (the bar wraps, full stop). No `item` part:
the items ARE the enclosed menus' own triggers, and a wrapper part around each
menu would be a second, roleless element between the bar and its items — which
would also cost the `aria-required-children` pass, since axe flattens a roleless
`div` and would not flatten a roled one. No `sub*` anything: the recursion below a
bar menu is `menu`'s, with the same parts.

## Reference mapping

| Reference | Here | Why |
| --- | --- | --- |
| Radix Menubar `Menubar.Menu` (a context provider rendering no element) | the enclosed `menu.root`, which does render a div | we have no render-nothing part; the div is roleless, so axe and readers see the trigger as the bar's own item |
| Radix `Menubar.Trigger` / `.Content` / `.Item` wrapper parts | `menu.trigger` / `menu.content` / `menu.item` unchanged | a menu in a bar is a menu; duplicating the family would duplicate its keyboard |
| `loop` (Radix defaults it on for menubar) | kept on, not a prop | the APG wraps; nothing here would ever want it off |
| APG's "menubar item is the tab stop" | the bar carries the cold stop and hands it on | a handle cannot be read while deriving; same trade `toolbar` documents |
| `dir` / RTL | dropped | no locale source in the dependency graph |
| `data-*` identity attributes | dropped | `ui-*` state only |

## Registration

Shipped: `src/index.ts` exports the namespace, `package.json` exports
`./menubar`, the conformance battery carries a descriptor (CSR and SSR, no
`openCycle` — the menus open, and `menu` already holds that cycle), the gallery
serves `/#menubar` with `FAMILY_ANCHORS.menubar` beside it, and all three CI
reader matrices name the family.

One shape is pinned in two places because it is invisible until it breaks: axe
grants the bar its `aria-required-children` only by flattening the roleless,
unnamed `menu.root` div each enclosed menu renders, so the trigger inside counts
as the bar's own item. An `aria-label` on one of those divs exposes it as a named
generic and the bar loses every child, with the failure landing on the axe row
rather than on the name. `test-support/conformance.browser.ts` holds that for the
Basic scenario and `apps/sr-gallery/scripts/boot-check.ts` for the gallery's copy.

## Follow-ups this unit names rather than does

**The real-reader lanes have never been run.** `menubar.nvda.ts` and
`menubar.voiceover.ts` only ever run on a CI runner, so what they announce is
unmeasured. The virtual lane's words are measured; NVDA's and VoiceOver's are
that reader's documentation, marked unverified in `menubar.sr.ts`.

**A `menubar` slot in `test-support/driver.ts`'s `Vocabulary`.** Same gap
`toolbar` records for its own role word: the transcript asserts the bar's name and
`aria-orientation` from the page rather than the role word, because `Conveys.role`
is keyed by a `Vocabulary` with no slot for it.

**Escape does not close a menu served `open`.** A surface that was never opened
was never enlisted with the overlay stack that reports Escape, so
`served-open.tsrx` is taken back to rest with a press on its trigger. That is
`menu`/overlay behaviour this unit met rather than introduced, and no shipped
`menu` row covers it.
