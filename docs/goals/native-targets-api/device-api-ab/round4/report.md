# Round 4: where device-drawn elements come from (and the blind sheet and tab-bar phases)

## Summary

**Modal sheet and tab bar (blind only; see `blind.md`).** With no API, 8 of 8 writers made a sheet a route-file export (`export const presentation = 'sheet'`). 8 of 8 made the tab bar one app-level `tabs.tsrx` file of `<Tab href label icon badge>`. The owner stopped variants A to D for both questions until ecosystem research is done.

**Element origin, phase 1 (8 spellings of a camera preview and a PDF page).** All 40 writers used the right tag for their spelling. Reader scores sat inside the spread between readers (4.0 to 4.7 of 6, 3 readers each). The test that decides between them is the compiler: today a lowercase undotted tag is always an HTML element. So the bare `<camera>` and the imported lowercase `<cameraview>` cannot work without a compiler and checker change; the dotted and capitalised spellings type-check as written. Blind writers chose a capitalised component imported from `@markless/device` (6 of 8: `CameraView` 5, `CameraPreview` 1; the other 2 wrote a bare `<camera>`). All 8 rejected `element.camera`, because it clashes with `element()` from `@markless/core`.

**Element origin, phase 2 (the owner's platform-specific names, for a camera and a system-drawn sheet).** Readers ranked the per-platform `ios.*`/`android.*`/`web.*` version clearest (first for 15 of 18). None of the 18 would write it. Asked which name best says "the platform draws this", 12 of 18 said `native` and 6 said `system`. 12 of 18 would rather write `native` and 6 `system`. 18 of 18 said `platform.ios` next to `platform.sheet` could be confused. 3 of 5 `native` writers imported `native` from `@markless/device`, the wrong package.

**Name reading, phase 3 (`system`, `native`, `os`; 15 readers).** Cold, the names did not split readers. All 15 read their name as "whatever the platform the app runs on draws itself", all 15 said it could "somewhat" be read as a design system, and all 15 leaned "yes" on the elements existing in the website build. Shown all three together, readers ranked `system` first 13 times and `native` first twice. For `native`, 0 of 15 took it first as the browser's built-in element: 6 said mainly the phone's own UI, and 9 said both, 8 of them with the phone first. Data only; the name is decided elsewhere.

**Dialog or sheet on phones (10 readers, 5 framed as web developers and 5 as mobile developers; 20 writers).** For a page with a plain `<dialog>`, a `modal` and a `drawer` and no platform code, 9 of 10 readers predicted the `modal` stays a centered box on iPhone (5 of 5 web, 4 of 5 mobile). 10 of 10 predicted the `drawer` becomes a bottom sheet. Asked which rule they had expected, 9 of 10 said rule 2 (literal); the tenth, a mobile reader, said none, with rule 1 closest. Asked which they want, 10 of 10 chose rule 3 (literal plus an explicit opt-in), in both framings. Blind writers spelled the opt-in `<modal.root adaptive>` (6 of 6). Writers under every rule made 0 surprises (20 of 20 answers): what they said the phone shows always matched their rule.

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

### Phase 3: how readers take `system`, `native` and `os`

One page used `<X.camera>`, `<X.sheet>` and `<X.pdf>` from `@markless/ui` next to a `drawer`, with 5 cold readers per name. Each then compared all three names.

| Name | Cold: "what X means" (5) | Cold: could be a design system (5) | Comparison: exists on the website (15) | Comparison: could be a design system (15) | Comparison: ranked first (15) | Mean rank |
| --- | --- | --- | --- | --- | --- | --- |
| `system` | 5 of 5: what the platform draws itself | 5 somewhat | yes 11, can't tell 4 | yes 3, somewhat 12 | 13 | 1.1 |
| `native` | 5 of 5: what the platform draws itself | 5 somewhat | can't tell 14, no 1 | somewhat 10, no 5 | 2 | 2.1 |
| `os` | 5 of 5: what the platform draws itself | 5 somewhat | no 7, can't tell 7, unclear 1 | no 8, somewhat 5, unclear 2 | 0 | 2.7 |

**What `native` means (comparison turn, 15).** 0 took it first as the browser's built-in element. 6 said mainly the phone's own UI. 9 said both; 8 of those 9 put the phone's own UI first.

The comparison-turn columns were tallied by `check/tally-q5.py` from the raw answers, and I spot-checked them by hand. One answer each for `os` could not be classified.

### Dialog or sheet: what readers expect on a phone, and what writers do

Readers saw `q6/solutions/page.tsrx`: a plain `<dialog open>` (Share), a `modal` (Edit name) and a `drawer` (Comments), with ordinary CSS and no platform code.

**What an iPhone user sees, predicted cold:**

| Piece | Web-developer framing (5) | Mobile-developer framing (5) |
| --- | --- | --- |
| Share (plain `<dialog open>`) | a box in the page, not a sheet: 5 | a box in the page: 4; centered box: 1 |
| Edit name (`modal`) | centered box: 5 | centered box: 4; iOS sheet: 1 |
| Comments (`drawer`) | bottom sheet: 5 | bottom sheet: 5 |

**Expected versus wanted, after seeing the three rules:**

| | Web (5) | Mobile (5) |
| --- | --- | --- |
| The rule that matches what they predicted | rule 2 (literal): 5 | rule 2: 4; none, with rule 1 closest: 1 |
| The rule they would want | rule 3 (literal plus opt-in): 5 | rule 3: 5 |

The three rules:

- **Rule 1 (automatic).** `dialog` and `modal` become bottom sheets on phones; author CSS overrides; alerts stay centered.
- **Rule 2 (literal).** `dialog` and `modal` are centered everywhere; `drawer` is a bottom sheet everywhere.
- **Rule 3.** Rule 2 plus an opt-in, `<modal.root adaptive>`, chosen by 6 of 6 blind writers.

Readers' main worry about rule 1, unprompted: CSS set for other reasons, such as `margin: auto`, silently flips placement. 10 of 10 raised it. Their main worry about rule 3: the name `adaptive` could mean "responsive size". 6 of 10 raised it.

**Writers (5 per rule; both graders agreed on every field):**

| Rule | Filters panel | Delete confirmation | Address picker | Phone surprises | Website surprises |
| --- | --- | --- | --- | --- | --- |
| 1, automatic | `drawer` 5 | `modal alert` 5 | plain `modal` 5 (a sheet on phones by the rule) | 0 | 0 |
| 2, literal | `drawer` 5 | `modal alert` 5 | `drawer` 5 (so a bottom sheet on the website too) | 0 | 0 |
| 3, `adaptive` | `drawer` 5 | `modal alert` 5 | `modal adaptive` 5 | 0 | 0 |
| 3, `presentation="adaptive"` | `drawer` 5 | `modal alert` 5 | `modal presentation="adaptive"` 5 | 0 | 0 |

A surprise is a place where what the writer said the phone shows differs from the rule.

- **Rule 3.** Writers put the opt-in on exactly one piece, the address picker. Several said they would rather not give laptop visitors a bottom sheet.
- **Rule 2.** Every writer accepted a bottom-sheet address picker on the website, and 2 flagged it as a cost.
- **Delete confirmation.** Every writer, under every rule, kept it a centered alert.


## Naming data (no recommendation)

The namespace name is decided in a separate session, which commits under `naming/`. This section reports the naming data only.

**Phase 2 (camera and sheet, 6 spellings, 18 readers, 30 writers).**

- **Best name for "drawn by the platform":** `native` 12 of 18, `system` 6.
- **Would rather write:** `native` 12, `system` 6, per-platform 0.
- **Clearest to read:** per-platform first for 15 of 18.
- **`platform.ios` next to `platform.sheet`:** 18 of 18 readers said the two can be confused. Writers made no mistakes with `platform` (5 of 5).
- **Import mistakes:** 3 of 5 `native` writers imported `native` from `@markless/device`. 1 of 5 `system` writers did the same with `system`.

**Phase 3 (`system`, `native`, `os` for a camera, a sheet and a PDF view; 15 readers, 5 per name; see the table below).**

**`<video src={cam}>` (phase 1, before the owner dropped it).** 3 of 3 cold readers said it only shows the live picture and does not record. None objected to `<video>` showing a camera.

## Findings that are not about the name

**A bare lowercase tag or a lowercase import (`<camera>`, `<cameraview>`) does not work today.** `isHostTagName` (`packages/compiler/src/ast/tsrx.ts:136`) treats every undotted lowercase tag as an HTML element. The checker rejects them as well; a probe shows even `const cameraview = CameraView; <cameraview/>` fails. `<camera>` also clashes with the imported `camera()` function: 6 of 6 bare-tag readers, across both phases, paused on it. Names already taken by HTML are `map`, `menu`, `video`, `audio`, `canvas`, `search` and `dialog`; names taken by SVG are `image`, `view` and `switch`. The list comes from `check/html-clash.mjs`.

**Per-platform namespaces triplicate the wrappers.** All 5 per-platform writers factored the sheet content into one shared component, but repeated the camera tag and sheet wrapper three times (8 extra lines each).

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
- **Phases 3 and 4.** I added them at the owner's request after phase 2 ran.
  - **Phase 3 (name reading)** is readers only. No new writers took part, because phase 2 had measured writing `system` and `native`.
  - **Phase 4 (dialog or sheet).** The framing is a role sentence in the prompt for the same model, not a different population. In rule 3 the opt-in is described in the prose but missing from the typed props of `modal.root`; 10 of 10 rule 3 writers noted that and used it anyway.
  - **My slip.** One writer was launched with a placeholder path. I stopped it before it did anything; it is not counted.
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
- **Name reading (phase 3):** `q5/` (`answer-key.md`, `solutions/`, `prompts/`, `raw/`), tallied by `check/tally-q5.py`.
- **Dialog or sheet (phase 4):** `q6/` (`sheets/rules.json`, `sheets/spellings.json`, `solutions/page.tsrx`, `prompts/`, `raw/`), tallied by `check/tally-q6.py`. The writer scores are `scores/q6w-s1.json` and `scores/q6w-s2.json`.
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
