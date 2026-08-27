# A childless widget root gets its instance at server render, and a served-open arm names its panel

Status: **complete**. `handle-in-arm` is 8 of 8; the three rows that were pinned
`test.fails` are now plain `test`. Two independent causes, both measured before
either was touched.

## Cause 1: the seed gate asked the wrong module

`mintsElementHandleId` in `packages/compiler/src/passes/public-render/ssr-module.ts`
scans **this module's own** chunks for an `element-handle-id` residue. A page
that writes `<Disclosure />` has no such slot of its own — the handles live in
`Disclosure`'s module — so the gate was false in the one module that has to
register the instance, `sharedSeeds` never travelled the root edge, and every
mint inside the child threw `MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING`.
A root placed WITH children escaped this because a projection opens the gate on
its own.

The composing module can answer the question after all, at compile time, without
importing the child's graph: `input.source.importedModuleInterfaces[importSource]`
publishes `sharedDefinitions`, and each entry carries its `scope` and its factory
`graphBindings`. A module declaring a widget-scoped family with an `element`
binding is one whose parts mint per-instance ids. That is the new gate term, per
edge, beside the existing module-local one.

The registration this opens is the same one a projecting root already emitted —
same token spelling (`idPrefix + rowSegment + symbolPrefix + childrenWidgetRoot`),
same runtime `marklessSsrWidgetRoots` guard, same per-family filing — so the
server and the CSR seed pass in `packages/web/src/fns/shared-seed.ts` still spell
one token. Nothing in web, the runtime or the serializer had to move.

### What it costs, measured

The same fixtures compiled with and without the change:

| compiled unit | before | after | delta |
| --- | --- | --- | --- |
| page composing two childless widget roots | 4,941 | 7,042 | +2,101 |
| page composing one childless plain child | 4,095 | 4,095 | **0** |
| the family module itself | 6,858 | 7,081 | +223 |
| a module with no handles at all | 3,201 | 3,201 | **0** |

The +2,101 is ~1,050 per composed root and is the whole seed case: instance
registration, per-family filing, the handle roster, and `sharedSeeds` on the
render call. A page that imports no widget-declaring module pays nothing,
because the interface says so at compile time rather than the marker saying so at
module load.

`emit-byte-equality` is green as written, and no baseline was moved. Its three
fixtures are pairwise comparisons, and no pair differs in whether it composes a
childless widget root: `roster-key-bytes` composes `<Item label="plain" />` in
the SAME module as the family, which the module-local gate already opened;
`barrel-alias-bytes` and `shared-return-shape-bytes` compile one page each, two
ways.

### The one gap left, stated

The gate reads the imported module's interface. A build that hands the compiler
no interface for an import falls back to the module-local term, exactly as
before. Such a build also cannot link the child's chunks, so this is not a new
blind spot — but it is why the term is "the interface says yes", not "the import
is unknown, so emit".

## Cause 2: the served-open IDREF, which was neither of the memo's candidates

`CSR served open` failed with `aria-controls` null and no throw. The previous
memo offered two candidates. Both were measured, and both are wrong:

- The branch record is NOT dropped. The served payload carries it whole:
  `idrefSites: [{hostNodeId:"c0:h1", attributeName:"aria-controls", ...}]`,
  `elementHandleIds` with the right minted id, `takenArm: 0`.
- `hostNodeId` DOES carry the composing parent's prefix. It is `c0:h1`, and the
  view's locators name `c0:h1` for that button. Nothing is missing there.

The real cause: **the attribute was never in the served markup, and resume is
demand-loaded.** Proof — a probe that clicks the toggle twice before reading:
`atRender: null`, `afterFlip: mx-c0-…panelEl`, `panelId: mx-c0-…panelEl`. The
resume half works perfectly. The row fails because it reads the attribute BEFORE
any gesture, and a served-open disclosure has to name its panel in the markup,
with no script run at all.

Why the render omitted it: a handle bound inside a flippable arm is deliberately
absent from the seed-time roster (`componentBoundElementHandles` skips arm host
ids) because the seed phase runs before the render picks an arm. The roster then
answers "no element", and the IDREF is omitted. That is right for the arm the
render did not take, and wrong for the one it did.

The fix asks the arm instead of the roster, in the one module that owns both the
IDREF and the branch that decides it. `armBoundIdrefHandles` collects the handles
an arm binds that an IDREF outside the arms names; the mint's omission test
becomes `(this handle's arm === the arm this render took) ?? the roster`. Both
emitters compile it from that one description — the server module and the client
residue reader — so the two sides cannot disagree, and `branchArmIndexSource` is
now the single spelling of "which arm" for both.

Cost: +223 bytes on the family module, +191 of it in the residue reader, and
zero anywhere else — a module with no arm-bound handle named by an IDREF supplies
no `armBoundRead` and emits exactly what it emitted before.

Limit, stated rather than hidden: the arm is asked only when the branch test is a
single graph read. The mint runs ahead of the render body's locals on the server
and has no body at all in the browser, so a test standing on an authored local
keeps the roster's answer and its served IDREF stays omitted until resume paints
the arm. No pinned lane exercises that shape.

## Verification

- `pnpm typecheck` — green.
- `pnpm exec vp test packages/compiler/test packages/web/test` — 315 files,
  2,381 pass, 1 expected fail. Includes `emit-byte-equality`,
  `childless-part-detection` and `event-only-resume-closure`.
- Browser, the eight pinned lanes — 12 files, 62 pass, 0 fail. `handle-in-arm`
  is 8 of 8 with no `test.fails` left in it.
- ui menu/tour/popover/tabs/accordion — 254 pass, 2 expected fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
