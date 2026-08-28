# Who owns an adopted widget family's nodes

The element()-handle proxy is gone. Ownership now splits by what the record IS,
not by what the family carries:

- **Cells are the family's instance identity.** The runtime reads "this
  component roots that family" off the CELLS a composed child owns —
  `marklessRegisterComposedWidgets` (`web/src/fns/composition.ts`) and
  `widgetRootsOf` (`web/src/prerender/children-projection.ts`) both test cells
  and nothing else. An adopting component that owns one composes as a second
  root beside the instance it meant to read, and the two element() rosters
  merge. So an adopter owns no cell of an imported family — U656's rule, now
  applied to every imported widget family again, handle or no handle.
- **A computed record carries no identity.** Nothing infers rooting from it.
  Unowning it was collateral damage: with no record anywhere, an outermost
  adopter's chain never re-derives (U667). So an adopted family's computed
  travels with the components that RENDER it — `componentOwnedStateNodes` in
  `public-render/shared.ts` adds an adopted computed the component's own read
  closure reaches.

The two build-time halves are pinned in
`packages/compiler/test/adopted-ownership/adopted-computed-records.test.ts`; the
runtime half — a payload owning only the computed roots no widget — in
`packages/web/test/adopted-ownership/widget-root-reads-cells.test.ts`.

## The witness, measured before the change

New: `packages/vitest-browser/browser/adopted-family-derives/` — 14 rows, CSR
and SSR. The family (`family/gauge.tsrx`) carries BOTH an `element()` handle and
a factory computed over one of its own cells; `Panel` roots it; `part.tsrx`
adopts it and its parts bind the computed and write the cell.

On the tip (proxy in place), 6 rows were red:

| page | tip | now |
| --- | --- | --- |
| outermost page resolves the family itself, writes its cell | `QUIET`, never `LOUDER` | green |
| outermost adopting PART, nothing enclosing it | `QUIET`, never `LOUDER` | green |
| adopting part inside a rooted `Panel` | green | green |
| two `Panel`s, separate derives | green | green |
| two `Panel`s, separate rosters (`a,b` / `c`) | `undefined` / `undefined` | green |
| one `Panel`, roster of its adopting parts | `undefined` | green |

The proxy's hole is the first two rows exactly as U667 predicted: a family that
carries a handle AND is adopted by an outermost render was adopted by the proxy,
so nobody owned its nodes and the derive chain was dead.

The roster rows are a second finding, not part of the hole: they were red
because the family module declared **one** component. With a single component
and nothing adopted, the module emits no node partition at all, and the roster
came back `undefined` for every instance. Adding a second component to the
family module (`PanelMark`, now the same-module control in the witness) turned
those rows green on the tip, before any source change. That is a separate defect
in the no-partition fallback path and it is not fixed here — the witness only
avoids standing on it.

## Why not the marker rule the packet named

`marklessWidgetRoots` / `marklessChildrenWidgetRoot` / the `rootsWidget` gate
answer "which families does this component root", and that answer is already
what CELL ownership encodes: `widgetRootDefinitionIds` is `widgetRootComponents`
in another spelling, and both runtime root detectors read the cells. Routing
ownership through the markers would restate the answer the cells already give.

The part the markers cannot give is the one the packet wanted them for: whether
an ENCLOSING instance roots this family is a render-time fact about the page
that composes the part, and the part's own record is compiled once for every
page. Making the record conditional on the render would mean the consumer that
picks cells per instance — `ownedStateCells` in `web/src/prerender/evaluator.ts`
and its SSR twin — choosing a second index set at render time. That file is
outside this unit's contract, and it turned out not to be needed: the derive
chain never depended on rooting, only on a record existing. Nothing on the board
needs an adopter to own a family's CELLS.

Residual, for whoever picks it up: which component gets the computed follows the
READ, so a component that neither renders the value nor is the instance root
carries no record. A handler that reads an adopted computed no markup binds is
therefore unserved; no family on the board does that today, and
`sibling-computed`'s handler row passes because the same page also binds the
value. The discriminator is pinned: with ownership handed to the module's first
export instead of the reader, the two `not its module's first export` rows go
red (measured).

## Bytes

`emit-byte-equality` is unchanged, and the U656 pin that a single-component
module adopting nothing emits no partition still holds — a page that adopts
nothing moves no byte.

A page that DOES adopt moves, measured on a one-cell one-computed family:

| adopted family | tip | now | delta |
| --- | --- | --- | --- |
| carries an `element()` handle | 2869 | 2870 | +1 byte (`stateComputedIndexes: [0]` instead of `[]`) |
| carries no handle | 2569 | 2618 | +49 bytes (the partition returns, as under U656) |

The 49 bytes are U656's own cost, which the proxy had been waiving for
handle-less families in exchange for the dead derive chain.

## Verification run

- `pnpm typecheck` — clean.
- browser: `adopted-family-derives` (14), `foreign-scope`, `sibling-computed`,
  `enclosing-family-read` (20), `nested-widget-outer-write`, `handle-in-arm`,
  `own-instance-handle`, `idref-per-instance`, `root-idref`, `seeded-write` —
  104 passed (15 files).
- `packages/compiler/test packages/web/test` — 326 files, 2456 passed, 1 expected fail.
- ui: menu, toolbar, togglegroup, select, tree, tour — 374 passed, 1 skipped.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
