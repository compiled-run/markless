## AU
Q1: The live preview and shutter are replaced by "Camera access is off. Allow it in Settings to take photos.", and the "Switch camera" button stays visible.
Q2: The back camera, because `facingMode` starts as `'environment'`.
Q3: `takePhoto` returns a blob, which is turned into an object URL and shown as the "Last photo" `<img>` under the camera.
Q4: One element, `<MediaView srcObject={stream}>`, fed by a separate `getUserMedia` stream; the shutter reaches into that stream's video track.
Q5: "Finding your location…", from the `@pending` branch.
Q6: "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again" buttons below it.
Q7: The phone's settings open, but nothing in the code re-runs when the person returns, so I assume the error stays until they tap "Try again" (not shown).
Q8: `reset` clears the error and re-runs the `@try` block, which I assume calls `getCurrentPosition()` again and shows "Finding your location…" in the meantime (not shown).
Q9: The Stop button calls `stopMemo()`, which clears the timer, calls `MediaRecorder.stop()` and stops the microphone tracks.
Q10: The app's own `setInterval` in `memo.ts` counts wall-clock seconds since the start and passes them through the `onTick` callback.
Q11: The recorded chunks are joined into a Blob, turned into an object URL and played in an `<audio controls>` element; a refused microphone makes `startMemo` throw with no message on screen.

## KO
Q1: "Camera access is off. Allow it in Settings to take photos." appears, and the shutter and switch buttons are hidden; before the person has been asked, an "Allow camera" button shows instead.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `cam.takePicture()` returns a `Picture`, and its `uri` is shown in the "Last photo" `<img>`.
Q4: One element, `<CameraView>`, with an element handle `cam` that the shutter calls into.
Q5: "Finding your location…", which also shows while the permission prompt is open.
Q6: The thrown message "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: The computed value reads `permission.state`, so if that value is live it may re-run on its own when the person returns; I would assume it does not update without "Try again" (not shown).
Q8: It re-runs the computed value, which checks permission, asks again if access is not granted (the phone may not show the prompt again) and then gets the position.
Q9: The Stop button awaits `AudioRecorder.stop()`, which returns the clip.
Q10: The recorder's own `'progress'` events supply `status.seconds`, through a listener attached to the recording `<div>`.
Q11: `clip.uri` is played in an `<audio controls>` element; if access is refused, Record silently does nothing.

## EJ
Q1: The `<Camera>` is replaced by "Camera access is off. Allow it in Settings to take photos.", but the shutter and switch buttons stay and do nothing.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `capture()` sends the photo to the `onChange` handler, which stores it in `photo`, and it is shown as the "Last photo" `<img>`.
Q4: One element, `<Camera>`, with an element handle for the shutter.
Q5: "Finding your location…", from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: Settings open, and I assume the page does not update by itself and the person must tap "Try again" (not shown).
Q8: `reset` re-runs the `@try` block and calls `currentPosition()` again, which I assume shows the loading text again (not shown).
Q9: `rec.stop()`, called from the Stop button.
Q10: `rec.elapsed`, a live value kept by the package's `recorder()` object.
Q11: The package puts the clip in `rec.clip`, and `rec.clip.url` is played in an `<audio controls>` element; what a refused microphone does is not shown.

## BC
Q1: The `<video>` is replaced by "Camera access is off. Allow it in Settings to take photos.", while the shutter and switch buttons stay visible.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `capturePhoto(video)` grabs a still from the `<video>` element and returns a `Photo`, which is shown as the "Last photo" `<img>`.
Q4: Several pieces work together: an ordinary `<video>` element, a `cameraPreview` behaviour attached to it, and a separate `capturePhoto` function.
Q5: "Finding your location…", from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: Settings open, and I assume the page does not update by itself and the person must tap "Try again" (not shown).
Q8: `reset` re-runs the computed value and calls `getPosition` again with a new cancel `signal`, which I assume cancels any earlier request that is still running.
Q9: Stop calls `end()`, which clears the timer and awaits `recording.stop()`.
Q10: The app's own `setInterval` in `memo.ts` counts wall-clock seconds through `onTick`.
Q11: `clip.url` from `recording.stop()` is played in an `<audio controls>` element.

## MS
Q1: The `<Preview>` is replaced by "Camera access is off. Allow it in Settings to take photos.", while the shutter and switch buttons stay visible.
Q2: The back camera, from `camera({ facing: 'back' })`.
Q3: `cam.capture()` returns a `Photo`, which is shown as the "Last photo" `<img>`.
Q4: Two pieces: a `camera()` controller object, and a `<Preview of={cam}>` element that shows it.
Q5: "Finding your location…" as text in the same paragraph while `position` is empty; a non-permission error would apparently show this forever.
Q6: "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: `where.status` looks like a live value, so I would assume the package re-checks access when the app returns and the page updates by itself, but this is not shown.
Q8: `where.refresh()` asks for the position again, and I assume it asks for permission again too (not shown).
Q9: `rec.stop()`, called from the Stop button.
Q10: `rec.elapsed`, a live value kept by the package's `recorder()` object.
Q11: `rec.clip.url` is played in an `<audio controls>` element.

## UW
Q1: I assume `<camera.error>` shows "Camera access is off. Allow it in Settings to take photos." only on refusal, and that the preview is hidden (not shown).
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `<camera.trigger>` takes the photo, the root's `onChange` stores it, and it is shown as the "Last photo" `<img>`.
Q4: Several parts work together inside `camera.root`: `area`, `error` and `trigger`.
Q5: "Finding your location…", from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: Settings open, and I assume the page does not update by itself and the person must tap "Try again" (not shown).
Q8: `reset` re-runs the computed value and calls `currentPosition()` again.
Q9: Tapping the same `<recorder.trigger>` button again, since it toggles start and stop.
Q10: The `<recorder.valuelabel>` part supplies it from the package, and I assume `<recorder.indicator>` only shows while recording (not shown).
Q11: The root's `onChange` gives a `Clip`, and its `url` is played in an `<audio controls>` element.

## Ranking
1. EJ: short, readable calls for location and memo, and one camera element with plain props and events.
2. MS: one live object per device reads well, but location loading and errors share a single text branch.
3. KO: permission handling is explicit and easy to follow, at the cost of extra boilerplate in every screen.
4. AU: familiar web-standard names, but the memo needs a hand-written recorder and timer module.
5. BC: the camera is spread across a raw `<video>`, an attached behaviour and a capture function, and the memo needs its own timer.
6. UW: compound parts hide when the error, indicator and toggle appear, so most behaviour cannot be seen in the code.

Tools used: none