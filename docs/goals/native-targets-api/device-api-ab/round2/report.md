# Device API A/B, round 2: parts, objects, a hybrid, one element, and state-driven elements

## Summary

Writers made no API mistakes in any of the five designs. Readers ranked device objects with `<camera el={cam} />` clearest: first for all 8 readers, with every reading question answered right. Parts with visible state wrote the shortest code but read worst: last for 7 of 8 readers, 68% of questions right.

| Design | API mistakes per task | Bug-prone behaviours avoided (of 25) | Lines of code, all 8 tasks | Writer confidence (of 5) | Reader comprehension | Reader clarity rank |
| --- | --- | --- | --- | --- | --- | --- |
| Device objects, shown with `<camera el={cam} />` | 0.00 (type checker: 1 wrong prop) | 24 | 308 (285–340) | 3.4 | 100% | 1.0 (first for 8 of 8) |
| State-driven elements under one `device` import | 0.00 (type checker: handle typing in 5 of 5, unguarded handle in 3 of 5) | 20–21 | 307 (295–317) | 2.9 | 100% | 2.3 |
| One element plus functions (round 1's view element) | 0.00 (type checker: handle typing in 5 of 5) | 25 | 381 (355–411) | 2.7 | 100% | 2.8 |
| Objects plus parts that take them | 0.00 | 25 | 251 (224–293) | 3.3 | 81% | 4.1 |
| Parts with visible state under a root that owns the device | 0.00 | 25 | 236 (212–255) | 3.5 | 68% | 4.9 (last for 7 of 8) |

How to read the columns:

- **API mistakes per task:** names the sheet does not declare, plus wrong uses of names it does, from two independent graders over 40 task answers (5 writers × 8 tasks). Both graders found none in every design. The type-checker notes come from checking every answer against its sheet as a real `.d.ts`; they are listed under "Writer mistakes" below.
- **Bug-prone behaviours avoided:** five yes/no checks per answer (25 per design), listed below. A range means the two graders differed.
- **Lines of code:** non-blank code lines across all eight tasks. The figure is the mean over 5 writers, with the lowest and highest in brackets.
- **Writer confidence:** each writer's own 1–5 rating per task, averaged.
- **Reader comprehension:** share of 8 questions answered as in the answer key, averaged over 8 readers and 2 scorers. Three designs hit the ceiling, so this column only separates the two parts designs.
- **Reader clarity rank:** mean position when each of 8 readers ranked all five designs (1 = clearest).

The five bug-prone checks:

1. **Shutter before ready:** a press cannot take a photo before the camera is ready.
2. **Released while covered:** the camera is released while the review panel covers it.
3. **Header without internals:** a shutter in a distant header works without knowing the camera's internals.
4. **Record label follows the recorder:** the Record/Stop label reads the recorder's real state.
5. **Search moves the map:** choosing a search result really opens the map centred on it.

## What differed, task by task

**Camera tasks (1–4).** No answer in any design could fire the shutter before the camera was ready. Every design released the camera under the review panel, but writers were least sure how in the two designs that switch it with an `active` field:

- **Objects plus parts:** all 5 writers said in their guesses that they did not know whether a panel covering the camera counts as the camera leaving the screen. One wrote: "Dropping the `<camera>` element with an `@if` might also stop it, but the sheet does not say so".
- **Device objects:** one writer kept the camera mounted for the same reason.
- **Element and state-driven designs:** the camera leaves the markup through `@if`, and no writer raised a doubt.

**Header shutter (task 2).** The element and state-driven designs pass an `element()` handle down to the header. All 10 of those writers typed the prop as `CameraElement | null`, while the handle is `CameraElement | undefined`, so the type checker rejected every one. In the state-driven design, 3 of 5 also called the handle without a guard (`photo = await cam.takePhoto();`, flagged as `'cam' is possibly 'undefined'`). In the device-objects design, 2 writers re-called `named()` inside the click handler "in case it is not" live.

**Voice memo (task 5).** This is where the state-driven design lost points:

- **State-driven:** the app owns the `recording` flag, and writers drove both `<device.recorder active={recording}>` and the label from it: `{recording ? 'Stop' : 'Record'}`. Graders found the flag never resets when microphone access is refused, so the label reads "Stop" while nothing records. Grader 1 marked 4 of 5 answers this way and grader 2 marked 5 of 5.
- **Every other design:** the label reads the recorder's own state, and all 20 answers passed.
- **Parts design:** 2 writers showed the seconds label outside any recording check, although the sheet says it exists only while recording.

**Map and search page (task 6).** One answer failed: a device-objects writer read the search result from `globalThis.location?.search` inside the component body. The body runs on the server first, so the map opens on its default centre. The other designs carried the place over in three ways:

- **Element and state-driven designs:** all 10 writers saved it with `storage()` and reloaded with `location.assign('/map')`. That works because `storage()` is cookie-backed and a fresh server render reads the cookie (see the correction under "Changes during the run").
- **Device objects:** writers passed the place in the URL.
- **Parts and hybrid:** writers called `moveTo` on a shared map handle.

**Video and offline/compass (tasks 7–8).** No differences.

## State-driven elements compared with device objects

The planner asked for this comparison specifically.

- **Lines:** a tie for writers, at 307 and 308. In the reference solutions the state-driven design is longer, 274 lines to 251.
- **Bug-prone behaviours:** state-driven avoided 20–21 of 25; objects avoided 24. The state-driven losses all come from one source: the app keeps its own Record/Stop flag, and that flag drifts when access is refused. The one objects loss is a single search page. On a released camera, state-driven did as well or better: removing the element released the camera with no doubts, where objects writers had to trust `cam.active = false`.
- **Reader rank:** objects first for 8 of 8 readers. State-driven was second for 6 of 8 and third for 2. Both scored 100% on the reading questions.
- **The invisible `<device.recorder />`:**
  - **Readers:** all 8 said it was unclear whether the element shows anything, for example "seems to render nothing yet controls recording". All 8 still answered the recorder question correctly.
  - **Writers:** none misused it, and two noted on their own that the always-present recorder "asks for microphone permission as soon as the page loads". The bug it did cause is the label drift above.

## Writer mistakes, quoted

There were no off-sheet names and no misuses per the graders. Everything below comes from the type checker or the bug-prone checks.

- **Device objects:** one map passed a DOM-typed attach function where the map object's type was expected (`<mapview el={m} attach={fromSearch}>`). One search page read `globalThis.location?.search` in a component body.
- **State-driven elements:**
  - `{recording ? 'Stop' : 'Record'}` from an app-kept flag (4–5 of 5).
  - `CameraElement | undefined` passed as `CameraElement | null` (5 of 5).
  - Unguarded `cam.takePhoto()` (3 of 5).
- **One element plus functions:** the same handle-typing error (5 of 5). One writer forgot to import `computed`, and the same writer called the video handle unguarded (`'video' is possibly 'undefined'`).
- **Objects plus parts:** two implicit-`any` parameters in a writer's own helper code.
- **Parts:** none from the type checker. Writers' main doubts were whether live handle fields update the page and whether `active` set back to true restarts the camera; the sheet states only the release.

## Sub-test: one-off features in the object design

This sub-test is reported separately, as the planner asked. It is about features that have no running device: the system camera screen, a one-time location, share, haptics and notifications. Three variants of the object design were compared:

- **Split rule:** a feature that stays on is an object; a feature that just answers is a plain function (`takePhoto()`, `currentPosition()`).
- **Objects for all:** every feature is an object (`cameraScreen().open()`, `location().current()`, `haptics().tap()`).
- **One import per feature, same verbs:** `camera.takePhoto()` opens the system screen, while `const cam = camera()` is the in-page camera and `cam.takePhoto()` captures from it.

Each variant had 5 writers on 7 tasks. Task 7 was added, so that both camera calls appear in one component.

| Variant | API mistakes | Missing behaviour | Lines, 7 tasks | Confidence | Reader rank (6 readers) |
| --- | --- | --- | --- | --- | --- |
| Split rule | 0 | 0 | 142 (126–159) | 3.7 | first for 6 of 6 |
| Objects for all | 0 | 0 | 149 (143–157) | 3.8 | second for 5 of 6 |
| One import per feature, same verbs | 0 | 0 | 144 (121–179) | 3.8 | last for 5 of 6 |

**Writers.** All 15 answers type-check clean, and the grader found no mistakes. No writer confused the system camera with the in-page camera: all 5 one-import writers used `cam.takePhoto()` for the page and `camera.takePhoto()` for the system screen.

**Readers.**
- **Which call does what:** all 6 named both camera calls correctly in every variant.
- **The one-import variant:** all 6 flagged `cam.takePhoto()` next to `camera.takePhoto()` as a trap: "differ only by `cam` versus `camera`, yet one uses the camera on the page and the other opens a separate system screen".
- **The rules:** all 6 inferred each variant's rule correctly.
- **Objects for all:** all 6 called the setup lines ceremony (`const app = settings(); app.open()`). 5 of 6 asked whether `location()`, made for a one-time read, also starts live tracking.

**Blind writers.** 6 writers saw only the camera object's sheet and guessed the rest. 40 of 42 guesses matched the split rule; 2 matched objects for all (one writer's `systemCamera().capture()`, used twice); none matched one import per feature. All 6 made the live location an object and guessed `share()`, `haptic()` and `scheduleNotification()` as plain functions.

**Spelling: bare tag or namespace.** This compared the bare-tag spelling, `import { camera }` with `<camera el={cam} />`, against the namespace spelling, `import { device }` with `<device.camera el={cam} />`.

- **Readers:** 5 of 6 preferred the namespace. All 6 thought the bare `<camera>` tag comes from the import, but 5 said it reads like an HTML element.
- **Spelling-only blind writers** (6, shown one line of each):
  - **Which would work:** all 6 expected the namespace spelling to work, and none was confident the bare tag would; 3 thought it works only if the compiler matches the tag to the import.
  - **Where the tag comes from:** 2 said a plain unknown HTML element, 3 the import, and 1 could not tell.
  - **Preference:** all 6 preferred the namespace.
  - **Shared complaints:** all 6 also said one name used as both function and tag (`camera()` and `<camera>`) is confusing, and that `el={cam}` is unclear.

Per-answer tallies are in `subtest/tallies.md`.

## Changes during the run

- **Planner additions after the first writers ran:**
  - The state-driven design, as a fifth full design.
  - The `<camera el={cam} />` spelling for the device-objects and hybrid designs. Their first 5 writers each, who used `<cam.area />`, are kept in `raw/writers-superseded/` and not scored.
  - The sub-test and its third variant.
  - The spelling comparison.
- **Tasks I added:** task 5 to the reading questions, so readers could be asked about an element that shows nothing, and task 7 to the sub-test.
- **One element plus functions** is round 1's view-element design, extended to the round 2 devices (recorder, map, video, offline, compass).
- **Rubric error, corrected:** the first graders were told that component bodies cannot read `localStorage`. They applied this to `storage()` and failed all 10 element and state-driven search pages. `storage()` is cookie-backed and a fresh server render reads it (`specs/framework/03-state-graph.md`, "Saved state"). Two fresh graders re-graded check 5 for all 25 answers with the fact corrected; they agreed on every answer, and their results replace the first ones.
- **One grader slip:** on check 2 in the state-driven design, grader 2 gave the same reason as grader 1 ("removes `<device.camera>` from the markup ... which the sheet says releases it") with the yes/no inverted. I counted it as released.
- **Two read-only reviews checked the reference solutions for equal care before the readers ran.** Between them they raised 16 findings, some of them optional polish. I fixed the ones that changed behaviour or made the designs unequal before any reader saw the code. Examples:
  - The state-driven voice memo let Record be pressed after a refusal.
  - The element design's voice memo had no refusal message.
  - A heading placeholder appeared in only some designs.

## Limits

- **One model family.** Every writer, grader, reader and reviewer was a fresh Opus subagent. They shared the repo's `CLAUDE.md` context, which I could not remove; it mentions `element()` handles and parts.
- **Small samples.** There were 5 writers per design, 8 readers, 2 graders and 2 reading scorers. The sub-test had 5 writers per variant, 6 readers, 6 blind writers and 6 spelling-only writers, with one grader; I classified the sub-test reader and spelling answers myself. Ranges are given where graders differed. A difference of one answer in five is within noise.
- **Nothing compiled or ran.** Answers were type-checked against the sheets with the repo's Markless-aware checker; a planted bad name was rejected. Nothing was built into an app or run on a device. The sheets describe packages that do not exist.
- **I wrote every sheet and reference solution.** Readers judged my reference code, not the writers'. The reviews above reduced, but cannot remove, differences in care. The sheets' wording of guarantees also differs. For example, the parts sheet promises a shutter part that is disabled until the camera is ready, so check 1 measures sheet promises as much as writer behaviour.
- **The reading test has a ceiling.** Three designs scored 100%, so only the rank separates them.
- **The sub-test used a shorter primer** than the main study.

## Files

All paths are relative to `round2/`.

- **Study inputs:**
  - `tasks.md`: the eight tasks and the label key (WZ parts, JR device objects, ZK objects plus parts, DU one element plus functions, KJ state-driven).
  - `sheets/`: the signature sheets, which double as the `.d.ts` files for type checking.
  - `solutions/`: the reference solutions.
  - `rubric.md`, `reading-questions.md` (questions and answer key, written before any reader ran).
- **Prompts and raw answers:**
  - `prompts/`: every prompt, word for word.
  - `raw/`: every raw answer, plus grader and scorer JSON (`raw/grades/`, `raw/scores/`) and the two reviews (`raw/review/`).
- **Scores:**
  - `scores.csv`: one row per writer answer and task.
  - `scores-reading.csv`: one row per reader, design and question.
  - `check/scores.py` rebuilds both.
- **Sub-test:** `subtest/` holds its own tasks, sheets, solutions, prompts, raw answers and tallies.
