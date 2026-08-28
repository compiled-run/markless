# Registering the drawer family

The drawer landed as a family with no way to reach it: the barrel did not export it, the package
export map had no `./drawer`, the api manifest did not describe it, the sr-gallery served no section
for it, and no CI reader lane ran it. This wires all of that up. No drawer behaviour changed.

## What now carries `drawer`

- `src/index.ts` — `export * as drawer from './drawer/index.ts'`, between `datebox` and `fileupload`.
- `package.json` — `"./drawer": "./src/drawer/index.ts"`, in the same slot.
- `api/manifest.json` — regenerated with `api:extract`; `api:check` passes.
- `apps/sr-gallery/preview-server.ts` — `drawer: '/#drawer'` in `FAMILY_ANCHORS`.
- `apps/sr-gallery/src/Gallery.tsrx` — a `#drawer` section carrying three shapes.
- `apps/sr-gallery/scripts/boot-check.ts` — a rendered role, a count, and four rows.
- `.github/workflows/screen-reader.yml` — the virtual, NVDA and VoiceOver matrices.

The scenarios moved from `import * as drawer from '../index.ts'` to the consumer form
`import { drawer } from '../../index.ts'` now that the barrel carries the family, and
`drawer-transcript.ts` reads `FAMILY_ANCHORS.drawer` instead of spelling `/#drawer` itself. Both were
placeholders the family shipped with, called out in its own note as waiting on this work.

## Still outstanding: the conformance descriptor

The conformance battery in `test-support/` does not describe the drawer. That file belongs to another
unit in flight, so this work stayed out of it and a follow-up adds the descriptor. `note.md`'s
registration entry says so rather than claiming registration is finished.

## The gallery section is three shapes, and why

The `#drawer` section serves the plain drawer, the snapped one (`snapPoints={[0.5, 1]}`,
`defaultSnapPoint={0.5}`), and the nested pair. The snapped shape is there because the claim a real
reader settles for this family is that a surface resting half open announces exactly what a fully
open one does; the nested pair is there because the inner root is its own widget instance rather than
a second root part, and a mis-rooted instance is the failure that would otherwise go unseen.

Like `#modal`, the section carries no classes. The gallery adds a class only where a family ships a
surface it places but does not paint (`menu-surface`, `card`, `tip`); a vertical drawer's default CSS
is `inset-inline: 0; inset-block: auto 0`, so it takes its size from its content and needs no
consumer rule. The family's own scenarios size a child element because their gesture arithmetic
needs a measurable surface — the gallery does not.

## The backdrop count is four, not three

The first draft of the backdrop row asserted three backdrops, one per scenario, and the boot-check
caught it: the nested shape has two roots, so the section mounts four. This was found by running
`SR_GALLERY_PORT=4337 node apps/sr-gallery/scripts/boot-check.ts`, which is not in the unit's verify
list — the four verify commands all passed while that row was still wrong, because none of them boots
the gallery. Worth knowing for the next family: registration work can pass its own verification and
still leave a red boot-check behind.

## The manifest regeneration also corrected stale toaster output

`api:extract` removed an `index` prop from the toaster's `toast` part alongside adding the drawer's.
That prop is not in the toaster source — the value moved into `stackingStyle()` in
`toaster-queue.ts` — so the checked-in manifest had been stale since that change landed without a
regen. The removal is the extractor catching up, not a drawer side effect.

## Verification

`pnpm typecheck`, `pnpm --filter @markless/ui api:check` (3 passed) and `pnpm exec vitest run
--project ui packages/headless/components/src/drawer` (64 passed) all pass, as does the gallery
boot-check above.

`pnpm test:sr` is green except for one row that is red without this work:
`src/radio-group/radio-group.sr.ts > arrowing to the next option moves the reader onto that option`,
which fails on `expected [ 'role "radio"' ] to deeply equal []` after its poll times out. It passed
on the first run here and failed on the three after it. Because the radio-group scenarios import the
barrel this work edits, there was a real causal path worth ruling out, so the suite was run on the
stashed tree at the pilot tip: it fails there too, same test, same message, same
`1 failed | 297 passed | 10 expected fail | 4 skipped`. Pre-existing flake on this machine, not a
drawer regression. Whoever owns that row should know it is intermittent rather than reliably green.

The two real-reader matrices were added on the evidence that `drawer.nvda.ts` and
`drawer.voiceover.ts` exist, which is the rule those lists state. Neither reader lane was run here:
real-reader lanes need a VM or a CI runner, not a desktop.
