## KO
Q1: If access was refused, they see "Camera access is off. Allow it in Settings to take photos." with no preview or shutter; before they have answered, they see an "Allow camera" button instead.
Q2: The back camera, since `facing` starts as `'back'`.
Q3: `cam.takePicture()` returns a `Picture` that is kept in `photo` and shown as an `<img>` from `photo.uri`; where that file lives on the phone is not shown (I assume a temporary file).
Q4: One element, `<CameraView>`, held through an `el` handle, with ordinary buttons beside it.
Q5: "Finding your location…" from the `@pending` branch, which also covers the permission prompt.
Q6: The code asks for permission, and if refused it throws, so they see "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: Settings opens; the computed reads `permission.state`, so it might re-run by itself on return if that value is live, but this is not shown, and I would assume the error stays until they tap "Try again".
Q8: `reset` runs the computed again: it checks permission, asks again if needed, then reads the position.
Q9: Tapping "Stop", which awaits `AudioRecorder.stop()`.
Q10: From the recorder's `'progress'` events (`status.seconds`), listened to through `attach` on the div shown while recording.
Q11: An `<audio controls>` element plays the returned `clip.uri`.

## EJ
Q1: When `onError` reports `NotAllowedError`, the preview is replaced by the "Camera access is off…" message, but the "Take photo" and "Switch camera" buttons stay on screen.
Q2: The back camera.
Q3: `camera.capture()` sends the photo to `onChange`, which stores it in `photo`, and it is shown as an `<img>` from `photo.url`.
Q4: One element, `<Camera>`.
Q5: "Finding your location…".
Q6: The catch branch shows "Location access is off. Turn it on in Settings." plus both buttons; the permission prompt itself is not shown and is presumably triggered inside `currentPosition()`.
Q7: Settings opens; nothing shows the page updating on return, so I would assume it stays on the error until "Try again".
Q8: `reset` runs `currentPosition()` again, which presumably asks for permission again.
Q9: The "Stop" button calls `rec.stop()`.
Q10: `rec.elapsed`, kept up to date by the package's `recorder()`.
Q11: An `<audio controls>` element plays `rec.clip.url`.

## MS
Q1: When `cam.status === 'denied'`, they see the "Camera access is off…" message instead of the preview, and both buttons still show.
Q2: The back camera, from `camera({ facing: 'back' })`.
Q3: `await cam.capture()` returns a `Photo`, which is stored in `photo` and shown as an `<img>` from `photo.url`.
Q4: Two pieces work together: a camera controller with no visible output, `camera()`, and one `<Preview of={cam}>` element that displays it.
Q5: "Finding your location…", shown whenever `where.position` is empty.
Q6: When `where.status === 'denied'`, they see "Location access is off…" with "Open Settings" and "Try again".
Q7: Settings opens; because `location()` looks like a live, reactive value, I would assume it re-checks when the app returns and the page updates by itself, but this is not shown.
Q8: `where.refresh()` asks for the position again, presumably re-requesting permission as well.
Q9: The "Stop" button calls `rec.stop()`.
Q10: `rec.elapsed`, kept by the package's `recorder()`.
Q11: An `<audio controls>` element plays `rec.clip.url`.

## BC
Q1: When `onError` reports `NotAllowedError`, the `<video>` is replaced by the message, but both buttons remain.
Q2: The back camera.
Q3: `capturePhoto(video)` returns a `Photo`, which is stored in `photo` and shown as an `<img>` from `photo.url`.
Q4: A plain `<video>` element driven by a `cameraPreview(...)` attachment, so a native element plus a behaviour working together.
Q5: "Finding your location…".
Q6: The catch branch shows the "Location access is off…" message with both buttons.
Q7: Settings opens; nothing shows the page updating on return, so I would assume it stays on the error until "Try again".
Q8: `reset` re-runs the computed, which calls `getPosition` again with a new abort signal.
Q9: The "Stop" button calls the app's own `end()`, which calls `recording.stop()`.
Q10: The app's own `setInterval` in `memo.ts`, which counts whole seconds since `Date.now()` at start.
Q11: `end()` returns `clip.url`, which an `<audio controls>` element plays.

## AU
Q1: If `getUserMedia` rejects with `NotAllowedError`, they see the "Camera access is off…" message with no preview and no shutter; "Switch camera" stays.
Q2: The back camera, since `'environment'` is the rear camera.
Q3: `takePhoto` returns a Blob, which becomes an in-memory object URL shown as an `<img>`; it is not saved anywhere.
Q4: One `<MediaView>` element showing a separately computed media stream.
Q5: "Finding your location…".
Q6: The catch branch shows "Location access is off…" with both buttons; the permission is declared in `markless.config.ts` with its usage text in `strings/permissions.json`.
Q7: Settings opens; nothing shows the page updating on return, so I would assume it stays on the error until "Try again".
Q8: `reset` re-runs `getCurrentPosition()`.
Q9: "Stop" calls `stopMemo()`, which stops the `MediaRecorder`; its `onstop` handler then stops the microphone tracks.
Q10: The app's own `setInterval` counting seconds since start.
Q11: The recorded chunks are combined into a Blob, turned into an object URL and played in `<audio controls>`.

## UW
Q1: The `<camera.error>` part presumably shows "Camera access is off…"; which errors it covers and whether the preview hides are not shown.
Q2: The back camera.
Q3: `<camera.trigger>` takes the photo, the root's `onChange` delivers it to `photo`, and it is shown as an `<img>` from `photo.url`.
Q4: Several parts working together: `root`, `area`, `error` and `trigger`.
Q5: "Finding your location…".
Q6: The catch branch shows "Location access is off…" with both buttons.
Q7: Settings opens; nothing shows the page updating on return, so I would assume it stays on the error until "Try again".
Q8: `reset` re-runs `currentPosition()`.
Q9: Pressing `<recorder.trigger>` a second time, since it presumably toggles start and stop (inferred from its label, not shown).
Q10: `<recorder.valuelabel />` inside the indicator, which the package fills; that it counts seconds is assumed from the trailing "s".
Q11: The root's `onChange` delivers a `Clip`, played by `<audio controls src={clip.url}>`.

## Ranking
1. MS: State is spelled out (`status`, `position`, `refresh`, `recorder` fields), so every outcome is visible in the markup.
2. EJ: Short and familiar, but camera refusal only shows up through an error-name check, and the shutter stays visible.
3. KO: Permission handling is explicit and complete, at the cost of more manual wiring.
4. BC: Readable, but the attachment-based preview and a hand-written memo timer add moving parts.
5. UW: Compact, but key behaviour is hidden inside parts: the trigger toggling, what `valuelabel` counts, and when the error part shows.
6. AU: Raw web media APIs, object URLs and permissions declared in config spread the logic across files.

Tools used: none