# Device API A/B: which shape is most intuitive to a consumer?

> **Round 2** (`round2/report.md`): five new designs on eight tasks. Writers made no API mistakes in any of them. Readers ranked device objects shown with `<camera el={cam} />` clearest (first for 8 of 8 readers) and parts with visible state least clear. A separate sub-test favoured plain functions for one-off features and the `<device.camera>` namespace spelling.

## Summary

Given only a signature sheet, consumers made almost no API mistakes in any of the six designs, so correctness did not separate them. What did: device objects and compound parts produced the shortest code. Readers ranked device objects clearest (first for 7 of 8 readers) and compound parts least clear (last for 6 of 8). Blind consumers, with no docs, most often invented the explicit-permissions and view-element-plus-functions shapes. On the tasks where the designs differ, they never invented the web-standard one.

| Design | Blind-guess share | API mistakes per task (phase 2) | Missing behaviour | Lines of code, all 8 tasks | Reader comprehension | Reader clarity rank |
| --- | --- | --- | --- | --- | --- | --- |
| View element plus functions | 6 of 32 (38 of 64) | 0.00 (type checker: 1 unguarded handle) | 0 of 40 | 191 (170–201) | 100% | 2.1 |
| Compound parts | 5 of 32 (37 of 64) | 0.00 | 0 of 40 | 158 (153–161) | 98% | 5.8 |
| Web-standard names | 0 of 32 (8 of 64) | 0.03 (1 config grant left out) | 0 of 40 | 259 (246–267) | 98% | 4.9 |
| Explicit permissions | 13 of 32 (13 of 64) | 0.00 (type checker: 2 unguarded handles) | 0 of 40 | 258 (224–298) | 94% | 3.4 |
| Device objects | 3 of 32 (3 of 64) | 0.00 | 0 of 40 | 160 (152–173) | 99% | 1.1 |
| Blind consensus | built from the blind answers (17 of 32 by construction) | 0.00 | 0 of 40 | 252 (235–303) | 96% | 3.8 |

How to read the columns:

- **Blind-guess share:** how many blind answers matched the design's shape. The first number counts only the four tasks where the designs actually differ (live camera, offline and compass, voice memo, notification), across 8 consumers. The number in brackets counts all eight tasks, where the view-element and compound-parts designs share plain function names that almost every consumer guessed anyway.
- **API mistakes per task:** names used that the sheet does not declare, plus wrong uses of names it does declare, averaged over two independent graders and 40 task answers (5 consumers × 8 tasks). The type-checker notes come from checking every answer against the sheet as a real `.d.ts` with the repo's Markless-aware checker.
- **Missing behaviour:** required behaviours the graders found absent, out of 40 task answers.
- **Lines of code:** non-blank lines across all eight tasks, mean over 5 consumers, with the lowest and highest in brackets.
- **Reader comprehension:** share of 11 questions answered as in the key, averaged over 8 readers and 2 scorers.
- **Reader clarity rank:** mean rank of 8 readers, where 1 is clearest.

What the numbers support, given the spread within each design:

- **Shortest code.** Compound parts (153–161 lines) and device objects (152–173) are both shorter than view element plus functions (170–201), and all three are shorter than the other three designs (224–303). None of these ranges overlap.
- **Clarity ranking.** Device objects first and compound parts last are near-unanimous. Design order was shuffled for each reader, and both results held across the eight orders.
- **Self-rated confidence.** Explicit-permissions consumers rated their code lowest, averaging 3.02 out of 5 (per-consumer range 2.62–3.38) against 3.50–3.67 for the others (3.38–3.88). The ranges touch at 3.38, so this is a lean, not a clean separation.
- **Not separable: mistakes, missing behaviour and comprehension.** All three sit at or near the ceiling for every design. Differences of one or two points are within the spread.

## Method in brief

Every consumer was a fresh Opus subagent given a self-contained prompt. No consumer made a tool call, which I checked in each transcript, and each received its saved prompt byte for byte. Consumers were told the app runs on phones and got the Markless primer (`packages/core/agent/markless.md` plus `agent/async.md`).

**Phase 1:** 8 consumers wrote all eight tasks with no device docs, listing the imports they assumed. I classified each task answer by the design it was closest to (`phase1-classification.md`). Design 6 (blind consensus) is the most common shape per task. It differs from all five other designs, so it was tested.

**Phase 2:** 5 consumers per design (30 in total) wrote all eight tasks from one sheet, rating their confidence per task and listing their guesses. Two graders scored each answer against the sheet, the reference solutions and a fixed rubric (`rubric.md`). Each grader scored the five answers of one design, so 12 graders covered the 30 answers twice. The two graders never differed by more than one on any count, so no third grader was needed.

Every answer was also type-checked against its sheet as a `.d.ts` (`check/run.mjs`). Device names used were counted with the TypeScript checker over the generated TSX (`check/names.mjs`); the column is `deviceExports` in `scores.csv`. I replaced the graders' own name counts because the two graders for a design counted by different rules (some counted object keys and fields, some only imports). That made their totals unusable, ranging from 12 to 75 per answer for similar code.

**Phase 3:** 8 readers got my reference solutions for tasks 2, 3 and 6 for all six designs, in a different shuffled order each, with no sheet and no docs. Each answered 11 fixed questions per design and ranked the designs for clarity. The question set includes the planner's added question: is the camera view one element or several? The answer key (`phase3-questions.md`) was written before any reader ran. Two scorers marked the answers against the key independently and never split by a full point.

## Where designs differ sharply, by task

- **Task 2, live camera:**
  - Mean lines: compound parts 22, device objects 28, view element 35, blind consensus 47, explicit permissions 48, web-standard 56.
  - Readers could not tell when the compound-parts error part appears, or whether the preview hides. Scorers marked this down only lightly (2 of 8 points lost).
  - Asked whether the camera view is one element or several, 3 of 8 readers called the blind-consensus `<video>` "several pieces" and a fourth called it "a native element plus a behaviour working together". They saw a plain `<video>`, an attached `cameraPreview` behaviour and a separate `capturePhoto` function. My key had said "one", so that key entry looks wrong as a description of how the code reads.
  - All 8 readers saw compound parts as several parts. 2 of 8 called the web-standard view several pieces (view, stream and track).
- **Task 5, offline banner and compass:**
  - Designs that read live values through a function call (`isOnline()`, `heading()`) drew the lowest confidence: view element 3.0, compound parts 2.4. All 5 view-element consumers wrapped the calls in `computed(() => isOnline())` "in case", because the sheet's "live value" did not say how it plugs into Markless reactivity.
  - Device objects (`network().online`, `compass().heading`) drew 3.8.
  - The callback designs needed an `attach` with cleanup: explicit permissions averaged 25.6 lines, blind consensus 19.6, against 13–18 for the others.
- **Task 6, voice memo:**
  - A recorder object with live fields stayed short: device objects 24 lines, compound parts 25, view element 35.
  - A recording handle plus a timer the app writes itself ran 63 lines (blind consensus). A `MediaRecorder` with chunks and a timer ran 70 (web-standard). Explicit permissions ran 53.
  - All 5 web-standard and all 5 blind-consensus answers wrote their own `setInterval` for the elapsed seconds.
- **Task 7, notification:**
  - Explicit permissions had the lowest confidence of any task in the study (2.0) and 43 lines, against 28–31 for the others.
  - The cause: the sheet returns the tap through a listener, so each consumer had to decide where to mount it. All 5 used `window.location.assign` to open the order page.
  - In 2 of 5 the tap does not reliably open the order: one defines the listener component but never mounts it, and one keeps the listener only while the reminder component is on screen.
  - Graders did not count either as missing behaviour; I note them here as a partial gap.
- **Task 8, share:** web-standard and blind consensus ran about 20 lines because their sheets say a dismissed sheet rejects with `AbortError`, so consumers caught it. Device objects and compound parts took 7.

## Commonest problems per design

Mistakes against the sheets were nearly absent, so these are the recurring frictions graders noted and consumers listed as guesses.

- **View element plus functions:**
  - Unsure how live-value functions track: 5 of 5 wrapped them, as in `const online = computed(() => isOnline());`.
  - One unguarded handle call, `onClick={() => camera.capture()}`. The type checker flagged it: `'camera' is possibly 'undefined'`.
  - Wrapped `share()` in an empty `catch` although the sheet says it resolves on close (5 of 5, per one grader).
- **Compound parts:**
  - The trigger part cannot show whether it is recording, so 5 of 5 labels are static: `<recorder.trigger>Record / Stop</recorder.trigger>` (or a variant).
  - Guessed that parts take ordinary children. One consumer wrote: "I assumed `<camera.trigger>` and `<recorder.trigger>` accept text children as their button label."
  - In phase 3, readers said the parts hide behaviour. From the rankings: "The compound parts hide when the error shows, what the toggle trigger does, and where the seconds come from."
- **Web-standard names:**
  - Plumbing: 5 of 5 kept the `MediaStream`/`MediaRecorder` in a module and ran their own `setInterval`. Graders flagged the late state writes that follow.
  - One answer left the camera grant out of config: "No 'camera' grant in markless.config.ts". This is the only counted mistake in the study.
  - Config was repeated per task folder in 2 answers.
- **Explicit permissions:**
  - Two unguarded handle calls, `photo = await cam.takePicture();`, both flagged by the type checker (`'cam' is possibly 'undefined'`).
  - Permission requested from inside an async load with no user gesture (3 of 5, per one grader).
  - The refusal message shown only when `canAsk` is false, so "a 'denied' state that can still ask shows only the Allow button" (1 of 5).
  - The tap-listener placement problems described under task 7.
- **Device objects:**
  - Consumers worried whether a device object held in a body `const` may be read by handlers. One grader noted it in 5 of 5 answers: "possible MARKLESS_HANDLER_READS_RENDER_LOCAL risk".
  - Graders queried an `@if` placed directly inside `@else` (3 answers). The Markless checker accepted it with no parse error.
- **Blind consensus:**
  - Unsure whether an async load runs on the server (graders noted this in 4 of 5 answers).
  - One consumer abandoned the async `@try` pattern for task 3 and wrote its own loading state through an `attach` factory: "relies on attach restarting when `attempt` state changes (unverified Markless behaviour)".

## Planner's tallies

**How blind consumers spelled the live camera view.** All 8 wrote a plain `<video>`. None used a lowercase built-in tag, an imported uppercase component or a hyphenated tag. None imported the view itself, but all 8 imported a device helper that drives it: an `attach` behaviour for 5, a session opener called from `attach` for 3. Three bound an `element()` handle using an invented `ref={…}` prop. Details are in `phase1-classification.md`.

**Is the camera view one element or several (phase 3, question 4)?** Readers answered:

- Compound parts: several, 8 of 8.
- Blind consensus: several, 3 of 8, plus 1 more who called it an element and a behaviour working together (against my key's "one").
- Web-standard: several, 2 of 8.
- Explicit permissions: several, 1 of 8.
- Device objects: 2 of 8 described it as two pieces (a controller object plus the preview).
- View element plus functions: one, 8 of 8.

## Blind guesses in more detail

On the four tasks where the designs differ, the shapes blind consumers invented were:

- **Camera:** a plain `<video>` driven by an imported `attach` helper (6 of 8), or an explicit permission request first (2).
- **Live values:** callback subscriptions that return a stop function (5 of 8), objects with live fields (2), a function read like state (1).
- **Recording:** a start function that returns a handle with `stop()` (5 of 8), module-level start and stop functions (2), an object with live fields (1).
- **Notification:** a `url` on `scheduleNotification` (8 of 8), with half also asking for permission first.

No blind consumer guessed a compound-parts camera, `getUserMedia`, a `grants` config line or a device-object camera.

## Limits

- **One model family.** Every consumer, grader, reader and scorer was Opus, as was the orchestrator that wrote the sheets and the reference solutions. Its training favours web and Expo shapes. The phase 1 guesses lean that way: callback listeners, `<video>` and AbortError.
- **Small samples.** 8 blind consumers, 5 consumers per design in phase 2 (30 in total), 2 graders per answer, 8 readers, 2 scorers. Within-design spreads are given in the summary. I have not called a difference real where those ranges overlap.
- **Ceiling effect.** With a sheet in hand, consumers made close to zero mistakes in every design. Phase 2 therefore cannot rank designs on correctness, only on size, confidence and guesses.
- **Nothing ran.** Answers were type-checked against the sheets (which catches unknown names, wrong types and Markless parse errors), but nothing was compiled into an app or run on a device. The sheets describe packages that do not exist.
- **Extra context.** The harness gives each subagent the repo's `CLAUDE.md` and git status alongside my prompt, and I could not remove them. `CLAUDE.md` mentions `element()` handles and `@markless/ui` part naming, which may favour the view-element and compound-parts shapes.
- **Reading test inputs.** Phase 3 readers read reference solutions I wrote. View element and device objects share an identical voice-memo solution, and four designs share near-identical location code, so the reading test mostly separates designs on the camera task. Readers got code only, without the primer.
- **Answer key judgement calls.** Two key entries are debatable: question 7 for explicit permissions (whether the page re-runs by itself after Settings) and question 4 for blind consensus (one element or several). Most of explicit permissions' lower comprehension score comes from the first of these.
- **Single classifier and synthesis.** The phase 1 classification is mine alone. Design 6 is my synthesis of the blind answers, so its blind-guess share is high by construction.
- **Sheet lengths.** The sheets range from 52 to 69 lines. Explicit permissions is the longest because it declares one permission object per feature.

## Files

- `tasks.md`: the eight tasks and the label key. The labels used in file names are EJ (view element plus functions), UW (compound parts), AU (web-standard names), KO (explicit permissions), MS (device objects) and BC (blind consensus).
- `sheets/`: the six signature sheets, which are also the `.d.ts` files used for type checking.
- `solutions/`: reference solutions, 8 per design.
- `primer.md`: the primer given to consumers.
- `rubric.md`: the grading rubric.
- `phase3-questions.md`: the reading questions and the answer key.
- `prompts/`: every consumer, grader, reader and scorer prompt, plus the shuffled reader orders.
- `raw/`: every raw answer (`phase1/`, `phase2/`, `phase3/`) and grader and scorer output (`phase2-grades/`, `phase3-scores/`).
- `phase1-classification.md`: the blind-guess classification and the camera-spelling tally.
- `scores.csv`: one row per phase 2 answer and task, with lines, device exports, confidence, both graders' counts, type-checker errors and guesses listed.
- `scores-phase3.csv`: one row per reader, design and question, with both scorers' marks.
- `check/`: the type-check harness (`run.mjs`), the checker-based name counter (`names.mjs`), the transcript extractor (`extract.py`), the table builder (`phase2-table.py`) and the mapping from agent to answer. Scratch output in `check/work/` is not committed.
