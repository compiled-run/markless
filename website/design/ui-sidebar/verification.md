# Verification

- Reviewed state, parts, rendered controls, and handlers in 46 family implementations.
- Generated six source sheets and 96 distinct 128px RGBA crops.
- Checked the 28 current UI sidebar entries: 56 named theme files exist, have visible artwork, and have transparent outer padding.
- Inspected 48 light and 48 dark crops on cream and near-black contact sheets.
- Website TSRX typecheck passed.
- The supported root Markless typecheck, `pnpm run typecheck`, passed.
- Cutter TypeScript check, lint, and formatting checks passed.
- Regeneration reproduced the 96 crop hashes and crop coordinates exactly.
- The production UI overview and Checkbox page each contain 56 distinct new sidebar image URLs; each image returned HTTP 200 with an image/png content type. The framework homepage retains its original artwork.
- Chrome review at the existing desktop sidebar size confirmed light and dark crops, theme switching in both directions, and the form, show/hide, overlay, collection, and display groups.
- Root TypeScript check fails before and after the change: 807 lines of existing diagnostics, including unrecognized .tsrx imports. The two command outputs are byte-for-byte identical.
- Website general check now passes formatting and lint after the separate tooling changes landed.
- Production build now passes after the separate documentation quick-info fix landed. The earlier build had terminated with exit code 137.
- Chrome review of the production build confirmed the generated artwork and theme switching in both directions. The preview was restored to light mode.
- The successful production build still emits nonfatal delegate-artifact warnings involving virtual CSS; these were not changed by this asset work.

The icon changes are implemented and visually verified in development and production. The production build, website checks, and supported root Markless typecheck pass. The remaining completion gate is the exact plain `tsc` command required by `AGENTS.md`, whose unchanged diagnostics include unresolved `.tsrx` imports. No compiler settings or component behavior were changed to suppress those diagnostics.

The asset work was checked after generation because the subjects, crop edges, and transparency must be assessed on the generated pixels. No component behavior tests were added for this decoration change.

Commands run:

```sh
node website/tooling/cut-ui-sprites.ts
pnpm exec tsc --noEmit -p tsconfig.json
pnpm run typecheck
pnpm --dir website run typecheck:tsrx
pnpm --dir website run doctor
pnpm --dir website run check
pnpm --dir website run build
pnpm exec tsc --noEmit --strict --skipLibCheck --types node --target ES2023 --module NodeNext --moduleResolution NodeNext website/tooling/cut-ui-sprites.ts
pnpm exec vp lint website/tooling/cut-ui-sprites.ts
```
