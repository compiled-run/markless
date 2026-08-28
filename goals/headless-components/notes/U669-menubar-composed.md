# menubar: the composed family, and the `menu.root menubar` boolean retired

Owner ruling, 2026-08-27: the `menubar` boolean on `menu.root` is confusing —
retire it, and build a `menubar` family that wraps whole, unchanged `menu.root`s.
Done. This note records what the composition actually costs, the one framework
fact that changed the design mid-build, and what is left for the registration
unit.

## What shipped

`packages/headless/components/src/menubar/`: `menubar.tsrx`, `menubar-types.ts`,
`menubar-walk.ts`, `index.ts`, `note.md`, four scenarios (`basic`,
`served-open`, `in-toolbar`, `two-bars`), `menubar.browser.ts` (49 rows, CSR and
SSR), `menubar.sr.ts` (4 virtual-reader rows), `menubar-transcript.ts` and the
two real-reader lane files, which are never run locally.

Two parts, no props:

```tsx
<menubar.root aria-label="Application">
  <menu.root><menu.trigger>File</menu.trigger><menu.content>…</menu.content></menu.root>
  <menu.root><menu.trigger>Edit</menu.trigger><menu.content>…</menu.content></menu.root>
</menubar.root>
```

`menubar.root` renders one private component a level down that owns
`role="menubar"`, `aria-orientation="horizontal"`, `aria-labelledby`, the bar's
own cold tab stop and the whole bar keyboard — the inner-component idiom
`toolbar` set, because a widget root cannot read its own instance token.

## What the menus gave up: three lines

The toolbar precedent, unchanged. In `menu.tsrx`:

```tsx
const menubar = menubarState();
const toolbar = toolbarState();
<button el={[menu.triggerEl, menubar.triggerEls, toolbar.itemEls]} role={triggerRole} tabindex={stop} ui-menubar={inBar} …>
```

`menu.root` registers into `menubar.menuEls`; `menu.content` writes `ui-menubar`
for its own CSS default. Outside both bars every one of those reads resolves to
no instance and the parts render what they always did — measured from both ends
in `two-bars.tsrx` (a loose menu the arrows never reach, with no `tabindex`, no
`role` and no `ui-menubar`, whose own `Home` still opens it) and by all 100 of
`menu`'s pre-boolean rows staying green.

`menu.trigger` also took the toolbar wiring `toolbar/note.md` named as a
follow-up. In a toolbar the trigger keeps `role="button"`: a toolbar does not
change what its controls are.

## The framework fact that changed the design

**A module that only READS a plural `element()` handle — never binding it in its
own markup — reads `undefined`.**

The bar's first shape declared `triggerEls` and `menuEls` on `menubarState` and
read them from its own handlers, exactly as `toolbar` reads `itemEls`. Measured
on this tip, with a probe attribute written from both sides on the same page:

| Read from | `menubar.triggerEls` |
| --- | --- |
| `menu.trigger`'s click handler (menu.tsrx, which binds the handle) | an array of 3 |
| `MenubarBar`'s focusin handler (menubar.tsrx, which binds nothing) | not an array at all |

`mounted` was `true` on both sides, so it is one instance and one set of state
cells; only the handle read differs. The cause is in
`packages/compiler/src/passes/symbol-modules.ts`: `elementHandleValueLowering`
rewrites a handle read to `context.getElementHandle(id)` only when the read
matches an element-handle read the reading module's own semantic graph recorded,
and that graph is built from the bindings **that module** carries
(`passes/semantic-graph/collect-elements.ts`). With no binding, the read is left
as a plain property access on the shared instance and answers `undefined`.

`toolbar` never met this because `toolbar.item` binds `itemEls` in the same
module. `menubar` has no item part — the items are the enclosed menus' own
triggers — so it has nothing of its own to bind.

**The fix, in the family rather than the framework:** the bar binds both plural
handles on its own element, and `orderedRoster` skips that element. One filter,
one comment naming the fact. This is worth a framework issue of its own —
"declaring a plural handle should be enough to read it" — but it is not this
unit's file, and the workaround costs one predicate.

Confirmed both ways: with a temporary binding on `menubar.label` the bar read 4
elements (the span plus the three triggers); with no in-module binding it read
`undefined`.

## How the bar drives menus it cannot reach

A bar instance cannot write another family's cells, and the menus are unedited,
so the bar re-delivers the gestures the menus already answer — the retired
build's idiom, kept:

- open — `keydown` `ArrowDown` on the trigger (opens on the first command)
- close — `click` on an open menu's trigger (shuts it, moves no focus)

Travel opens the neighbour **first** and closes the one being left after: the
focus the neighbour takes is what collapses any nested submenu the old menu had
open, through that item's own `focusout`. Opening second would leave a stale
`expanded` behind.

"Is any menu open" is read off `aria-expanded` on the registered triggers — an
attribute read on a handle the family holds, the same shape the retired
`isAnyShowing` used on `hidden`.

## Divergences from the retired boolean, on purpose

**One cold tab stop, not three.** The flag used togglegroup's rule (every bar
item tabbable until a focus says otherwise). The composed bar uses toolbar's: the
bar carries `tabindex="0"` while `entered` is false, every trigger renders `-1`,
and the first `focusin` hands focus to the trigger holding `active` and drops the
bar out of the tab order. Same handle-cannot-be-read-while-deriving wall, better
answer.

**`Home`/`End` on a trigger walk the bar.** Standing alone those keys open a
menu; `menu.trigger` now yields them when `menubar.mounted`.

**Wrapping stays on and is not a prop.** The APG wraps a menubar; `toolbar`
refuses to wrap because it has a Tab-out to keep discoverable, and a bar of menus
does not.

## Accessibility, measured

`aria-required-children` on `role="menubar"` was the risk the composed shape
carried: there is now a roleless `menu.root` div between the bar and each
trigger. axe 4.13 flattens a child with no role, no global ARIA attribute and no
focusability (`getOwnedRoles`, axe.js), so the trigger reads as owned by the bar;
and `menu` is in menubar's `requiredOwned` list, so an open `menu.content` inside
the bar is allowed too. Zero `wcag2a`+`wcag21a` violations at rest, with a bar
menu open, with a nested submenu open, and on a menu inside a toolbar — CSR and
SSR.

The consequence worth writing down: **a consumer who puts `aria-label` on a
`menu.root` inside a bar breaks the flattening**, because a global ARIA attribute
stops axe recursing into the div. Name the bar on `menubar.root`, or with
`menubar.label`. Nothing enforces that today.

## Things met that this unit did not introduce

**Escape does not close a menu served `open`.** A surface that was never opened
was never enlisted with the overlay stack that reports Escape, so
`served-open.tsrx` returns to rest with a press on the trigger instead. No
shipped `menu` row covers a served-open menu, so this is newly visible rather
than newly broken. Worth a `menu` row of its own.

## Verification

`pnpm typecheck`; `vp test --project ui` over `menubar`, `menu` and `toolbar`
(49 + 191 rows green); `pnpm --filter @markless/ui api:check` (manifest
re-extracted, carries `menubar`, drops the `menubar` prop from `menu.root`);
`pnpm test:sr` (36 files, 289 passed, 10 expected fail, 4 skipped);
`vp lint --deny-warnings` clean.

## Left for the registration unit

`src/index.ts`, the `./menubar` entry in `package.json`'s `exports`, the
conformance battery, the gallery section and its `FAMILY_ANCHORS.menubar` key
(the transcript carries `'/#menubar'` locally until then), the three CI reader
matrices, and a `menubar` slot in `test-support/driver.ts`'s `Vocabulary` — the
same gap `toolbar` records for its own role word. The real-reader lanes have
never been run.
