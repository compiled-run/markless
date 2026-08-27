# An IDREF naming a handle a flippable arm binds: both original causes fixed, one new one found

Status: **partial**. The held branch merged onto the pilot tip cleanly. Both
failures the previous memo named are fixed and measured. Six of the eight
`handle-in-arm` rows are green, including both served-CLOSED rows end to end.
The two served-OPEN rows stay red on a cause that was not visible before, named
precisely below.

## What the previous memo guessed, and what the measurement actually said

The previous memo's cause (1) guessed that `MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING`
came from the IDREF sitting on a `<button>` DESCENDANT rather than on the widget
root, and proposed measuring whether the instance token is registered before a
descendant's attributes are read. **That guess was wrong, and the descendant is
irrelevant.** Probing the prerender evaluator with the seed map printed:

    [MXPROBE] eval Disclosure seeds= []

`Disclosure` received NO shared seeds at all — no widget-instance token under any
key. The real difference from the green `idref-per-instance` suite is not where
the IDREF sits; it is that `<Disclosure label="one" />` is placed with **no
children**, and `ssr-data/renderer.ts` gated the seed pass on having a projection:

    slot.projectionChunkId ? input.seedChild?.(slot, context) : undefined

A childless widget root therefore never learned which instance it was, so every
mint inside it threw. The IDREF on the button never threw — it is the *omission*
path, which tolerates a missing token by design.

## The three mechanism fixes

1. **`web/src/ssr-data/renderer.ts`** — the seed pass runs for a child-component
   slot whether or not it has a projection. `input.seedChild` is itself the
   demand gate (undefined on a page with no shared-seed pass), so a page without
   widget seeds still loads nothing. After this, the token lands per instance:
   `c0:` and `c1:`.

2. **`compiler/.../ssr-module.ts`** — the served twin had the same gate in two
   places, both fixed: the widget-instance registration and its seed case are no
   longer keyed on `projectionChunkId` (new `instanceOnlyEdgeIds`), and a
   childless root is added to the set that gets `sharedSeeds` forwarded into its
   own `renderSsr`. Without that second edit the seed map was computed and then
   thrown away. A childless root's case registers the instance and files the
   handle roster only — it does NOT run the root's seed block, because the child
   renders its own body and running it here would double the seed symbols.
   Gated on `mintsElementHandleId`: a module with no `element-handle-id` residue
   anywhere emits exactly the cases it emitted before, which is what keeps
   `emit-byte-equality`, `childless-part-detection` and `keyed-row-shared-seeds`
   byte-identical. All three went red without that gate and are green with it.

3. **`web/src/prerender/evaluator.ts` + new `web/src/ssr-data/branch-arm-idrefs.ts`** —
   the CSR twin pushed `{id, takenArm}` and nothing else, so a browser-rendered
   page had no `elementHandleIds`/`idrefSites` at all. It now resolves both from
   the same chunk data the served emitter reads, minting through the component's
   own `readResidue` so the id keeps one spelling.

## Two resume-side defects the fixes then exposed

- **The read arrived namespaced but offset.** The flip asks for
  `markless:element-handle-id|<handle>`, but the resume loader scopes a composed
  symbol's reads by PREPENDING the instance path, so it arrives as
  `c0:markless:element-handle-id|<handle>` and `startsWith` never matched. The
  answer now locates the namespace rather than requiring position 0.
- **The attribute was tied to the wrong thing.** It was written only when a pass
  filed handles and cleared on every range removal, so (a) a refresh that
  repaints the same arm cleared a correct attribute, and (b) the removal handler,
  which runs AFTER the flip, stripped what the incoming arm had just earned. It
  is now keyed on the painted ARM: `ProtocolBranchIdrefSite` carries `armIndex`,
  and one `syncBranchIdrefSites` runs at wire time, after each flip, and on range
  removal against the arm then painted.

The witness's `expectClosed` also asserted the panel was gone synchronously right
after the click; a flip is async, so it now polls exactly as `expectOpen` does.
That assertion only ever passed because nothing had flipped yet.

## What stays red, and why

The two served-OPEN rows fail on `aria-controls` being null. Measured cause:
`wireBranchRecord` never runs for that page — a probe on `wireBranches` printed
nothing, so the branch record is absent from the view payload entirely. With
`startOpen={true}` a compiler-known constant, the branch test has no live parent
route and the record is dropped at `web/src/fns/ssr.ts:1418`:

    if (decided && !contentDriven && !marklessSsrDecidedArmIsLive(branch, armRecords)) continue;

That file IS in this unit's contract, so the next attempt does not need a new
one; the question to answer first is whether `marklessSsrDecidedArmIsLive` should
count an arm holding an element() handle an IDREF names as live, or whether the
record should be kept whenever it carries `idrefSites`. The second is the smaller
change and matches the packet's rule that the attribute may be gained at resume.
This was not attempted: the unit was already past its turn budget when the drop
site was found.

## Verification as it stands

- `pnpm typecheck` — green.
- Browser pins — 13 of 14 files green, 58 of 60 rows: `idref-per-instance`,
  `root-idref`, `live-region-branch`, `composed-arm-boundary`, `seeded-write`,
  `demand-load-replay`, `seed-module-const` and the 4 older `handle-in-arm` rows
  all green. Only the 2 served-open rows red.
- `pnpm exec vp test packages/compiler/test packages/web/test packages/serializer/test` —
  2413 pass, 1 fail: `event-only-resume-closure` "keep static source closures
  lean". **Pre-existing on the merged tree, not caused here**: measured at 48728
  against a 20983 budget with this unit's changes stashed, 49589 with them. The
  merge of the pilot tip and the held branch was already 2.3x over that budget.
- `pnpm docs:errors:check` — 200 codes, in sync.
- ui menu/tour/popover/tabs/accordion — 254 pass, 2 expected fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

The served-open residual the previous memo recorded still holds and is unchanged:
the roster cannot promise an element the render has not decided on, so a
served-open page serves the trigger without `aria-controls` and is meant to gain
it at resume. That is exactly what the dropped branch record now prevents.
