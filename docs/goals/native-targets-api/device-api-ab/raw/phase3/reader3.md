## MS
Q1: The preview is replaced by "Camera access is off. Allow it in Settings to take photos." The Take photo and Switch camera buttons still show.
Q2: The back camera, from `camera({ facing: 'back' })`.
Q3: `cam.capture()` returns a photo that goes into the `photo` state and shows as an `<img>` using `photo.url`.
Q4: One element, `<Preview of={cam} />`, driven by a `cam` object created in script.
Q5: "Finding your location…", shown while `where.position` is empty and access is not denied.
Q6: "Location access is off. Turn it on in Settings." with the Open Settings and Try again buttons.
Q7: The code does not show whether `where.status` refreshes when the app comes back; I would assume it stays on the denied message until the person taps Try again.
Q8: It calls `where.refresh()`, which I assume asks for permission and the location again (the code does not show this).
Q9: The Stop button calls `rec.stop()`.
Q10: The package supplies it as `rec.elapsed`.
Q11: `rec.clip.url` plays in an `<audio controls>` element.

## KO
Q1: Only "Camera access is off. Allow it in Settings to take photos.", with no preview, shutter or switch; before the person answers, an "Allow camera" button shows instead.
Q2: The back camera, from the `facing` state starting at `'back'`.
Q3: `cam.takePicture()` returns a picture that goes into `photo` and shows as an `<img>` using `photo.uri`.
Q4: One `<CameraView>` element, but it needs an element handle and a separate `cameraPermission()` object to work.
Q5: "Finding your location…" from `@pending`, which also covers the time the permission prompt is open.
Q6: The thrown message "Location access is off. Turn it on in Settings." with Open Settings and Try again.
Q7: `permission.state` is read inside the async value, so it might re-run when the app resumes if that state refreshes, but the code does not show this; I would assume it stays on the error until Try again.
Q8: It resets the `@try` block, which re-runs the async value: check permission, ask again if needed, then get the position.
Q9: The Stop button calls `AudioRecorder.stop()` and sets `recording` to false.
Q10: A `'progress'` listener on `AudioRecorder`, attached while the recording block is on screen, writes `status.seconds` into the `seconds` state.
Q11: The clip's `uri` goes into the `clipUri` state and plays in an `<audio controls>` element.

## UW
Q1: `<camera.error>` shows the message; whether the preview area and shutter also hide is not shown, and I would assume they do.
Q2: The back camera, from the `facing` state starting at `'back'`.
Q3: `<camera.trigger>` takes the photo, the root's `onChange` puts it into `photo`, and it shows as an `<img>` using `photo.url`.
Q4: Several parts working together: `camera.root`, `camera.area`, `camera.error` and `camera.trigger`.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." (when the error is `NotAllowedError`) with Open Settings and Try again.
Q7: Nothing shown makes it update by itself; it stays on the error until the person taps Try again.
Q8: It resets the `@try` block, which calls `currentPosition()` again.
Q9: Pressing `<recorder.trigger>` a second time, since it toggles start and stop (inferred from its label, not shown).
Q10: `<recorder.valuelabel />` inside `<recorder.indicator>`, supplied by the recorder parts.
Q11: The root's `onChange` puts the clip into `clip`, and `clip.url` plays in an `<audio controls>` element.

## AU
Q1: The `@catch` shows "Camera access is off. Allow it in Settings to take photos." (on `NotAllowedError`); the Switch camera button still shows.
Q2: The back camera, since `'environment'` is the starting `facingMode`.
Q3: `takePhoto` returns a blob, which becomes an object URL in `photoUrl` and shows as an `<img>`.
Q4: One `<MediaView>` element fed a stream from `getUserMedia`, with the separate `takePhoto` function used for the shutter.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again.
Q7: Nothing shown makes it update by itself; it stays on the error until the person taps Try again.
Q8: It resets the `@try` block, which calls `getCurrentPosition()` again.
Q9: The Stop button calls `stopMemo()`, which clears the timer and stops the `MediaRecorder`.
Q10: The app's own `setInterval` in `memo.ts`, counting from `Date.now()`.
Q11: The recorded chunks become a `Blob`, then an object URL passed through `onClip`, which plays in an `<audio controls>` element.

## BC
Q1: The `<video>` is replaced by the refused message when `onError` reports `NotAllowedError`; the shutter and switch buttons still show.
Q2: The back camera, from the `facing` state starting at `'back'`.
Q3: `capturePhoto(video)` returns a photo that goes into `photo` and shows as an `<img>` using `photo.url`.
Q4: One plain `<video>` element with the `cameraPreview(...)` behaviour attached to it.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again.
Q7: Nothing shown makes it update by itself; it stays on the error until the person taps Try again.
Q8: It resets the `@try` block, which calls `getPosition` again (with an abort signal, which presumably cancels the earlier request).
Q9: The Stop button calls `end()`, which clears the timer and calls `recording.stop()`.
Q10: The app's own `setInterval` in `memo.ts`.
Q11: `recording.stop()` returns a clip whose URL goes into `clipUrl` and plays in an `<audio controls>` element.

## EJ
Q1: The `<Camera>` is replaced by the refused message when `onError` reports `NotAllowedError`; the shutter and switch buttons still show.
Q2: The back camera, from the `facing` state starting at `'back'`.
Q3: `camera.capture()` fires `onChange`, which puts the photo into `photo`, and it shows as an `<img>` using `photo.url`.
Q4: One `<Camera>` element, reached through an element handle.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again.
Q7: Nothing shown makes it update by itself; it stays on the error until the person taps Try again.
Q8: It resets the `@try` block, which calls `currentPosition()` again.
Q9: The Stop button calls `rec.stop()`.
Q10: The package supplies it as `rec.elapsed`.
Q11: `rec.clip.url` plays in an `<audio controls>` element.

## Ranking
1. MS: Shortest code, every state (denied, position, elapsed, clip) is a named field, and there is no plumbing.
2. EJ: A familiar element-plus-events camera and the same simple recorder as MS; the location code follows the standard try/pending/catch pattern.
3. BC: Plain web-style functions are easy to follow, but the app keeps its own timer and the shutter depends on a `<video>` element handle.
4. KO: Explicit and predictable, but permission handling is spread across every task and the listener code adds noise.
5. AU: Familiar web APIs, but the voice memo needs a long hand-written `MediaRecorder` module, plus config in two separate files.
6. UW: Compact, but the compound parts hide behaviour: whether the camera hides on refusal, and that one trigger both starts and stops recording.

Tools used: none