# `ink` is registered everywhere, and one scenario stopped compiling

The family is now wired into every site `tour` is wired into, and every one of
those is measured green. One thing is red and it is not a registration site:
`src/ink/scenarios/signature.tsrx` stops compiling the moment `ink` joins the
root barrel. That file is outside this unit's file contract, so the unit stops
here rather than editing it.

## What landed

| site | what was added |
| --- | --- |
| `src/index.ts` | `export * as ink from './ink/index.ts';` |
| `package.json` | `"./ink": "./src/ink/index.ts"` |
| `test-support/conformance.browser.ts` | the `ink` descriptor, CSR + SSR |
| `api/manifest.json` | regenerated: 7 parts, 10 root props |
| `apps/sr-gallery/preview-server.ts` | `FAMILY_ANCHORS.ink` |
| `apps/sr-gallery/src/Gallery.tsrx` | the `#ink` section: the plain drawing and the signature pad |
| `apps/sr-gallery/src/styles.css` | `.ink-surface` — the size and colour the family does not ship |
| `apps/sr-gallery/scripts/boot-check.ts` | `role="img"`, a count of 2, the live output, the required field |
| `src/ink/ink-transcript.ts` | `INK_ANCHOR` now reads `FAMILY_ANCHORS.ink` |
| `.github/workflows/screen-reader.yml` | `ink` in the virtual, NVDA and VoiceOver matrices |

## The conformance descriptor

Parts `root label description area field`; `rootAria: { role: null }`; no
`valuedAttributes` — every `ui-*` this family writes is a presence attribute.

No `openCycle`, and the reason is not the tour's. The tour has no trigger part;
`ink` has no surface that opens at all. The `role="img"` area is on the page from
the first paint, so a click-a-trigger cycle has nothing of the family's own to
click. The area is still a tab stop, which is how undo and redo are reached.

Twelve rows, six per mode, all green — parts, root aria, idrefs, presence
spelling, the tab walk and axe over `wcag2a` + `wcag21a`.

The battery exposed no family defect. The one failure below is a build failure in
a scenario, not a conformance gap.

## The gallery section

`#ink` serves two drawings, because the family's WCAG 1.1.1 position needs both
of them visible: the plain pad, and the signature pad whose typed-name textbox is
the text equivalent a drawn scrawl cannot carry. The boot check proves three
things beyond the role count, because a drawing has no value a reader can read
back:

```
#ink serves the ink family: 2 role="img" element(s)
#ink serves a live stroke count per drawing, reading "Empty" at rest.
#ink mounts the required field that submits the signature.
```

`ink-transcript.ts` needed one change beyond the anchor. It located the live
count as `section.locator('output[aria-live]')`, which is two elements now that
the section serves two drawings. It reads the last id out of the area's own
`aria-describedby` instead — the area names its error, then its description, then
the count — so it is scoped to the drawing it just walked to rather than to
whichever output happens to come first.

## The failure: a scenario that names the family through two barrels

`vp test --project ui packages/headless/components/src/ink` is red. Six
`MARKLESS_COMPONENT_TAG_UNRESOLVED` errors, one per part, all in
`src/ink/scenarios/signature.tsrx`:

```
MARKLESS_COMPONENT_TAG_UNRESOLVED: Cannot resolve `<ink.root />` because
`../index.ts` does not export a component named `root`.
(src/ink/scenarios/signature.tsrx:12:4)
```

`src/ink/index.ts` does export `root`, and did before this unit. What changed is
that `src/index.ts` now re-exports the same module.

Measured, not inferred:

- With `export * as ink from './ink/index.ts'` removed from `src/index.ts` and
  nothing else changed, the family's own suite is **59 passed**.
- With that one line restored, the suite fails to import at all: signature.tsrx
  blocks the build and takes `ink.browser.ts` down with it.
- The conformance battery is **438 passed** either way, including all twelve
  `ink` rows. `basic.tsrx` names the family through `../index.ts` alone and is
  unaffected.

The shape that breaks is a module naming one family through its folder barrel and
another family through the root barrel that now also re-exports the first:

```tsx
import * as ink from '../index.ts';        // src/ink/index.ts
import { textbox } from '../../index.ts';  // src/index.ts, which now re-exports ink
```

`signature.tsrx` is the only scenario in the package with that shape — checked by
reading every `src/*/scenarios/*.tsrx` for both import specifiers, one file
matched. So there is no working precedent to copy, and no other family is at risk
of this today.

## What this unit did not do

Two remedies exist and both are outside the file contract:

1. Point `signature.tsrx` at `../../textbox/index.ts` instead of the root barrel,
   which is a one-line change to a file this unit may not touch.
2. Fix the resolver so a family reached through two aliases of the same module
   still serves its components, which is a bundler change and a different unit.

Rewriting `src/index.ts` to export the family's `.tsrx` directly was rejected
rather than left unconsidered: it would drop `lastPath`, `withoutLast` and the
prop types from the published namespace and would be the only family registered
that way.

## Verification as it stands

| command | result |
| --- | --- |
| `pnpm typecheck` | green |
| `pnpm typecheck:sr-real` | green |
| `pnpm exec vp test --project ui .../test-support` | 438 passed |
| `pnpm exec vp test --project ui .../src/ink` | **red** — signature.tsrx, above |
| `pnpm --filter @markless/ui api:check` | 3 passed |
| `pnpm --filter markless-sr-gallery build` | green |
| `SR_GALLERY_PORT=4391 ... boot-check` | green, every family |
| `pnpm exec vp lint --deny-warnings` | 0 warnings, 0 errors |

Port 4391 was held by an orphaned vite dev server from another worktree
(`agent-ac262b2c354a83b2c`, started 25 hours earlier, reparented to init). The
boot check's own squatter guard named it and the process was killed before the
run, which is the remedy that guard's message prescribes.
