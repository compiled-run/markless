# togglegroup → buttongroup

Owner ruling 2026-08-28. A pure rename: no role, part, attribute, prop or
handler changed, and no test expectation was rewritten to accommodate the new
name.

## What the name touches

`git mv` moved `src/togglegroup/` to `src/buttongroup/` and renamed the nine
files that carried the family name in their own filename, so git records every
one as a rename rather than a delete plus an add.

The identifier convention already in the codebase is a lowercase directory and
namespace with a PascalCase two-word component name — `radio-group` exports
`radiogroupState` and `RadioGroupRootProps`. This family follows it:

| Before | After |
| --- | --- |
| `togglegroupState`, `togglegroupItemState` | `buttongroupState`, `buttongroupItemState` |
| `ToggleGroupRoot` / `Label` / `Item` / `ItemField` / `Box` | `ButtonGroupRoot` / `Label` / `Item` / `ItemField` / `Box` |
| `ToggleGroupRootProps`, `…ItemProps`, `…ItemFieldProps`, `…LabelProps`, `…Orientation`, `…Value`, `…InstanceState`, `…ItemInstanceState`, `…BoxProps` | the same list with `ButtonGroup` |
| `readToggleGroupTranscript`, `TOGGLEGROUP_ANCHOR` | `readButtonGroupTranscript`, `BUTTONGROUP_ANCHOR` |

The packet's illustrative spelling was `TogglegroupRootProps` →
`ButtongroupRootProps`. No such identifier existed; the shipped spelling was
`ToggleGroupRootProps`, so the rename kept the established `radio-group`
convention rather than inventing a third casing.

No `ui-*` attribute or CSS anchor name carried the family name — the family's
flags are `ui-multiple`, `ui-vertical`, `ui-disabled`, `ui-required` and
`ui-pressed`, and it ships no `<style>` block — so nothing there moved.

## Beyond the family directory

The barrel (`src/index.ts`), the `./buttongroup` package export (the
`./togglegroup` key is gone), the `conformance.browser.ts` descriptor and its
scenario import, the sr-gallery section id, heading, anchor map and boot-check
role/count rows, and the three CI reader matrices in `screen-reader.yml` all
follow. Where a list was alphabetical the entry moved to its new alphabetical
position rather than staying where `togglegroup` sat; where a list is in page
order (the gallery sections, the gallery anchor map, the boot-check rows) the
entry stayed put and only its name changed.

`api/manifest.json` was re-extracted with `pnpm --filter @markless/ui
api:extract`; the family's block moves to the top of the alphabetical manifest
and its doc text now says `buttongroup`.

The toolbar's prose and doc comments name the family in nine places; all
follow. `toolbar/scenarios/mixed.tsrx` still composes the same four families.

## Two spellings deliberately left alone

`toolbar/note.md`'s comparison table cites Radix's real part name,
`Toolbar.ToggleGroup`. That is another library's API, not ours, and renaming it
would have made the citation false.

Prose that says "toggle buttons" or "toggle button" describes what the items
are — real `<button aria-pressed>` controls — and is not the family name. It
stays. Only "toggle group", naming the family, became "button group".

## Left for a follow-up

Two prose references sit in family directories this unit was forbidden to
touch, because other units are live in them:

- `src/menubar/note.md:105` — "…the retired flag, which used togglegroup's…"
- `src/tour/note.md:115` — "`progress`, `radio-group`, `togglegroup` and…"

The repo-wide `rg -n "togglegroup|Togglegroup|toggle-group"` is otherwise clean
apart from `specs/state.jsonl`, which is history.

One more judgement call worth an owner's eye: this family's `note.md` cites its
research memo as `goals/headless-components/notes/U569-buttongroup-research.md`.
The memo was written under the name `U569-togglegroup-research.md` and is not in
the repo (no research memo under `goals/headless-components/notes/` is). The
citation was renamed with the rest of the note so the file reads consistently;
if the memo still exists on the goal board under its original name, either the
memo or this line needs the other spelling.

## Verification

`pnpm typecheck` clean. `pnpm --filter @markless/ui api:check` 3/3.
`pnpm exec vitest run --project ui packages/headless/components/src/buttongroup
packages/headless/components/src/toolbar` 92/92 across 2 files.

`pnpm test:sr` on the committed tree is green: 36 files, 289 passed, 10
expected-fail, 4 skipped, 0 failed.

Worth recording because it cost time: two earlier runs of that lane failed on
`src/radio-group/radio-group.sr.ts:74`, "arrowing to the next option moves the
reader onto that option", which timed out waiting for the virtual reader to
re-announce `role "radio"`. It is not this rename. Stashing every change in
this unit and re-running the lane on the untouched pilot tip (883cc9c1)
reproduced the identical failure with identical counts, and nothing this unit
touched is in that spec's import graph — it imports its own scenarios and
`test-support/driver.ts` / `virtual-driver.ts`, none of which changed. The final
run passed it, so the row is an intermittent flake in an untouched family
rather than a standing red. It is worth a look on its own, not as part of this
rename.

`buttongroup.sr.ts` and `toolbar.sr.ts` were green in every run.
