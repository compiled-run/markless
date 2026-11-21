## KO
Q1: Once refused, they see "Camera access is off. Allow it in Settings to take photos." Before they are asked, they see an "Allow camera" button.
Q2: The back camera (`facing` starts as `'back'`).
Q3: `takePicture()` returns it into the `photo` state, and it shows as an `<img>` using `photo.uri`.
Q4: One element, `<CameraView>`, held by an `el` ref, with ordinary buttons calling methods on it.
Q5: "Finding your location…" (the `@pending` branch).
Q6: The thrown message "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again" buttons.
Q7: Not shown; it might refresh by itself if `permission.state` is reactive and was tracked by the computed, but I would assume the error stays until "Try again".
Q8: `reset` re-runs the computed: it checks the permission again, may ask again, then fetches the position.
Q9: The Stop button, which calls `AudioRecorder.stop()`.
Q10: The recorder's `'progress'` events, which the listener on the recording `<div>` writes into `seconds`.
Q11: An `<audio controls>` element playing `clip.uri`.

## AU
Q1: The `@catch` shows "Camera access is off. Allow it in Settings to take photos." (for `NotAllowedError`), and the Switch camera button stays visible.
Q2: The back camera (`'environment'`).
Q3: `takePhoto` returns a Blob, which becomes an object URL in `photoUrl` and is shown as an `<img>`.
Q4: Several pieces working together: a `getUserMedia` stream, a `<MediaView>` showing it, and `takePhoto` on the stream's video track.
Q5: "Finding your location…".
Q6: "Location access is off. Turn it on in Settings." (for `NotAllowedError`) plus the two buttons.
Q7: Nothing happens on its own; the error stays until they tap "Try again" (no automatic refresh is shown).
Q8: `reset` re-runs the computed, which calls `getCurrentPosition()` again.
Q9: The Stop button, which calls `stopMemo()`: it stops the `MediaRecorder` and then the stream tracks.
Q10: The app's own `setInterval` timer in `memo.ts`, not the device package.
Q11: The recorded chunks become a Blob object URL, played in an `<audio controls>` element.

## MS
Q1: "Camera access is off…" replaces the preview, but the shutter and switch buttons stay visible.
Q2: The back camera (`camera({ facing: 'back' })`).
Q3: `cam.capture()` returns it into the `photo` state, shown as an `<img>` using `photo.url`.
Q4: One element, `<Preview of={cam}>`, driven by a camera object.
Q5: "Finding your location…", shown while `where.position` is empty.
Q6: "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: Not shown; I would assume `location()` notices the permission change and the page updates by itself, since everything is reactive state, but that is a guess.
Q8: It calls `where.refresh()`, which presumably asks for the location again.
Q9: The Stop button, which calls `rec.stop()`.
Q10: `rec.elapsed`, which the `recorder()` object provides.
Q11: An `<audio controls>` element playing `rec.clip.url`.

## BC
Q1: The message replaces the `<video>` once `onError` reports `NotAllowedError`; the shutter and switch buttons stay visible.
Q2: The back camera.
Q3: `capturePhoto(video)` takes a frame from the video element into the `photo` state, shown as an `<img>` using `photo.url`.
Q4: Several pieces: a plain `<video>`, a `cameraPreview` attachment that feeds it, and a separate `capturePhoto` function.
Q5: "Finding your location…".
Q6: "Location access is off. Turn it on in Settings." plus the two buttons.
Q7: Nothing happens on its own; the error stays until "Try again" (no automatic refresh is shown).
Q8: `reset` re-runs the computed, which calls `getPosition` again; the `signal` cancels any earlier request still running.
Q9: The Stop button: `end()` calls `recording.stop()` on the active `Recording`.
Q10: The app's own `setInterval` timer in `memo.ts`.
Q11: An `<audio controls>` element playing the clip URL that `end()` returns.

## EJ
Q1: The message replaces the `<Camera>` once `onError` reports `NotAllowedError`; the buttons stay visible.
Q2: The back camera.
Q3: `camera.capture()` delivers the photo through the `onChange` handler into the `photo` state, shown as an `<img>`.
Q4: One element, `<Camera>`, held by an `el` ref.
Q5: "Finding your location…".
Q6: "Location access is off. Turn it on in Settings." plus the two buttons.
Q7: Nothing happens on its own; the error stays until "Try again" (not shown).
Q8: `reset` re-runs the computed, which calls `currentPosition()` again.
Q9: The Stop button, which calls `rec.stop()`.
Q10: `rec.elapsed`, from the `recorder()` object.
Q11: An `<audio controls>` element playing `rec.clip.url`.

## UW
Q1: The text inside `<camera.error>`; I assume it appears only when access is refused, but the code does not show when it appears.
Q2: The back camera.
Q3: `<camera.trigger>` captures, `onChange` puts the photo in the `photo` state, and it shows as an `<img>` inside the root.
Q4: Several parts working together: `camera.root`, `camera.area`, `camera.error` and `camera.trigger`.
Q5: "Finding your location…".
Q6: "Location access is off. Turn it on in Settings." plus the two buttons.
Q7: Nothing happens on its own; the error stays until "Try again" (not shown).
Q8: `reset` re-runs the computed, which calls `currentPosition()` again.
Q9: Pressing the same `<recorder.trigger>` a second time, I assume, since it is labelled "Start or stop recording"; the code does not show this.
Q10: `<recorder.valuelabel />`, which the recorder renders inside its indicator; where the number comes from is hidden.
Q11: `onChange` hands back a `Clip`, played in an `<audio controls>` element using `clip.url`.

## Ranking
1. MS: Each screen just reads plain state (`status`, `position`, `recording`, `elapsed`, `clip`), with almost no wiring.
2. KO: Permission handling is explicit and every step is visible, though it takes more steps and whether location refreshes by itself is unclear.
3. EJ: One camera element and a simple recorder object, but a photo arriving through `onChange` is not obvious.
4. BC: The functions are clear, but the camera is split across a video element, an attachment and a capture function, and the memo needs a hand-written timer file.
5. AU: Web-standard APIs mean stream, track and Blob plumbing, a manual timer, and string checks on error names.
6. UW: Compound parts hide when the error shows, how start and stop toggle, and where the seconds come from.

Tools used: none