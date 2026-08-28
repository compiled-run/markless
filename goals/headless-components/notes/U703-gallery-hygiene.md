# Three kinds of drift on the gallery page

The two registration units before this one each left the same three things behind: a README table
hand-copied from a machine-readable constant, transcripts that find their family by ARIA role alone
and only work because of the order the page happens to serve its sections in, and walk limits nobody
had measured. This settles all three. No family behaviour changed, and no real-reader lane was run:
those need a VM or a CI runner.

## 1. The anchor table is generated now

`apps/sr-gallery/README.md` listed eighteen sections against the thirty-three `FAMILY_ANCHORS`
serves. It is now written by `apps/sr-gallery/scripts/anchor-table.ts` into a
`<!-- anchors:start -->` … `<!-- anchors:end -->` region, in the order `FAMILY_ANCHORS` declares its
families — which is *not* the order the page serves them, and the README says so rather than
implying a reading order it does not have.

The script rewrites the region when run bare and exits 1 with the reason when run with `--check`.
`--check` is wired into `apps/sr-gallery/scripts/boot-check.ts`, the gallery's only automated check
path: `.github/workflows/screen-reader.yml` runs the boot check twice as the gate in front of both
real-reader matrices. It runs first, before the port probe and before the server is spawned, so a
stale table costs no compile. Proven by deleting the `drawer` row: `--check` exited 1 naming the
drift, and 0 again once the row was back.

The table was kept rather than deleted because it has a reader — the anchor is what a person hands a
driver, and `preview-server.ts` is a TypeScript file they would otherwise have to open to find one.
What it stopped being is a second copy that can disagree.

The README's "It does not render yet" section went in the same pass. It described a compiler defect
that has since been fixed: the boot check is green in this tree, which is exactly the claim that
section denied.

## 2. Walks now match by role and name

Four transcripts in this unit's contract walked to their family by a fact that is not unique on the
page:

- `checkbox-transcript.ts` asked for `{ role: 'checkbox' }` and took `readUntil`'s default 20-step
  limit. The checklist section serves four more checkboxes. Now
  `{ role: 'checkbox', name: 'Checkbox Label' }`.
- `buttongroup-transcript.ts` asked for `{ role: 'group' }`. The checklist, editable and both crop
  sections serve a `role="group"`, and NVDA's word for `group` and for `radiogroup` is the same
  ("grouping"), so the radio and rating groups collide with it too. Now
  `{ role: 'group', name: 'Text alignment' }` — which is what the assertion on the next line already
  demanded, so the walk and the assertion now ask the same question.
- `drawer-transcript.ts` asked for `{ name: 'Filter results' }`, then after opening for
  `{ role: 'dialog' }` followed by a separate `{ name: 'Narrow these results' }`. The modal, popover
  and tour sections each serve a dialog and this section serves four. The two walks are now one
  `{ role: 'dialog', name: TITLE }`, and the trigger walk carries `role: 'button'`.
- `select-transcript.ts` read its three options by name alone; they now carry `role: 'option'`. Both
  real readers spell that slot `''` (no role word for an option), so `missingFacts` skips it for
  them — the change is a tightening for any reader that does speak one, not a new claim.

`editable`, `rating-group`, `popover`, `tour`, `tooltip`, `hovercard`, `calendar` and the first walk
in `menu` already matched on both. `datebox`, `numberbox` and `slider` read raw phrases rather than
the `Conveys` seam, because their families carry no `role` at all; every one of those phrase lists
already contains the family's name.

### Three walks that cannot be named without a change outside this unit

- `tabs-transcript.ts` walks to `{ role: 'tablist' }` and later `{ role: 'tabpanel' }`. Neither is
  named on the gallery: the virtual reader announces "tablist, orientated horizontally" and a bare
  "tabpanel". The tabs section happens to serve the only tablist on the page, so it is correct by
  accident. Naming it needs a label on the gallery's tab list or a family change.
- `toolbar-transcript.ts` walks to `{ name: 'Document' }`. The bar *is* named; what is missing is a
  `Vocabulary` slot for the `toolbar` role, so there is no role word to ask for. Adding one means
  writing NVDA's and VoiceOver's word for a toolbar, and neither has been observed against our
  markup. The name alone is the discriminating fact, so this is safe today.
- `menu-transcript.ts` walks to its nesting item by `{ name: 'Share', state: ['notExpanded'] }`.
  Same reason: `Vocabulary` has no `menuitem` slot.

### Role-only walks in families this unit does not own

Both belong to live units and were left untouched, per the contract:

- `radio-group-transcript.ts` — `{ role: 'radiogroup' }`. The rating-group section serves three more
  radiogroups; radio-group is safe only because its section is served first.
- `modal-transcript.ts` — `{ role: 'dialog' }` after opening, with popover, tour and four drawers
  serving dialogs too.

`taglist`, `colorpicker`, `crop`, `ink`, `pad` and `menubar` all match on a name and do not have this
problem.

## 3. One measured walk limit, shared

`apps/sr-gallery/scripts/measure-walk.ts` is new: it serves the gallery, loads it in Chromium, runs
`@guidepup/virtual-screen-reader` over the live page from the first item, and prints the step index
at which each section is reached. One full pass over the 33-section page is **435 announcements**
(step 0 is `document`, step 434 is `end of document`, step 435 wraps back to `document`).

Measured first-target step, per transcript:

| transcript | first target | step |
| --- | --- | ---: |
| checkbox | checkbox "Checkbox Label" | 4 |
| select | button "Favorite Fruit" | 30 |
| rating-group | radiogroup "Overall rating" | 46 |
| tabs | tablist | 80 |
| popover | button "Share" | 89 |
| tooltip | button "Save" | 91 |
| slider | slider "Volume", 40 | 97 |
| datebox | "month input" | 110 |
| hovercard | link "Jane Doe" | 125 |
| calendar | button "Monday, August 3, 2026" | 160 |
| menu | button "Actions" | 264 |
| buttongroup | group "Text alignment" | 291 |
| editable | button "Quarterly plan" | 300 |
| numberbox | "number field", "Quantity" | 316 |
| tour | button "Take the tour" | 413 |
| toolbar | "Document" | 415 |
| drawer | button "Filter results" | 430 |

**Seven of the seventeen limits were below the distance they had to cover**: menu (220 against 264),
buttongroup (140/291), editable (200/300), numberbox (200/316), tour (240/413), toolbar (140/415) and
drawer (200/430). Each would have failed its lane with "never announced X in N steps" — a message
about the walk rather than about the announcement, which is the least useful failure a reader lane
can produce. Outside this unit's contract, `ink` (240 against ~345), `pad` (240/~363), `crop`
(240/~380) and `menubar` (220/~265) are under too; `colorpicker` (300/~280), `modal` (140/34) and
`radio-group` (140/~36) are not.

Every per-file `WALK_LIMIT` in the contract is replaced by `GALLERY_WALK_LIMIT` in
`packages/headless/components/test-support/gallery-walk.ts`, which is **900**: twice a full pass. The
doubling is the point rather than padding. The reader wraps to the top of the document at the end, so
a limit of two passes finds its target from wherever the cursor starts, and the number stops
depending on where a section sits — which is the drift this unit exists to remove. The margin over
435 also covers NVDA and VoiceOver, which speak items the virtual reader passes over silently; 435 is
a floor from one reader, not a ceiling.

The comments those limits carried went with them, and they were the evidence the numbers were never
maintained: "the datebox section is the last on the gallery page" (it is fifteenth), "one page of
nine families" (thirty-three), "the menu section is not on the gallery page yet" (it is).

`slider-transcript.ts` keeps its own `RANGE_WALK_LIMIT = 40`. That walk continues from inside a
section the reader has already reached, so it is per-section already, and a page-sized limit would
only make its failures slow.

### Why not start each walk at the family anchor

The other option the packet offered was to move the reader to the section and keep limits small. The
`ScreenReaderDriver` seam has no command that moves a reader's cursor to an element; adding one means
focusing through Playwright and trusting each reader to follow. That is real behaviour, but it
changes what the walk proves and cannot be settled without running NVDA and VoiceOver, which do not
run on this desktop. The measured limit was taken instead.

## Anchors that were still literals

`buttongroup`, `menu` and `numberbox` spelled their gallery anchor as a string, each under a comment
saying the section did not exist yet. All three sections exist. They now read `FAMILY_ANCHORS`, the
way the other fourteen do; the exported constant names and values are unchanged, so the `.nvda.ts`
and `.voiceover.ts` lanes that import them are untouched. `taglist-transcript.ts` still spells its
own correctly — taglist is genuinely not in `FAMILY_ANCHORS`. `colorpicker-transcript.ts` also still
spells its own although `colorpicker` is registered; that family is a live unit and was left alone.

## Verification

`pnpm typecheck`, `pnpm typecheck:sr` and `pnpm typecheck:sr-real` are clean.

`pnpm test:sr` — 40 files, 315 passed, 10 expected fail, 4 skipped: identical to the pilot tip. That
suite does not read these files. Transcripts are imported only by the `.nvda.ts` and `.voiceover.ts`
lanes, so typecheck is what covers the edits here, and the walk limits are only exercised by readers
that need a CI runner.

`SR_GALLERY_PORT=4337 node apps/sr-gallery/scripts/boot-check.ts` — green, with the anchor-table gate
passing ahead of the server.

`node apps/sr-gallery/scripts/measure-walk.ts` — the step table above.

## Still open

The gallery is 435 announcements top to bottom and grows with every family. At some point a walk from
the top stops being the right shape for a transcript and the reader needs moving to the section
instead. That needs a cursor-move command on the driver seam and a real-reader run to prove each
reader follows it — a unit with a CI runner, not a desktop.

The three walks named above (tabs on `tablist` and `tabpanel`, toolbar on the bar, menu on its
nesting item) still match on one fact. Two want `Vocabulary` slots that only a real reader can fill;
the tabs one wants a name on the gallery's tab list.
