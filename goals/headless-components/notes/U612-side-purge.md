# The `side` prop is gone: placement is the consumer's CSS

Ruling (2026-08-27): "no CSS through props — they should be able to customize
with CSS anchor positioning." The `side` prop and the `ui-side` attribute were
placement, so both are deleted from every overlay family. Each part now ships one
default `position-area` inside `@layer markless`, and a consumer repositions with
one unlayered rule plus `position-try-fallbacks` of their own.

## What each part ships now

| part | default `position-area` |
| --- | --- |
| `tooltip.content` | `block-start` |
| `popover.content` | `block-end` |
| `hovercard.content` | `block-end` |
| `menu.content` | `block-end span-inline-end` |
| `menu.itemcontent` | `inline-end span-block-end` |
| `tour` card | `block-end` |

A consumer writes `.my-tip { position-area: inline-end }` outside any layer and
wins with no specificity fight. Anchor names, `anchor-scope` and `--ui-anchor`
are unchanged.

## Slider keeps its `side`, and it is not placement

`slider-types.ts` types `SliderSide = 'start' | 'end'` and documents
`slider.thumb`'s `side` as "which of the two values this thumb holds". It is the
identity of an endpoint on a two-value slider — the drag math, the value written
back and the `aria-valuenow` a reader announces all key off it — so it is
semantics, not geometry, and it stays. `slider.thumb` still writes `ui-side` for
the same reason, and the gallery's two `slider.thumb side=` uses stay too.

## Selector discriminators had to be re-picked

The compiled scope class is per module, so each `<style>` block's subject must be
structurally unique across the whole family. `ui-side` was carrying that job in
four families. Replacements:

- tooltip, popover, hovercard, tour: the surface is the module's only element
  carrying `overlay`; the root became `div:not([overlay])`.
- menu: both surfaces are `role="menu"`, and they differ only by position in the
  tree. The top surface takes `[role="menu"]`; a submenu is
  `[role^="menuitem"] [role="menu"]`, which is higher specificity and lands the
  inline-end default regardless of block order. The root is `div:not([role])` —
  the old `:not([ui-side])` half was redundant once every surface has a role.

`menu-anchor.ts` keeps `surfaceStyle()`: a context menu's pointer point is not
something CSS can know, so the two custom properties stay JavaScript's. Its doc
comment no longer claims a `position-area` is picked off an attribute.

## Rows that asserted `ui-side`

Each family now has one row asserting the layer default computes and that a
consumer's unlayered rule beats it. Two things worth knowing before touching
them:

- Chromium re-serialises logical `position-area` keywords in block-then-inline
  order and drops the axis word when it is unambiguous, so `block-end
  span-inline-end` reads back as `end span-end` and `inline-end span-block-end`
  as `span-end end`. The menu row asserts the serialised form and says so.
- Geometry rows still have to assert a placement static flow cannot produce, or
  they are false green. `tooltip/scenarios/reversed.tsrx` now has its own
  `reversed-content` testid so the suite's consumer sheet can put that one tip
  BELOW while every other tooltip row uses the `block-start` default above; the
  hovercard suite's sheet puts every card above, against the family's own
  `block-end` default. A popover row that also measured the override was
  dropped: `basic.tsrx` has no room above the trigger, so the browser keeps the
  surface on screen and the pixel assertion measured the overflow correction
  rather than the placement.

`popover/scenarios/sided.tsrx` is deleted — its whole subject was the prop. The
two-popovers-find-their-own-trigger claim it also carried moved onto the RTL row,
which now injects the `self-inline-*` recipe as consumer CSS. `tour`'s
`scenarios/side.tsrx` became `scenarios/placed.tsrx` with the same five steps and
no props.

## Left for someone else

`test-support/conformance.browser.ts` still lists `ui-side` under
`valuedAttributes` for tooltip, popover, hovercard, menu and tour. It is an
allow-list rather than a requirement, so the suite is green, but the four entries
that are not slider's are now stale. That file is outside this unit's contract.

## Verification

`pnpm typecheck`; the six-family `vp test --project ui` run (263 passed, 1
expected fail); `pnpm --filter @markless/ui api:check` after a re-extract;
`pnpm test:sr` (256 passed, 10 expected fail, 4 skipped); `vp lint
--deny-warnings`. The manifest lost 44 lines and gained 9: the only `side` left
in it is `slider.thumb`'s.
