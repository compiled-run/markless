# Round 4: where device-drawn elements come from (and the blind sheet and tab-bar phases)

## Summary

**Modal sheet and tab bar (blind only; see `blind.md`).** With no API, 8 of 8 writers made a sheet a route-file export (`export const presentation = 'sheet'`). 8 of 8 made the tab bar one app-level `tabs.tsrx` file of `<Tab href label icon badge>`. The owner stopped variants A to D for both questions until ecosystem research is done.

**Element origin, phase 1 (8 spellings of a camera preview and a PDF page).** All 40 writers used the right tag for their spelling. Reader scores sat inside the spread between readers (4.0 to 4.7 of 6, 3 readers each). The test that decides between them is the compiler: today a lowercase undotted tag is always an HTML element. So the bare `<camera>` and the imported lowercase `<cameraview>` cannot work without a compiler and checker change; the dotted and capitalised spellings type-check as written. Blind writers chose a capitalised component imported from `@markless/device` (6 of 8: `CameraView` 5, `CameraPreview` 1; the other 2 wrote a bare `<camera>`). All 8 rejected `element.camera`, because it clashes with `element()` from `@markless/core`.

**Element origin, phase 2 (the owner's platform-specific names, for a camera and a system-drawn sheet).** Readers ranked the per-platform `ios.*`/`android.*`/`web.*` version clearest (first for 15 of 18). None of the 18 would write it. Asked which name best says "the platform draws this", 12 of 18 said `native` and 6 said `system`. 12 of 18 would rather write `native` and 6 `system`. 18 of 18 said `platform.ios` next to `platform.sheet` could be confused. 3 of 5 `native` writers imported `native` from `@markless/device`, the wrong package.

### Phase 2: platform-specific namespace for a camera preview and a system sheet

| Spelling | Writers who imported it from the right package (5) | Writers whose code type-checks (5) | Lines (writers) | Readers' mean rank (18; 1 = clearest) | Ranked first | Would rather write (18) |
| --- | --- | --- | --- | --- | --- | --- |
| `ios.sheet` / `android.sheet` / `web.sheet` in `@if (platform.…)` branches | 3 | 3 | 90 | 1.2 | 15 | 0 |
| `native.camera`, `native.sheet` (`@markless/ui`) | 2 (3 took it from `@markless/device`) | 2 | 70 | 2.2 | 3 | 12 |
| `system.camera`, `system.sheet` (blind writers' top name) | 4 | 4 | 71 | 2.7 | 0 | 6 |
| `platform.camera`, `platform.sheet` (same object as `platform.ios`) | 5 | 5 | 77 | 3.9 | 0 | 0 |
| `base.camera`, `base.sheet` (control) | 5 | 5 | 81 | 5.1 | 0 | 0 |
| bare `<camera>`, `<sheet>` (comparison) | 5 | 0: rejected by today's checker | 69 | 5.9, last for 16 | 0 | 0 |

How to read it:

- **Readers' answers.** Readers answered six questions about one page with no docs. They were asked where each tag comes from, whether it exists on the website, who decides its look, how the sheet differs from the `drawer`, how many places to edit the heading, and what `platform.ios` means. Every version scored 6 of 6 except the bare tag (5.7), so these cold answers do not separate the versions. Both scorers agreed on 108 of 108 marks.
- **Readers' confidence.** Readers were unsure about the website. Their confidence that the camera and sheet exist on the website was 2 of 5 for every version except per-platform (3 of 5). Every `native` and `platform` reader raised "it might render nothing on the web".
- **Copies of the sheet content (owner question).** All 5 per-platform writers put the sheet content in one shared component, so the content lives in one place. Their files still repeat the camera tag and the sheet wrapper three times: 8 extra lines each, per both graders. In the reader page, where the content was written inline in each branch, 3 of 3 per-platform readers said the heading must change in 3 places.

### Phase 1: eight spellings for a camera preview and a PDF page

| Spelling | Writers with the right tags (5) | Type-checks today | Reader score (3 each, of 6) | Readers who said "not an HTML element" (3) | Lines |
| --- | --- | --- | --- | --- | --- |
| `<base.camera el={cam} />` (current) | 5 | yes | 4.0 | 0 (3 "can't tell") | 73 |
| `<camera el={cam} />`, no import | 5 | no: lowercase tag is HTML to the compiler | 4.3 | 2 | 66 |
| `<native.camera>` (`@markless/ui`) | 5 | yes | 4.0 | 0 (3 "can't tell") | 69 |
| `<system.camera>` (`@markless/ui`) | 5 | yes | 4.7 | 2 | 61 |
| `import { cameraview }` from `@markless/device` | 5 | no: lowercase tag is HTML to the compiler | 4.7 | 2 | 71 |
| `import { CameraView }` from `@markless/device` (blind choice) | 5 | yes | 4.0 | 0 (3 "can't tell") | 70 |
| `<video src={cam}>`, `<embed src={doc}>` (dropped by the owner) | 5 (1 also passed `onClick` to `base.button`) | not checked | 4.7 | 0 (2 said "yes, it is `<video>`", which is right for this one) | 65 |
| one `<View el={…}>` from `@markless/device` (blind name) | 5 (1 misused `base.button`) | not checked | 4.7 | 0 | 64 |

How to read it:

- **Where the points went.** Readers lost them on two questions: "does the camera tag carry behaviour of its own" (22 of 24 said yes, against the key) and "is it an HTML element" (mostly "can't tell"). Both scorers agreed on 156 of 156 marks.
- **Phase 1 had no ranking turn.** The owner changed the candidates while it ran, so phase 2 holds the ranking.

## Recommendations

**Element origin: `native.camera` / `native.sheet`, with the website behaviour written into the API docs, and consider exporting `native` from `@markless/device`.**

- **Why `native`.** It was named best by 12 of 18 readers and chosen to write by 12 of 18. Readers ranked it below the per-platform version only because per-platform shows the website branch in the code, and every one of those readers called the triplication a cost.
- **Where `native` comes from.** Writers looked for `native` in the device package (3 of 5 imported it from there). Blind writers put these elements in `@markless/device` (6 of 8). So the import location is the risk, not the name.
- **What `native` does not say.** The name does not say what the website gets. Every `native` reader guessed a browser fallback at 2 of 5 confidence, and "native" reads as "app only" to some. If that matters more than familiarity, `system` is the runner-up (6 of 18). Its readers' reason: "it stays true on the web, where the browser is the system".

**Do not use `platform.camera` / `platform.sheet`.** 18 of 18 readers said `platform.ios` next to `platform.sheet` can be confused: "a yes/no value and a component on the same object". Writers had no trouble (5 of 5 right, 0 mistakes). The cost is to readers, so this result is a reading one, not a writing one.

**Keep per-platform namespaces (`ios.sheet`) as an escape hatch only.** Readers ranked them clearest, but 0 of 18 would write them. Writers avoided the triplication by factoring the content into a component; the wrappers still repeat.

**Do not ship a bare lowercase tag or a lowercase import** (`<camera>`, `<cameraview>`). Today `isHostTagName` (`packages/compiler/src/ast/tsrx.ts:136`) treats every undotted lowercase tag as an HTML element. The checker rejects them as well; a probe shows even `const cameraview = CameraView; <cameraview/>` fails. Making them work means new compiler and checker rules, and `<camera>` also clashes with the imported `camera()` function (6 of 6 bare-tag readers, across both phases, paused on it). For future names, `map`, `menu`, `video`, `audio`, `canvas`, `search` and `dialog` are already HTML elements and `image`, `view` and `switch` are SVG elements. The list comes from TypeScript's DOM library tag maps, via `check/html-clash.mjs`.

**`<video src={cam}>`: the owner's reaction was not shared.** 3 of 3 cold readers said it only shows the live picture and does not record, and none objected to `<video>` showing a camera. One wrote: "`video` just means a moving image here, not recording". The owner had already dropped it.

## What confused readers and writers, quoted

- **`platform`, phase 2:** "`platform.ios` is a yes/no fact about where the code runs; `platform.sheet` is a component. A reader could think `platform.sheet` is also a check ('is there a sheet?')."
- **`native`:** "On the website, 'native' reads as 'not available here' or 'the app only', so a reader could easily think the website gets nothing."
- **`system`:** "'system' could also mean the app's design system."
- **`base` (control):** "`base.button` on the same page is clearly a basic part the author styles, so `base.sheet` reads as author-styled too, not system-drawn." 18 of 18 readers ranked it fifth or sixth.
- **Bare tag:** "`<camera>` clashes in name with the imported `camera()` function."
- **Writers, `native`:** 3 of 5 wrote `import { camera, native, platform } from '@markless/device'`.
- **Writers, per-platform:** 2 of 5 imported `ios`, `android` and `web` (and `base`, `drawer`) from `@markless/device`. One wrote: "the sheet never says which module `ios`, `android` and `web` come from". My sheet listed them under `@markless/ui`, but after a long comment, so part of this is my sheet's layout.
- **Phase 1, `element.camera`:** "it collides with `element()` from `@markless/core`, so `element.camera` reads like an element handle". 8 of 8 blind writers said this.

## Limits

- **One model family, small samples.**
  - **Who took part.** Every writer, reader and scorer was a fresh Opus subagent. They inherit the repo's `CLAUDE.md`, which mentions `element()` and part naming.
  - **Counts.** Each version had 5 writers and 3 cold readers. The phase 2 ranking has 18 readers; phase 1 has no ranking.
  - **How large a gap is real.** A difference of one reader in three is inside the spread between readers of the same version. So the phase 1 reader scores (4.0 to 4.7) show no difference.
- **Nothing was built or run.**
  - **What was checked.** Type checks used the repo's Markless-aware checker against each version's sheet as a `.d.ts`. The HTML-element and `View` writers were not type-checked. The rest is judged against each sheet's written rules.
- **I wrote the designs, the sheets and the keys.** Choices that shape results:
  - **Website rule.** On the website, the camera is the browser's camera and the sheet is the browser's `<dialog>`, in every version.
  - **Per-platform version.** It got a `web.*` namespace so the website has something to show.
  - **Reader page.** The per-platform reader page repeats the sheet content inline, while writers factored it out.
  - **PDF in the HTML-element and `View` versions.** It is an object (`pdf()`), not props, as the owner's description implied.
- **Scope changed four times during the run.**
  - **Sheet and tabs.** Variants A to D for sheets and tabs were cancelled before any ran. Nothing was discarded: no writer had seen a sheet or tabs API.
  - **Two added versions.** The HTML-element and `View` versions were added after the first six had run. Their answer-key addendum was written after the first HTML-element reader started but before any answer was read.
  - **HTML-element version dropped.** The owner dropped it after it had run; its results are reported but carry no recommendation.
  - **Phase 2.** It replaced phase 1's planned ranking turn, which was not run.
- **Scorer leniency in phase 2.** Readers who wrote "probably a browser fallback" were scored right on the website question, as the key allowed. The low confidence numbers (2 of 5) are the better signal there.
- **Concurrency.** At most 8 agents ran at once. `check/extract.py` confirms each participant read only its own prompt file, once per turn: problems [] across 141 transcript rows.

## How it ran

- **Prompts.** As in round 3: prompts as per-agent files, cold read first, then a second turn with every version.
- **Participants.** Blind phases: 8 writers each for sheets, tabs and element names; a naming follow-up for 8; 5 blind writers named the generic element.
- **Phase 1.** 8 versions × 5 writers, and 8 × 3 cold readers.
- **Phase 2.** 6 versions × 5 writers, 6 × 3 cold readers, and 18 ranking turns.
- **Scoring.** Two scorers per scoring task. They agreed on every scored mark: blind classification (all categories), phase 1 writers (all fields), phase 1 readers 156 of 156, phase 2 writers (all fields), phase 2 readers 108 of 108. No third scorer was needed.

## Files

All paths are relative to `round4/`.

- **Blind sheet and tabs phase:** `blind.md`, `q1/`, `q2/`.
- **Element-origin phases:**
  - Phase 1: `q3/` (`answer-key.md` with its addendum, `sheets/`, `solutions/`, `prompts/`, `raw/`).
  - Phase 2: `q4/`.
  - Raw answers: under `raw/`. A `-2.md` file is a second turn (a naming follow-up or a ranking).
- **Scoring:**
  - `scores/`: every scorer's JSON.
  - `prompts/`: the scorer prompts.
  - `check/tc-q4-writers.jsonl`: the type-check results.
- **Scripts in `check/`:**
  - `make-*.mjs`: the generators.
  - `tc.mjs`: the type check.
  - `html-clash.mjs`: tag names already taken by HTML, SVG or MathML.
  - `rankings-q4.py`: the ranking tallies.
  - `lines.py`: code-line counts.
  - `extract.py`, `map.tsv`, `followups.tsv`, `scorers.tsv`: the transcript checks.
