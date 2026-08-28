# Registering the editable family

The editable family merged with no way for a consumer to reach it and no lane that read it on a real
page: the barrel had no export, the package export map had no entry, the conformance battery had no
descriptor, the sr-gallery served no section, and none of the three CI reader matrices carried the
name. This wires all of that up. No editable behaviour changed.

## What now carries `editable`

- `src/index.ts` — `export * as editable from './editable/index.ts'`, between `drawer` and
  `fileupload`.
- `package.json` — `"./editable": "./src/editable/index.ts"`, in the same slot.
- `api/manifest.json` — regenerated with `api:extract`; the file did not change. The pilot tip
  (a473805a) had already regenerated it, and the extractor names a family folder it finds without a
  barrel export by its folder name — which for this family is the same word the barrel export now
  gives it. `api:check` passes (3 rows).
- `test-support/conformance.browser.ts` — an `editable` descriptor; 12 rows green, no exemptions.
- `apps/sr-gallery/preview-server.ts` — `editable: '/#editable'` in `FAMILY_ANCHORS`.
- `apps/sr-gallery/src/Gallery.tsrx` — a `#editable` section carrying three shapes.
- `apps/sr-gallery/scripts/boot-check.ts` — a rendered role, a count, and three rows.
- `.github/workflows/screen-reader.yml` — the virtual, NVDA and VoiceOver matrices.

The scenarios moved from `import * as editable from '../index.ts'` to the consumer form
`import { editable } from '../../index.ts'`, and `editable-transcript.ts` reads
`FAMILY_ANCHORS.editable` instead of the `EDITABLE_ANCHOR` literal the family shipped with; its two
reader lanes import the anchor from the same place. All three were placeholders the family's own
note called out as waiting on this work; that note now says registered.

## The descriptor: a form-field family, not an open cycle

Modelled on `textbox` and `numberbox` rather than on anything with an `openCycle`. Preview and edit
are the same room, swapped by the `hidden` attribute on two elements that are both always in the
DOM. There is no surface a trigger reports through `aria-expanded`, nothing carrying `ui-open`, and
nothing to dismiss — so the six rows an `openCycle` adds (trigger-aria, focus-land, focus-return,
the two dismissals, parts-when-open) do not apply and are absent rather than exempted.

`rootAria` is `{ role: 'group', 'aria-disabled': null }`. The `null` is a fact, not a gap: the box's
`aria-disabled` is a computed that returns `undefined` when the family is not disabled, so the
attribute is absent from an enabled root. `datebox` writes `'false'` in the same slot; this family
does not, and the descriptor records which.

`valuedAttributes` is `['ui-value']`, from the battery run rather than from reading the source:
`ui-editing`, `ui-disabled`, `ui-readonly`, `ui-required`, `ui-invalid` on the root and `ui-empty`,
`ui-readonly` on the preview are all presence marks and pass the spelling row untouched.

`parts` is `['root', 'label', 'trigger', 'input', 'field']` — everything the Basic scenario renders
at rest, `hidden` elements included, since the battery resolves parts by `data-testid` against the
DOM and not against visibility.

## Where the section sits, and why it is not alphabetical

`#editable` is served immediately after `#buttongroup`. That position is load-bearing:
`buttongroup-transcript.ts` walks to the first `role="group"` on the page **by role alone**, and an
editable root is a `role="group"` too. A section placed anywhere before `#buttongroup` would leave
the buttongroup real-reader lane announcing "Document name" and failing its first assertion.

This is the third family to hit the shared-page problem (`rating-group` hit it against
`radio-group`). Two role-only walks are still live and only safe by document order:
`buttongroup-transcript.ts` on `role: 'group'` and `radio-group-transcript.ts` on
`role: 'radiogroup'`. `crop` and `crop-image` also serve `role="group"` and sit after
`#buttongroup`, so the same ordering constraint already existed before this unit; editable joins it
rather than creating it.

## The gallery serves three shapes

`#editable` serves the starter (`name="title" defaultValue="Quarterly plan"`, label "Document
name", with the hidden form field), the double-click one (`editOnDoubleClick`, "notes.md", label
"File name") and the read-only one (`readonly`, "published", label "Published name") — the basic,
double-click and read-only shapes the packet named.

All three are uncontrolled. The gallery is consumer code with no state object of its own for this
family, and uncontrolled is the shape whose commit path the boot-check row below can actually
observe: an uncontrolled commit updates the preview from the family's own held value, with nothing
outside the family to write back.

`RENDERED_ROLE.editable` is `group` rather than `button` or `textbox`, because the group is the one
element per shape that is always in the tree in both modes — `RENDERED_COUNT.editable` of 3 then
catches a section that rendered the starter and lost a shape.

## The boot-check rows mutate the page, so they run last

Three rows, in order: the preview is a button named by the value it holds; pressing it reveals a
field named by the label; typing and pressing Enter puts the new words back on the preview. The
third commits `Annual plan` over `Quarterly plan`, which changes what the page serves — so these
rows sit after every other check in the file, below the `rating-group` block.

Both reveal checks go through a `showed()` helper that wraps `waitFor({ state: 'visible' })` in a
try/catch. A bare `isVisible()` resolves against the DOM as it stands and would race the family's
own write; `waitFor` is the wait the reveal actually needs.

## Verification

`pnpm typecheck`, `pnpm typecheck:sr` and `pnpm typecheck:sr-real` are clean.
`pnpm --filter @markless/ui api:check` passes (3 rows).
`pnpm exec vitest run --project ui packages/headless/components/src/editable
packages/headless/components/test-support/conformance.browser.ts -t "editable"` — 25 passed.
The conformance rows alone were confirmed at 12 green with no `test.fails` among them, and the full
`editable.browser.ts` suite was run without the name filter too, because the filter would have
hidden a scenario-import regression: 63 passed.
`pnpm test:sr` — 40 files, 315 passed, 10 expected fail, 4 skipped.
`SR_GALLERY_PORT=4337 node apps/sr-gallery/scripts/boot-check.ts` — green, with the four new lines:

```
#editable serves the editable family: 3 role="group" element(s)
#editable serves a preview button named by the value it holds.
#editable opens a session on the field its label names.
#editable commits on Enter and reads the new words back on its preview.
```

The two real-reader matrices were added on the evidence that `editable.nvda.ts` and
`editable.voiceover.ts` exist, which is the rule those lists state. Neither reader lane was run
here: real-reader lanes need a VM or a CI runner, not a desktop.

## Still open

`apps/sr-gallery/README.md` carries a hand-maintained table of sections and anchors that stopped
being updated some families ago: it lists eighteen sections against the thirty-three
`FAMILY_ANCHORS` now serves, missing `rating-group`, `buttongroup`, `numberbox` and its two extra
shapes, `calendar`, `menubar`, `ink`, `pad`, `crop`, `crop-image`, `tour`, `toolbar` and `drawer` as
well as `editable`. Adding one row to a table missing thirteen would make it look current when it is
not, so it was left alone. Either regenerate that table from `FAMILY_ANCHORS` or delete it and point
at `preview-server.ts`; a hand-copied list of a machine-readable constant will keep drifting.


`WALK_LIMIT` in `editable-transcript.ts` is 200 steps from the top of web content. `#editable` is
now the twenty-third section on a gallery page of thirty-three, which is further into the document
than any family that has had its real-reader lane run. Whether 200 is enough to reach it is
unmeasured — it needs a CI runner to settle, and if the lane times out short of the preview button
the limit is the first thing to raise.
