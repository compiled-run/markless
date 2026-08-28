# Registering the rating-group family

The rating group landed as a family with no way to reach it: the barrel did not export it, the
package export map had no entry, the api manifest did not describe it, the conformance battery had no
descriptor, the sr-gallery served no section, and no CI reader lane ran it. This wires all of that up.
No rating-group behaviour changed.

## What now carries `ratinggroup`

- `src/index.ts` — `export * as ratinggroup from './rating-group/index.ts'`, between `radiogroup` and
  `select`.
- `package.json` — `"./ratinggroup": "./src/rating-group/index.ts"`, in the same slot and spelled the
  way `./radiogroup` is.
- `api/manifest.json` — regenerated with `api:extract`; `api:check` passes (3 rows).
- `test-support/conformance.browser.ts` — a `rating-group` descriptor; 12 rows green, no exemptions.
- `apps/sr-gallery/preview-server.ts` — `'rating-group': '/#rating-group'` in `FAMILY_ANCHORS`.
- `apps/sr-gallery/src/Gallery.tsrx` — a `#rating-group` section carrying three shapes.
- `apps/sr-gallery/scripts/boot-check.ts` — a rendered role, a count, and three rows.
- `.github/workflows/screen-reader.yml` — the virtual, NVDA and VoiceOver matrices.

The scenarios moved from `import * as ratinggroup from '../index.ts'` to the consumer form
`import { ratinggroup } from '../../index.ts'`, and the transcript and its two lanes read
`FAMILY_ANCHORS['rating-group']` instead of the `RATING_GROUP_ANCHOR` literal the family shipped with.
Both were placeholders its own note called out as waiting on this work; that note now says registered.

## The descriptor names the wrapper, not the marks

The battery resolves a part by `data-testid` and requires exactly one element per name. The Basic
scenario's five marks are one repeat under a single `star` testid — which is how the family's own
browser suite counts them, so changing it would have been a behaviour-adjacent edit to a file outside
this unit's contract. The descriptor therefore names `root`, `label`, `stars` (the wrapper the repeat
opens in) and `valuelabel`. The marks are still covered: `rating-group.browser.ts` counts them, and
the boot-check row below asserts fifteen of them on the gallery page.

`valuedAttributes` is `['ui-count', 'ui-value']`. Those are the two the family spells key-value —
`ui-count` on the root, `ui-value` on the root, on every mark and on the `<output>` readout.
`ui-disabled`, `ui-readonly`, `ui-required`, `ui-star`, `ui-filled`, `ui-half` and `ui-preview` are
all presence marks and pass the spelling row untouched.

## The gallery's first rating is already rated, and why

`#rating-group` serves the plain rating (`defaultValue={3}`), the half-value one
(`half defaultValue={2.5}`) and the read-only aggregate (`readonly half value={4.5}`).

The plain one starts at 3 rather than at nothing because that is the claim the real readers exist to
settle for this family: a fill covering three marks must still be heard as one checked radio and four
unchecked ones, not as three checked ones. An unrated starter would render the section unable to carry
the row `rating-group-transcript.ts` was written for.

The three groups are named `Overall rating`, `Cleanliness` and `Average guest rating`. Distinct names
are load-bearing, not decoration — see the next section.

## The transcript had to start matching on the name

`readRatingGroupTranscript` walked to the first `role="radiogroup"` on the page. On a one-family page
that was the rating group; on the gallery it is the radio-group family's own `Billing Period` group,
which is served earlier in the same document, so the walk would have stopped there and the very first
assertion would have failed on the name. The walk now asks for `{ role: 'radiogroup', name: GROUP }`.
This is the second family to hit the shared-page problem; `radio-group`'s own transcript still matches
on role alone and is only safe because its section is the first radiogroup in the document.

## Verification

`pnpm typecheck`, `pnpm typecheck:sr` and `pnpm typecheck:sr-real` are clean.
`pnpm --filter @markless/ui api:check` passes (3 rows).
`pnpm exec vitest run --project ui packages/headless/components/src/rating-group
packages/headless/components/test-support/conformance.browser.ts -t "rating"` — 26 passed.
The full `rating-group.browser.ts` suite was run without the name filter too, because the filter would
have hidden a scenario-import regression: 41 passed.
`pnpm test:sr` — 38 files, 304 passed, 10 expected fail, 4 skipped.
`SR_GALLERY_PORT=4337 node apps/sr-gallery/scripts/boot-check.ts` — green, with the four new lines:

```
#rating-group serves the rating-group family: 3 role="radiogroup" element(s)
#rating-group serves a group named by its label part.
#rating-group serves five marks per group.
#rating-group's read-only group reads its value back as "4.5 of 5".
```

The `api:check` row was red on the pilot tip before this work: the manifest had never been regenerated
after the family merged. The regeneration adds `ratinggroup` and nothing else.

The two real-reader matrices were added on the evidence that `rating-group.nvda.ts` and
`rating-group.voiceover.ts` exist, which is the rule those lists state. Neither reader lane was run
here: real-reader lanes need a VM or a CI runner, not a desktop.
