# Phase 1: blind guesses, classified

Eight fresh Opus consumers wrote the eight tasks with no device docs (prompt: `prompts/phase1.md`, answers: `raw/phase1/`). None made a tool call (checked in each transcript), and each one received the saved prompt unchanged.

Each cell names the design whose shape the answer is closest to. Where two designs share a shape for a task, the cell names both: designs EJ and UW use the same imported functions for tasks 1, 3, 4, 5, 7 and 8, and EJ, UW and AU all spell sharing `share({ title, url })`.

Rules used: an explicit permission request call (`requestPermission(...)`, `requestNotificationPermission()`) classifies the task as KO (explicit permissions). Otherwise the shape decides: an awaited function returning the answer is EJ/UW; a callback subscription that returns a remove function is KO; an object with live fields is MS (or EJ when it is a recorder object, since EJ and MS share that shape); a live value read through a function call is EJ/UW.

| Task | c1 | c2 | c3 | c4 | c5 | c6 | c7 | c8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 photo via camera screen | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW |
| 2 live camera | other A | other B | other B | other B | KO | other A | KO | other A |
| 3 location | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW |
| 4 like + haptic | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW | EJ/UW |
| 5 offline + compass | KO | KO | KO | KO | MS | MS | EJ/UW | KO |
| 6 voice memo | KO | other C | other C | other C | EJ/MS | KO | other C | other C |
| 7 notification | KO | EJ/UW | KO | KO | EJ/UW | EJ/UW | EJ/UW | KO |
| 8 share | EJ/UW/AU | EJ/UW/AU | EJ/UW/AU | EJ/UW/AU | EJ/UW/AU | EJ/UW/AU | EJ/UW/AU | EJ/UW/AU |

The three "other" shapes:

- **other A**: a plain `<video>` with an `attach` behaviour imported from the device package (`attach={cameraPreview({ facing, onError })}` or `cameraPreview(node, …)`), plus a capture function that takes the video handle (`capturePhoto(video)`, `capturePreview(video)`, `captureFrame(video)`).
- **other B**: a plain `<video>` whose `attach` opens a camera session object (`openCamera(video, { facing })`, `startCamera(el, { facing })`), which has `capture()`, `setFacing()` and `stop()`/`close()`. The session is kept in a plain `.ts` module.
- **other C**: `startRecording()` resolves a recording handle with `stop(): Promise<{ url, durationMs }>`, kept in a `.ts` module, with the elapsed-seconds timer written by the app (`setInterval`).

KO for tasks 6 (c1, c6) means module-level `startRecording()` / `stopRecording()` functions, closest to the explicit-permissions sheet's `AudioRecorder.start()` / `.stop()`. It is a loose match, because the app still runs its own timer.

## Blind-guess share per design

The table counts task answers (8 consumers × 8 tasks = 64) whose shape matches each design. A shared shape counts for every design that has it.

| Design | All 8 tasks (of 64) | Tasks 2, 5, 6, 7 only, where the designs differ (of 32) |
| --- | --- | --- |
| EJ view element plus functions | 38 | 6 (task 5 ×1, task 6 ×1, task 7 ×4) |
| UW compound parts | 37 | 5 (task 5 ×1, task 7 ×4) |
| AU web-standard names | 8 | 0 |
| KO explicit permissions | 13 | 13 (task 2 ×2, task 5 ×5, task 6 ×2, task 7 ×4) |
| MS device objects | 3 | 3 (task 5 ×2, task 6 ×1) |
| other | 11 | 11 (task 2 ×6, task 6 ×5) |

## How the live camera view was spelled (planner's tally)

| Spelling | Consumers |
| --- | --- |
| lowercase built-in tag (`<camera>`) | 0 |
| uppercase imported component (`<Camera>`) | 0 |
| hyphenated tag | 0 |
| plain `<video>` | 8 (c1–c8) |
| other | 0 |

No consumer imported the view itself: in each of the eight answers the `<video>` is the built-in element. Each of the eight imported a device-package helper that drives it: an `attach` behaviour (c1, c5, c6, c7, c8) or a session opener called from `attach` (c2, c3, c4). Three bound an `element()` handle to it with an invented `ref={…}` prop (c1, c6, c8). Two asked for camera permission first (c5, c7).

## Other recurring guesses

- Refusal error name: `NotAllowedError` from 4 consumers (c1, c2, c3, c8), `PermissionDeniedError` from 3 (c4, c6, c7); c5 never checked a name.
- Cancelling the camera screen or share sheet: 7 of 8 expected an `AbortError` rejection; c8 expected `null`.
- `openSettings()` returning a promise: 8 of 8.
- `haptic('light')`: 8 of 8.
- Notification tap: 8 of 8 put a `url` on `scheduleNotification`, and c8 also added an `onNotificationTap` listener. 4 of 8 asked for notification permission first.
- Config file for permission usage text: 1 of 8 (c6 invented `markless.device.json`).
- Markless syntax they had to guess: 4 of 8 said in their notes that the primer names `attach` and `element()` but never shows how to write them. Each of the eight used `attach={fn}`.

## Design 6 (BC, blind consensus)

Design 6 is written from the most common shape per task above. It is not the same as any existing design: the camera is a plain `<video>` driven by an imported `attach` behaviour, live values are callback subscriptions, and recording returns a handle. So it is tested in phase 2. Ties and choices:

- Task 7 split 4–4 on asking for notification permission first. The sheet has no request call, because on the camera and location tasks 6 of 8 never asked first.
- The refusal error name follows the more common guess, `NotAllowedError`.
- The camera follows other A (3 answers) rather than other B (3 answers), because two more answers (c5, c7) also used an `attach={cameraPreview({ facing })}` behaviour, after a permission request.
