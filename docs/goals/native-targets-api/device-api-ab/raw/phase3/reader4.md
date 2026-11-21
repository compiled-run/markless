## AU
Q1: The camera area is replaced by "Camera access is off. Allow it in Settings to take photos." (the `@catch` branch), and the "Switch camera" button stays visible.
Q2: The back camera, because `facingMode` starts as `'environment'`.
Q3: `takePhoto` returns a blob, which is turned into an object URL in `photoUrl` and shown as the "Last photo" `<img>` below.
Q4: One element (`<MediaView srcObject={stream}>`) shows the live view, and the shutter is a separate button that uses the same stream's video track.
Q5: "Finding your location…" from the `@pending` branch.
Q6: The refused message with "Open Settings" and "Try again" buttons, chosen because `error.name === 'NotAllowedError'`.
Q7: `openAppSettings()` opens the phone's settings, and coming back changes nothing on its own; I assume the error stays until "Try again" is tapped (not shown).
Q8: `reset` clears the error and runs the `computed` again, which calls `getCurrentPosition()` and shows the pending state again.
Q9: The Stop button calls `stopMemo()`, which clears the timer and calls `MediaRecorder.stop()`; the `onstop` handler then stops the microphone tracks.
Q10: The app's own `setInterval` in `memo.ts` works out the seconds from `Date.now()` and passes them to `onTick`, which sets `seconds`.
Q11: The recorded chunks are joined into a `Blob`, turned into an object URL, and played in `<audio controls>`.

## MS
Q1: `<Preview>` is replaced by the "Camera access is off…" message, but "Take photo" and "Switch camera" stay on screen.
Q2: The back camera (`camera({ facing: 'back' })`).
Q3: `cam.capture()` returns a `Photo`, which is kept in `photo` state and shown as an `<img>` via `photo.url`.
Q4: One element (`<Preview of={cam}>`) driven by a camera object, with the shutter and switch as separate buttons that call that object.
Q5: The paragraph reads "Finding your location…" while `where.position` is still empty.
Q6: The "Location access is off…" message with "Open Settings" and "Try again", shown when `where.status === 'denied'`.
Q7: `phoneSettings.open()` opens Settings; I would assume the `location()` object re-checks when the app comes back and updates by itself, but the code does not show that.
Q8: `where.refresh()` asks for the location again, and presumably the permission too (not shown).
Q9: The Stop button calls `rec.stop()`.
Q10: The library's `rec.elapsed` value, which updates itself.
Q11: Through `<audio controls src={rec.clip.url}>`, once `rec.clip` exists.

## UW
Q1: I assume `<camera.error>` shows "Camera access is off…" when access is refused and the view area stays empty, but the code does not show which parts hide.
Q2: The back camera (`facing` starts as `'back'`).
Q3: `camera.root` passes a `Photo` to `onChange`, which stores it in `photo` state, and it is shown as an `<img>` via `photo.url`.
Q4: Several parts working together (`camera.root`, `camera.area`, `camera.error`, `camera.trigger`).
Q5: "Finding your location…" from `@pending`.
Q6: The refused message with "Open Settings" and "Try again", chosen because `error.name === 'NotAllowedError'`.
Q7: `openSettings()` opens Settings, and nothing re-runs when the person comes back; I assume the error stays until "Try again" (not shown).
Q8: `reset` runs `computed` again, which calls `currentPosition()`.
Q9: Tapping `<recorder.trigger>` a second time; it seems to be one toggle button labelled "Start or stop recording".
Q10: The library fills it in through `<recorder.valuelabel />` inside `<recorder.indicator>`.
Q11: `recorder.root` passes a `Clip` to `onChange`, which stores it in state, and it plays in `<audio controls src={clip.url}>`.

## BC
Q1: The `<video>` is replaced by "Camera access is off…" only when `onError` sees `NotAllowedError`; for any other error the view just stays blank.
Q2: The back camera (`facing` starts as `'back'`).
Q3: `capturePhoto(video)` grabs a frame from the video element and returns a `Photo`, which is stored in state and shown as an `<img>` via `photo.url`.
Q4: One plain `<video>` element with the `cameraPreview(...)` stream attached, plus a separate `capturePhoto` call that uses the element.
Q5: "Finding your location…" from `@pending`.
Q6: The refused message with "Open Settings" and "Try again" (`NotAllowedError`).
Q7: `openSettings()` opens Settings, and the page does not update by itself; I assume the error stays until "Try again" (not shown).
Q8: `reset` runs `computed` again, which calls `getPosition` with a fresh abort signal, so the earlier request is presumably cancelled.
Q9: The Stop button calls `end()`, which clears the timer and calls `recording.stop()`.
Q10: The app's own `setInterval` in `memo.ts`, which works out the seconds from `Date.now()`.
Q11: `recording.stop()` gives back a clip whose `url` goes into `<audio controls>`.

## EJ
Q1: `<Camera>` is replaced by "Camera access is off…" when `onError` sees `NotAllowedError`, and the buttons stay on screen.
Q2: The back camera (`facing` starts as `'back'`).
Q3: `camera.capture()` takes the picture, the `Photo` arrives through `onChange` into `photo` state, and it is shown as an `<img>` via `photo.url`.
Q4: One `<Camera>` element, which the shutter button controls through its element handle.
Q5: "Finding your location…" from `@pending`.
Q6: The refused message with "Open Settings" and "Try again" (`NotAllowedError`).
Q7: `openSettings()` opens Settings, and the page does not update by itself; I assume the error stays until "Try again" (not shown).
Q8: `reset` runs `computed` again, which calls `currentPosition()`.
Q9: The Stop button calls `rec.stop()`.
Q10: The library's `rec.elapsed` value.
Q11: Through `<audio controls src={rec.clip.url}>`.

## KO
Q1: The preview and both camera buttons are hidden and "Camera access is off…" is shown; before the person has answered, an "Allow camera" button is shown instead.
Q2: The back camera (`facing` starts as `'back'`).
Q3: `cam.takePicture()` returns a `Picture`, which is stored in state and shown as an `<img>` via `photo.uri`.
Q4: One `<CameraView>` element controlled through its handle, shown only once camera permission is granted.
Q5: "Finding your location…" from `@pending`, including while the permission prompt is on screen.
Q6: The app's own thrown message "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again".
Q7: `Linking.openSettings()` opens Settings; because `computed` reads `permission.state`, it might re-run by itself if that state refreshes when the app comes back, but the code does not show that.
Q8: `reset` runs `computed` again, which checks the permission, asks again if it is not granted, and then calls `Location.getCurrentPosition()`.
Q9: The Stop button calls `AudioRecorder.stop()`, which returns the clip.
Q10: `AudioRecorder` sends `'progress'` events with `status.seconds`, and a listener attached to the recording `<div>` copies that into `seconds`.
Q11: `clip.uri` goes into `<audio controls>`; if microphone access is refused, Record silently does nothing.

## Ranking
1. MS: The shortest and most direct code, with state on plain objects (`status`, `elapsed`, `clip`) that reads like the task description.
2. EJ: Its recorder reads as clearly as MS, and the camera is one element with an explicit refusal path, though it needs an element handle.
3. AU: Uses familiar web-standard APIs and error handling is clear, but the voice memo needs hand-written timer and chunk plumbing.
4. BC: The flow is explicit, but it mixes a raw `<video>`, an `attach` directive and helper code, and other camera errors fail silently.
5. KO: Permission handling is explicit and complete, but it is verbose, and the event listener and permission branches hide the main flow.
6. UW: The compound parts hide when the error shows, what the toggle trigger does, and where the seconds come from, so the behaviour cannot be read from the code.

Tools used: none