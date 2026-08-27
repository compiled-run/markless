# own-instance-handle: the `pair` rows restated to the two-family shape

Status: green. `pnpm exec vp test --project browser packages/vitest-browser/browser/own-instance-handle`
runs 12 rows, all passing (CSR and SSR). `pnpm typecheck` and `pnpm exec vp lint --deny-warnings`
are clean.

## What the `pair` rows used to pin, and why it is refused by design

`pair.tsrx` had ONE widget family, `pairLevelState`, seeded by two parts: a root part
(`PairRoot`) and an item part (`PairItem`). The rows expected the root's surface and the item's
surface to be two instances of that one family.

The compiler roots a widget family at exactly one component per module — the first seeder in
declaration order. So `PairRoot` and `PairItem` did not get an instance each; they shared the one
instance the root established, and the two `PairContent` renders both bound the same compiled
handle id. The runtime reported it directly:

    RuntimeResumeError: pairLevelState/element:contentEl is registered by 2 rendered widgets

That is not a defect to fix — it is the one-root rule doing its job. The measurements behind it:

- `goals/headless-components/notes/U592-handler-instance-handle.md` — a handler on the part that
  binds a widget-scoped `element()` handle reaches its own instance's element, and what "its own
  instance" is decided by.
- `goals/headless-components/notes/U603-root-idref-renderer.md` — the root/idref renderer side of
  the same rule.

The rows sat red for days because they were asking the framework for a shape no family needs.

## What replaced it

The owner already resolved the case that motivated the old shape — a recursive menu, where the
root owns the top surface and every item owns the surface it may hold — with TWO families, in
`packages/headless/components/src/menu/menu.tsrx`:

- `menuState`, rooted by `menu.root` (declared first, so it is the seeder), carrying `contentEl`.
- `menuItemState`, rooted by every `menu.item`, carrying `itemContentEl`, so an item written
  inside another item's submenu gets an instance of its own.

`MenuContent` reads `menuState`'s handle; `MenuItemContent` reads `menuItemState`'s. Two content
parts, two families, no shared binding.

`pair.tsrx` now mirrors that exactly:

- `pairState` — rooted by `PairRoot`, read by `PairContent`.
- `pairLevelState` — rooted by every `PairItem`, read by `PairItemContent`.

Each content part binds and reads the `contentEl` of its own family and writes the `hits` of its
own family. `pair-page.tsrx` renders `PairRoot > PairContent > PairItem > PairItemContent`, so the
page holds one root-level surface and one item-level surface.

Deep item-on-item nesting is already pinned next door by `nest.tsrx` / `nest-page.tsrx`, whose
three `NestItem` levels each root their own `nestLevelState` instance. `pair` is the complement:
it pins that a ROOT-owned surface and an ITEM-owned surface are separate instances.

## The rows now

Four `pair` rows (was three — the cell behaviour gained its missing SSR twin, so both behaviours
are pinned in both render paths):

- CSR / SSR resume: the root family and the item family each reach their own element. Clicking the
  inner content stamps `data-clicked` on the inner element only; the root's surface stays unmarked.
- CSR / SSR resume: the root family and the item family are two instances. Clicking the inner
  content raises the item's `data-hits` to 1 and leaves the root's at 0.

The `nest` rows (6) and the `outside` rows (2) are untouched.

## Rule to carry forward

"A root part and an item part both seeding one widget family" is not a shape to reach for. When a
root owns a surface and each item owns one, that is two families — one rooted by the root, one
rooted by every item — and one content part per family. A family that needs a second root is a
design error at the family, not a gap in the framework.
