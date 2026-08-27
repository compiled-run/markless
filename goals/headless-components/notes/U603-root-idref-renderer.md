# A widget root's own element mints from its own instance: the renderer half

Status: **done**. The four-line change the previous memo
(`U599-root-idref.md`) measured and could not apply is applied, the nested rows
in the browser witness are green on CSR and on SSR resume, and the one pinned
compiler row that the lifted refusal made false is retired.

## The change

`packages/web/src/ssr-data/renderer.ts` — `rootEdgeSeeds` now restores only the
plain fallback instance key onto the widget root's own render, instead of every
key that starts with it:

```ts
	for (const [key, enclosing] of inherited ?? []) {
		if (key !== MARKLESS_WIDGET_INSTANCE_KEY) continue;
		if (enclosing === undefined || enclosing === childSeeds.get(key)) continue;
		(restored ??= new Map(childSeeds)).set(key, enclosing);
	}
```

Nothing else moved: no new seed key, no new constant, no compiler emit change.
The doc comment above the function was rewritten to say what the function now
does, and the stale in-body comment justifying the prefix match is gone.

Why the plain key alone is the whole rule, restated from the measurement in the
previous memo and re-checked against the seed writers:

- A per-definition key `markless:widget-instance|<definitionId>` is written by
  the seed pass only for a family the placed child ROOTS
  (`packages/web/src/fns/shared-seed.ts:53-66`, and its compiled twin
  `packages/compiler/src/passes/public-render/ssr-module.ts:755-772`). So every
  per-definition key that would have been restored names a family this child
  roots — exactly the case whose own element must mint from its own token.
  Skipping all of them equals skipping only the rooted ones.
- A family the child does not root already satisfies
  `enclosing === childSeeds.get(key)` and was never restored, so nothing moves.
- The plain key still returns to the enclosing widget, so a handle of a family
  with no per-definition token behaves as before. `widgetInstanceReadSource`
  (`packages/compiler/src/passes/public-render/residue-reader.ts:180`) asks the
  per-definition key first and falls back to the plain one, so the precise
  answer wins where it exists and the fallback covers the rest.

`packages/compiler/test/semantic-idref-handles.test.ts` — the row `the widget
root itself cannot be named by an IDREF` (was at line 550) is deleted. The
refusal it pinned no longer fires for a `{ scope: 'widget' }` factory, and the
positive behaviour it used to guard is now covered by
`packages/compiler/test/root-idref/root-idref.test.ts`. The other 25 rows in the
file are untouched and green; the `statics` helper it used is still used by five
surviving rows.

## Measurements, all on this branch after the change

- `pnpm typecheck` — green.
- `pnpm exec vp test packages/compiler/test packages/web/test` — 288 files,
  2240 passed, 1 expected fail.
- `--project browser root-idref` — 4 passed, both nested rows included:

  ```
  ✓ CSR: each root controls its own panel and each panel names its own root
  ✓ SSR resume: each root controls its own panel and each panel names its own root
  ✓ CSR: a nested instance inside a panel resolves to its own
  ✓ SSR resume: a nested instance inside a panel resolves to its own
  ```

  Before the change these last two failed with the nested root's own element
  minting `mx-c0-…rootEl` — the same id as the instance enclosing it — while its
  panel minted `mx-c0-p1-p2-…panelEl`.

- `--project browser` nested-widget-outer-write, handler-instance-handle,
  tour-gates — green.
- `--project ui` accordion, tabs, select, menu, tour — 258 passed, 2 expected
  fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

## The known-red rows, unchanged

`--project browser own-instance-handle` — 3 failed, 8 passed:

```
× CSR: a root-seeded level and an item-seeded level each reach their own element
× SSR resume: a root-seeded level and an item-seeded level each reach their own element
× CSR: a root-seeded level and an item-seeded level are two instances
```

These are the `pair` rows the previous memo reported red. I measured the
baseline rather than assuming it: with the renderer edit stashed and everything
else on this branch in place, the same three rows fail with the same
`RuntimeResumeError: Element handle …#pairLevelState/element:contentEl is
registered by 2 rendered widgets on this page, and the reading handler named no
instance.` The change neither fixes nor worsens them; they belong to whoever
owns `own-instance-handle`.

## What this unblocks

Both attributes the `menu.item` > `menu.itemcontent` ruling asks for now compile
AND resolve per instance at every depth: `aria-controls={item.itemContentEl}` on
the item and `aria-labelledby={item.itemEl}` on the itemcontent. The compiler
wall that forced the `menu.itemlabel` part onto the family, and forced
`aria-controls` to be dropped on a nesting item, is gone in both halves — the
two owner decisions the U596 memo raised can be reopened on the merits.

One follow-up is left over from the compiler half and is still not done here:
`MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`'s diagnostic message still carries
the widget-root wording alongside the surviving page-wide-factory clause.
Narrowing it means regenerating the docs page through
`scripts/diagnostics-catalogue.mjs`, which writes files outside this contract.
