# Qualifying an element() registration to the enclosing widget instance

Fixed on the pilot tip. Witness `packages/vitest-browser/browser/enclosing-family-read/`,
now 20 rows, all green, CSR and SSR resume identical in every case. The two rows U654
marked DEFECT read the correct behaviour now:

| page | roster(s) read back | before |
| --- | --- | --- |
| two bars, knobs rooting their own family | `a,b,c` / `d,e` | `a,b,c,d,e` / `a,b,c,d,e` |
| one bar plus a knob outside it | `a,b` | `a,b,loose` |

## The cause is not what U654 named, and the axis it named was a coincidence

U654 concluded that "rooting a family of one's own is what loses the qualification",
because in `knob.tsrx` the knob that roots `knobState` merged its bar's roster and the
`Plain` part beside it, rooting nothing, did not.

That is an artifact of declaration order. `Knob` is declared FIRST in `knob.tsrx`, and
the module's first exported component is its render ROOT (`selectPublicRenderRoot`,
`packages/compiler/src/passes/public-render/template.ts`). Rooting a family of its own
had nothing to do with it.

Measured directly: a new module whose only component `Front` roots nothing, reads
`barState()` and binds `el={bar.itemEls}` merged two bars exactly the same way
(`a,b,c` / `a,b,c`). That page is now a permanent row in the witness as
`sole-part-two-bars-page.tsrx`.

## Where the qualification was actually lost

Not in the handle path at all. The registration was not unqualified — it was qualified
to the WRONG instance, and the raw-id fallback then merged everything.

Instrumented on the two-bar page, the knobs registered under
`c0:p1:…#barState/element:itemEls`, `c0:p2:…`, `c0:p3:…` — each knob's OWN instance
path — while the bars read `c0:…` and `c4:…`. Both bars missed and both fell back to the
one raw id holding all five knobs. With `Plain` parts the same page registered
`c0:…` and `c4:…` and every lookup hit.

The reason each knob answered with its own path: `marklessGraphWidgetRegistry` held
`c0:p1:shared:…#barState => c0:p1:` for every knob. Those entries come from
`marklessRegisterComposedWidgets` (`packages/web/src/fns/composition.ts`), which files a
child as a widget ROOT of a definition when the child's composed state carries that
definition's CELLS. Every knob carried a `barState` cell.

The cells came from `resolvePayloadNodeOwners`
(`packages/compiler/src/passes/public-render/shared.ts`). It resolved a page-space graph
node this way:

    widgetOwner.get(definitionId) ?? rootComponentName

`widgetRootComponents` only answers for widget families the module DECLARES, so an
imported family fell through to `rootComponentName` — the module's first exported
component. That component then owned `barState`'s nodes, and every rendered instance of
it composed as a second root of somebody else's family.

## The fix

Three changes, all in `packages/compiler/src/passes/public-render/`:

- `shared-seed-pass.ts` — new `adoptedWidgetDefinitionIds(input)`: the widget-scoped
  definitions whose id does not spell this module's filename, i.e. imported ones.
- `shared.ts` — `resolvePayloadNodeOwners` returns `undefined` for an adopted family's
  nodes instead of the module root, and `PayloadNodeOwners` now carries
  `string | undefined`. No component of the module claims them, so no rendered instance
  of any of them composes as a root of that family.
- `ssr-module.ts` and `component-definitions.ts` — both previously skipped the node
  partition entirely for a module with a single component (`sameModuleComponents.length
  === 0`, `componentNames.size > 1`). A single-component module that adopts a family
  needs the partition to exclude it, so both gates now also fire when
  `adoptedWidgetDefinitionIds(input).size > 0`. A module that adopts nothing emits no
  partition, exactly as before — that is the byte-equality guard, pinned in
  `packages/compiler/test/enclosing-registration/`.

Both the CSR prerender path (`stateCellIndexes`) and the SSR path
(`marklessSelectStateNodes`) read the same ownership answer, which is why CSR and SSR
resume moved together with no separate change.

Nothing in `packages/web/` changed. `marklessWidgetHandleId` and
`marklessInstanceScopedElementHandle` were already correct; they were being handed a
registry that lied.

## The page-wide fallback: measured, kept, and who needs it

The packet asked whether the raw-id fallback in `marklessInstanceScopedElementHandle`
can go. Measured by making a reader whose instance IS named refuse to fall back
(`if (scoped !== handleIdOrName) return getElementHandle(scoped);`):

- All five shipped families pass without it — togglegroup, menu, select, tree, navbar:
  315 passed, 1 skipped, no change.
- `nested-widget-outer-write`, `handler-instance-handle`, `root-idref`,
  `own-instance-handle`, `seeded-write`, `idref-per-instance`: all pass without it.
- `handle-in-arm` breaks: 4 rows, CSR and SSR, `expected 'unbound' to be 'bound'`.

So exactly one thing relies on it: **a handle bound inside a flippable `@if` arm**. The
arm's own registration is filed at resume by `resume-branches.ts`, which registers the
handle with the id the arm record carries and never qualifies it to the rendered
widget. Today the reader's fallback is what reunites them.

The fallback is therefore kept, and the follow-up is a separate unit: qualify the
arm-record handle registration in `packages/web/src/resume-branches.ts` (forbidden to
this unit), then the fallback can be dropped for widget-scoped ids whose reader resolved
to a rendered root. Until then, the fallback is only reachable when the READER itself
resolved to no instance, which after this fix is only true for a part standing outside
every instance of the family — and such a part now qualifies to nothing, so no bar reads
it.

## Is `barState.enclosing()` still needed?

**No, not for the toolbar/menubar shape.** Correct qualification already gives it.

A part outside every rendered instance of the family now qualifies to no instance
(`marklessWidgetHandleId` returns the id exactly as compiled — pinned in
`packages/web/test/enclosing-registration/widget-handle-qualification.test.ts`), and the
witness reads that back through the DOM: the loose knob is absent from the only bar's
roster, and its own family still works alone (`taps` 0 → 1). "Registers nowhere outside"
is the behaviour `.enclosing()` was going to buy.

What `.enclosing()` would still add is an EXPLICIT read — a part that wants to branch on
"am I inside a toolbar?" and render differently. That is a real but different capability,
and no family on the board needs it yet. Recommend leaving it unbuilt; if it is ever
built, `.enclosing()` remains the better name for the reasons U654 gave.

## Verification run

- `pnpm typecheck` — clean.
- browser: `enclosing-family-read` (20), plus `nested-widget-outer-write`,
  `handler-instance-handle`, `root-idref`, `own-instance-handle`, `seeded-write`,
  `idref-per-instance`, `handle-in-arm` — 11 files, 86 passed.
- `packages/compiler/test packages/web/test` — 319 files, 2417 passed, 1 expected fail.
- ui: togglegroup, menu, select, tree, navbar — 315 passed, 1 skipped.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
