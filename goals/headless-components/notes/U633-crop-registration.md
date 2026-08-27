# crop registration

The `crop` family was shipped in `src/crop/**` but reachable from nowhere outside
its own folder. This wires it into every place `pad` is wired into, so a consumer
can import it, the shared battery holds it, and CI's reader lanes have a page to
read.

## What was registered

**Barrel** — `export * as crop from './crop/index.ts'` in
`packages/headless/components/src/index.ts`.

**Package export** — `"./crop": "./src/crop/index.ts"` in the package's
`exports` map, so `@markless/ui/crop` resolves.

**Conformance battery** — a descriptor in `test-support/conformance.browser.ts`
mounting the Basic scenario in CSR and SSR. `rootAria: { role: null }` (the root
is a plain div; the rectangle inside it carries the role), no `openCycle` (the
rectangle is always on the page, so the battery's click-a-trigger cycle has
nothing of the family's own to click), `valuedAttributes: []` (every `ui-*` mark
this family writes is a presence attribute), `supportsDisabled: true`. The parts
list is the fourteen testids the Basic scenario renders at rest: root, label,
description, area, selection, the eight handles, and the field.

**API manifest** — `api:extract` re-run; the manifest already carried the crop
surface, so it came back byte-identical and `api:check` is green.

**Gallery** — a `#crop` section serving the starter (a named area, the rectangle,
its grid, its eight handles and the field) and a `#crop-image` section serving
the picture recipe. Both anchors are in `FAMILY_ANCHORS`. `CROP_ANCHOR` in
`src/crop/crop-transcript.ts` now reads `FAMILY_ANCHORS.crop` instead of spelling
`/#crop` out, matching how `pad` and `ink` do it.

**Reader workflow** — `crop` added to all three matrices in
`.github/workflows/screen-reader.yml` (the per-family virtual lane, the NVDA
lane, the VoiceOver lane). The file was edited, never executed here.

## The one judgement call: where the picture recipe lives

The packet asked for the basic and image scenarios in section `#crop`, and in the
same breath for a boot-check row proving **eight** `role="slider"` thumbs. Those
two cannot both hold. The shipped transcript scopes to `#crop` and asserts:

    const handles = section.getByRole('slider');
    await expect(handles).toHaveCount(8);

The image recipe carries one bottom-end corner handle, so putting it inside
`#crop` makes nine sliders and turns the real-reader lane red the first time CI
runs it — a lane that cannot be run here to catch it.

The recipe therefore sits in its own `#crop-image` section, which is the
gallery's established pattern for a second shape (`#slider-range`,
`#numberbox-currency`, `#numberbox-min-max-step`). Every literal constraint then
holds: `FAMILY_ANCHORS.crop` exists and the transcript reads it, both scenarios
are on the page, and `#crop` serves exactly eight thumbs.

If the owner would rather the recipe sit inside `#crop`, the transcript's count
has to move to nine in the same change.

## Boot-check rows

The role count alone only says a rectangle rendered. Three rows carry the facts a
reader lane then turns on:

- the rectangle is one `role="group"` reading `aria-roledescription="crop area"`,
  and it is a tab stop (`tabindex="0"`) — without the roledescription a reader
  says "group" and the widget is unidentifiable;
- `#crop` serves exactly eight `role="slider"` handles, each with an accessible
  name. Measured: `Top edge / Bottom edge / Start edge / End edge / Top start
  corner / Top end corner / Bottom start corner / Bottom end corner`;
- `#crop` mounts one `input[name="crop"]`, so a form has a rectangle to submit.

## Measurements

All six verify commands green in the worktree:

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project ui .../src/crop .../test-support` — 520 tests
  passed across 2 files (the family's 58 browser rows plus the whole shared
  battery, crop included, in CSR and SSR).
- `pnpm --filter @markless/ui api:check` — 3 tests passed.
- `pnpm --filter markless-sr-gallery build` — built in 7.9s.
- `SR_GALLERY_PORT=4411 pnpm --filter markless-sr-gallery boot-check` — every
  family renders; `#crop` and `#crop-image` each serve one `role="group"`, and
  the three crop rows above all report.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

Not run, by owner rule: `pnpm test:sr-real` and every NVDA/VoiceOver command.
Those three claims in `crop-transcript.ts` — whether a reader speaks the
roledescription in place of "group", whether it speaks a handle's value on an
arrow key, and whether the live readout is heard when the rectangle moves — stay
unmeasured until CI runs them.
