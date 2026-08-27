# An IDREF naming a handle a flippable arm binds: the mechanism, landed but not green

Status: **partial**. The mechanism is in the tree and the compiler row is green;
the browser witness is red on two distinct causes, both named below. Nothing here
is a guess about design — the shape was measured against the tip — but the last
two failures were not diagnosed before the clock ran out.

## What the packet got right, and the one thing it got wrong

The packet said the resolved ids should land in `protocol-view.ts` arm records.
That file is `packages/compiler/src/passes/protocol-view.ts`, **not** in the file
contract, and it is also the wrong place: it runs at COMPILE time, and the id is
`idPrefix + handle` where the prefix is the rendered widget's instance token — a
seed-map value that only exists at RENDER time. So the resolution cannot be a
compile-time field at all. It is served, per rendered instance, from the render.

The in-contract route that does work:

- `packages/compiler/src/passes/public-render/ssr-module.ts` already pushes one
  record per rendered branch: `marklessSsrBranches.push({id, takenArm})`. That
  push runs inside the render scope, where `marklessSsrRenderStateValues` holds
  the token, and it is per instance because the id it pushes is the
  instance-scoped `marklessSsrDataSlot.branchSiteId`.
- `marklessSsrMergeBranches` in `packages/web/src/fns/ssr.ts` merges that push
  onto the composed view's branch record, after composition, so the record the
  resume runtime reads carries whatever the render resolved.

## What landed

- **`packages/serializer/src/protocol.ts`** — `PROTOCOL_ELEMENT_HANDLE_ID_READ_PREFIX`,
  `ProtocolBranchIdrefSite`, and two optional branch fields: `elementHandleIds`
  (handle graph node id → the id THIS render minted) and `idrefSites` (the IDREF
  positions outside the arms that name one of those handles). Both absent unless
  a branch's arms bind a handle an IDREF names, so arm-less pages serve identical
  bytes by construction.
- **`symbol-modules.ts`** — the refusal is lifted for the id-CARRYING side
  (`element-handle-id` residue with `idref !== true`, `alwaysPresent`), which is
  the only side that mints unconditionally. The arm part it pushes is an ordinary
  `read` part under the new prefix, deliberately: `PublicRenderPlanBranchArmPart`
  lives in `artifacts.ts`, outside this contract, so a new part KIND was not
  available — and routing through the read channel the value parts already use
  needs no emitter change at all. An IDREF-position residue INSIDE an arm stays
  refused; it can be omitted, and arms have no attribute-presence machinery yet.
- **`resume-branches.ts`** — `armElementHandleIdGraph` answers that read off
  `branch.elementHandleIds`, so the flip never respells the mint. Plus
  `writeBranchIdrefSites` on arm materialize and `clearBranchIdrefSites` on
  range removal: the outside `aria-controls` follows the arm.
- **`public-render/shared-seed-pass.ts`** — `componentBoundElementHandles` now
  skips a binding whose host sits inside a branch arm chunk. This is the single
  render-time roster source for BOTH renderers (the compiled marker line and the
  CSR twin's `definition.boundElementHandles`), which is why one edit covers CSR
  and SSR. Consequence: the IDREF is omitted at render and gained at resume, even
  on a served-open page. That is a deliberate narrowing of the packet's ask —
  see "open" below.
- **`packages/compiler/test/handle-in-arm/`** — the refusal row is replaced by a
  row pinning that the case compiles and the flip module carries the minted-id
  read. Green.
- **`packages/vitest-browser/browser/handle-in-arm/idref-in-arm*.tsrx|.test.ts`** —
  the witness: two `Disclosure` instances, `aria-controls` on the trigger, panel
  inside `@if (open)`, rows for served-closed and served-open, CSR and SSR resume,
  plus the `danglingIdrefs` bar (the `aria-valid-attr-value` stand-in the
  `idref-per-instance` suite already uses).

## The two failures a next attempt starts from

Run: `pnpm exec vp test --project browser packages/vitest-browser/browser/handle-in-arm/idref-in-arm.test.ts`

1. **Served-open, three rows**: `MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING`
   for `panelEl`, thrown from the mint inside the prerender evaluator
   (`web/src/ssr-data/renderer.ts` `renderSlot` → `readResidue`). The family now
   binds `el={panel.rootEl}` on its root exactly as `idref-per-instance.tsrx`
   does, and that suite is green, so the difference is NOT the missing root
   binding. The untested suspicion: in the pinned suite the IDREF sits on the
   root element itself, and here it sits on a `<button>` DESCENDANT of the root —
   so the question to answer first is whether the widget-instance token is
   registered before a descendant's attributes are read, or only before the
   root's own. That is one measurement, not a redesign.
2. **CSR served closed, one row**: the panel never appears after the toggle
   (`expected null not to be null`), so the flip itself did not paint. Check the
   arm HTML the branch-update symbol returned — most likely the minted-id read
   answered `undefined` (branch record carried no `elementHandleIds`, i.e. the
   push's `idrefSitesNaming` matched no host) and the arm was then rejected or
   painted with `id=""`. `idrefSitesNaming` matches a slot to a host by comparing
   `slot.coordinate.path` to `host.coordinate.path`; if attribute slots on a host
   do not carry the host's own path, that match silently finds nothing and both
   fields are dropped. Verify that path convention before anything else.

## Open, and owner-facing

Served-open pages now serve the trigger WITHOUT `aria-controls` and gain it at
resume, because the roster cannot promise an element the render has not decided
on yet. The packet asked for the attribute present in served-open HTML. Getting
that needs the roster to be arm-aware at SEED time, and the seed pass that files
a placed child's handles runs in the PARENT module, which cannot spell the
child's branch test. The route, if it is wanted: emit a delete of the roster
entry in the branch-owning module's own render prelude, where `branchArmSources`
already proves the test is readable. That is a separate unit.

Nothing was measured about `MARKLESS_ELEMENT_HANDLE_DUPLICATE` or the two-arm
ruling; U626's memo still stands there.
