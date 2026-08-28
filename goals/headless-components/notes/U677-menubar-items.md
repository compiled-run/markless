# menubar as the family's own item recursion

The bar no longer wraps whole `menu.root`s. A consumer writes the recursion the
menu family already ships one turn down:

```tsx
<menubar.root aria-label="App" onChange={report}>
  <menubar.item>File
    <menubar.itemcontent>
      <menu.item value="new">New</menu.item>
      <menu.item submenu>Share<menu.itemcontent>…</menu.itemcontent></menu.item>
    </menubar.itemcontent>
  </menubar.item>
</menubar.root>
```

## What each part is

- `menubar.root` — `role="menubar"`, `aria-orientation="horizontal"`, named by
  `aria-label` or `menubar.label`. It owns the walk across its items (Left,
  Right, Home, End, typeahead), the roving tab stop, delay-free hover-after-open,
  and the one `onChange` every command at every depth reports to. Inside a
  `toolbar` it registers as one of that bar's controls and gives up its own page
  stop.
- `menubar.item` — `role="menuitem"` on a focusable `div` carrying the label
  text, with `aria-haspopup="menu"`, `aria-expanded` and `aria-controls`. It is
  the item level: it seeds `menubarItemState` and composes `menu.root` around a
  private control part, so every `menu.item` written inside resolves the menu
  instance its shipped keyboard and activation already read. ArrowDown, ArrowUp,
  Enter and Space open it; the surface is handed the movement key that lands the
  roving focus on its first or last command.
- `menubar.itemcontent` — `role="menu"`, `aria-labelledby` its item, `hidden`
  until open, `overlay`, `position-area: block-end` in `@layer markless` keyed
  off the anchor its item declares. It walks its own commands, and Left/Right
  from inside it hand the bar over to the neighbouring item.

`menu.trigger` no longer knows about menu bars at all: the `menubarState()`
registration is gone from it, from `menu.root` and from `menu.content`, and the
toolbar registration is untouched. A menu standing outside every bar is exactly
what it was.

## How the two families meet

- `menubar.item` binds `menu.triggerEl` and `menu.itemEls` on its control, and
  `menubar.itemcontent` binds `menu.itemContentEls` on its surface. That single
  registration is what makes the surface one of the menu's own: `dismissChain`
  closes it with the chain, a nested `menu.itemcontent` is one level under it,
  and a command hands focus back to the bar item because that item IS the menu's
  `triggerEl`.
- The plural handles are bound on the bar item rather than the surface because a
  bar item sits outside every surface, so it is never mistaken for one surface's
  own command. A module reading a plural handle it never binds reads `undefined`
  (`elementHandleValueLowering`), so the bar also binds its own item roster to
  itself and walks past itself.
- A bar instance cannot reach one item's cells, so handing over between items is
  a re-delivered gesture: ArrowDown opens the neighbour on its first command,
  a click opens it leaving focus on the bar, and a click on an open item closes
  it. The neighbour answers through its own lazily woken handler, so nothing
  assumes it has opened by the time the call returns.

## Two things measured on the way

- A prop with a destructuring default cannot be read in a template position
  (`MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED`), and passing an item's props
  on to `menu.root` is one. The item destructures without defaults and lets
  `menu.root` apply its own.
- A component that composes another component declared later in the same module
  threw `ReferenceError: Cannot access '__marklessSsrComponent2' before
  initialization` at import time. Declaring the composed part first fixes it.

## Open: the demand-load window resolves the wrong item instance (CSR)

The suite is green on its own (51/51, CSR and SSR). Run alongside the menu and
toolbar suites — which is what the unit's verify command does — five CSR rows
fail, deterministically, and all five are rows whose FIRST gesture on a freshly
rendered page targets an item that is not the first one on the bar.

Measured with a probe in place of the Escape row: after
`el('bar-edit').focus()` and an ArrowDown on `bar-edit`, the bar's own focusin
lands correctly (`bar-edit` takes `tabindex="0"`), but the item's keydown writes
`expanded` onto the FIRST item's instance — `panel-file` shows, `panel-edit`
stays hidden, and focus ends on `BODY`. The same row passes in SSR, and passes in
CSR whenever the menubar suite runs alone, so the trigger is the gesture arriving
while the handler module is still being fetched: the replay resolves the
enclosing widget instance to the first rendered one.

The render side is correct throughout — `aria-controls`, `aria-labelledby` and
the roving stop all name the right elements — so this is handler-time instance
resolution in the CSR demand-load path in `packages/web`, not markup. It is a
framework file, outside this unit's contract, so the family is left as written
and the defect is reported rather than worked around per-family. The exact
runtime file was not isolated; `packages/web/src/fns/instance-scope.ts` (widget
projection resolution) and the primer/replay path near
`packages/web/src/inline/resumer.ts` are where to start.

What this shape adds over the old one, and what makes it hit the wall, is the
same thing: `menubar.item` composes a widget root of ANOTHER family and projects
its own child part through it. The old shape had three sibling `menu.root`s
written by the consumer and no projection through a composed root, and its rows
passed in the same combined run.
