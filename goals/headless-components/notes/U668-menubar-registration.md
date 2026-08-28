# menubar registration

The `menubar` family shipped complete in `src/menubar/**` but was reachable from
nowhere outside its own folder. This puts it in every place `toolbar` is
registered, and pins the one axe mechanism the composition depends on.

## Where it now appears

| Site | What was added |
| --- | --- |
| `src/index.ts` | `export * as menubar from './menubar/index.ts';` |
| `package.json` `exports` | `"./menubar": "./src/menubar/index.ts"` |
| `test-support/conformance.browser.ts` | the `Menubar` scenario import and a descriptor, CSR and SSR |
| `apps/sr-gallery/preview-server.ts` | `menubar: '/#menubar'` in `FAMILY_ANCHORS` |
| `apps/sr-gallery/src/Gallery.tsrx` | the `#menubar` section: three menus, one nested submenu, one checkbox item |
| `apps/sr-gallery/scripts/boot-check.ts` | `RENDERED_ROLE.menubar = 'menubar'` plus four rows |
| `.github/workflows/screen-reader.yml` | `menubar` in the virtual, NVDA and VoiceOver matrices |
| `src/menubar/menubar-transcript.ts` | `MENUBAR_ANCHOR = FAMILY_ANCHORS.menubar` |

`api/manifest.json` needed no change: `pnpm --filter @markless/ui api:extract`
rewrote it byte-identically, because the extractor walks the family folders
rather than the barrel and the merge that shipped the family had already
recorded the namespace. `api:check` is green against it.

## The conformance descriptor

```
rootAria: { role: 'menubar', 'aria-orientation': 'horizontal' }
```

No `openCycle`. A bar opens nothing of its own — what opens is each enclosed
menu, through `menu`'s own trigger, and the `menu` descriptor already holds that
cycle. `supportsDisabled: false`, because the family takes no props at all.

`parts` names all 20 testids the Basic scenario renders at rest, the nested
submenu's panel and its two items included: a menu surface is hidden rather than
detached when closed, so everything inside is on the page before anything opens.

The whole battery went green with the family in it on the first run, the axe row
included: 488 rows in `test-support/conformance.browser.ts`, and 537 with
`src/menubar/**`'s own browser rows alongside.

## The flattening pin

A menubar's `aria-required-children` requires its children to be menu items. The
enclosed `menu.root` renders a `div` with no role, so axe flattens it and the
`role="menuitem"` trigger inside counts as the bar's own child. Give that `div`
an accessible name — `aria-label` on a `menu.root` is the easy way — and axe
exposes it as a named generic instead. The bar then has no required children at
all, and the failure surfaces on the axe row, a long way from the name that
caused it.

Two rows hold the shape rather than leaving it to be rediscovered:

- `test-support/conformance.browser.ts`, `describe('menubar wrappers')`: for each
  of the bar's three items, every element between the item and the bar carries no
  `aria-label`, no `aria-labelledby` and no `role`. CSR and SSR.
- `apps/sr-gallery/scripts/boot-check.ts`: no direct child of the gallery's
  `[role="menubar"]` carries `aria-label` or `aria-labelledby`.

Both select the bar's own items as `[role="menuitem"][ui-menubar]`. The plain
`[role="menuitem"]` selector counts 10 in the Basic scenario, because the
commands inside the three surfaces are menu items too; `ui-menubar` is what an
enclosed trigger writes, so it is the selector that means "on the bar".

## The transcript anchor

`menubar-transcript.ts` carried its anchor as a local `'/#menubar'` because
`FAMILY_ANCHORS` had no key for it. It now reads `FAMILY_ANCHORS.menubar` and
exports it as `MENUBAR_ANCHOR`. `MENUBAR_SECTION` stays as an alias: the NVDA and
VoiceOver lanes import that name and are outside this unit's contract.

## What was measured

All six verification commands green in the worktree:

```
pnpm typecheck
pnpm exec vp test --project ui packages/headless/components/src/menubar packages/headless/components/test-support   537 passed
pnpm --filter @markless/ui api:check                                                                                 3 passed
pnpm --filter markless-sr-gallery build
SR_GALLERY_PORT=4431 pnpm --filter markless-sr-gallery boot-check
pnpm exec vp lint --deny-warnings                                                                                    0 warnings, 0 errors
```

The boot check reports, for the new section:

```
#menubar serves the menubar family: 1 role="menubar" element(s)
#menubar serves the bar named by its label part.
#menubar's menus are announced as items holding a menu: File (menu) / Edit (menu) / View (menu)
#menubar keeps the wrappers between the bar and its items unnamed.
#menubar rests with exactly one tab stop.
```

The one tab stop is the bar's own: cold, before any handler has run, the bar
renders `tabindex="0"` and every trigger renders `-1`, and the first `focusin`
hands the stop to a trigger.

The real-reader lanes were not run here and cannot be: NVDA and VoiceOver take
over a desktop, so the workflow file is edited and only CI executes it.

## Still open

`test-support/driver.ts`'s shared `Vocabulary` has no word for `menubar`, `menu`
or `menuitem`, so `menubar-transcript.ts` asserts those roles from the page and
holds the reader to the name and the state instead. This is the same standing gap
`toolbar` records for its own role word, and it was left alone rather than
widened here: adding vocabulary slots changes what every other family's real-reader
transcript is held to, and nothing in this unit's verification would catch a
regression in lanes that only run on CI.
