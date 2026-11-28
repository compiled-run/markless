## EJ
Q1: The `<Camera>` preview is replaced by "Camera access is off. Allow it in Settings to take photos.", and the Take photo and Switch camera buttons still show.
Q2: The back camera.
Q3: `camera.capture()` passes the photo to `onChange`, which stores it in `photo`, and it shows as the "Last photo" image below the buttons.
Q4: One `<Camera>` element on screen; separate buttons control it through the `el` handle.
Q5: "Finding your location…", from the `@pending` branch.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Not shown; I would assume the error stays on screen until the person taps Try again, so the page does not update by itself.
Q8: It calls `reset`, which I assume runs `currentPosition()` again and shows the loading message, then the location or the error.
Q9: Tapping Stop, which calls `rec.stop()`.
Q10: The `recorder()` object counts it itself and exposes it as `rec.elapsed`.
Q11: In an `<audio controls>` element whose source is `rec.clip.url`.

## MS
Q1: When `cam.status` is `'denied'`, the preview is replaced by the "Camera access is off…" message, and both buttons still show.
Q2: The back camera, from `camera({ facing: 'back' })`.
Q3: `await cam.capture()` returns the photo, which is stored in `photo` and shown as the "Last photo" image.
Q4: One `<Preview>` element on screen, drawn from a separate `camera()` object that holds the camera's state.
Q5: "Finding your location…", shown while `where.position` is empty.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Not shown; `location()` looks like a live object, so I would assume its status updates when the person returns, but the person may still need to tap Try again.
Q8: It calls `where.refresh()`, which I assume asks for the position again.
Q9: Tapping Stop, which calls `rec.stop()`.
Q10: The `recorder()` object counts it itself and exposes it as `rec.elapsed`.
Q11: In an `<audio controls>` element whose source is `rec.clip.url`.

## KO
Q1: When permission is `'denied'`, they see the "Camera access is off…" message with no camera buttons; before they have answered, they see an "Allow camera" button.
Q2: The back camera.
Q3: `cam.takePicture()` returns a Picture, which is stored in `photo` and shown using `photo.uri`.
Q4: Several pieces work together: a `cameraPermission()` object decides what shows, and a `<CameraView>` element (reached through its `el` handle) shows the camera.
Q5: "Finding your location…", which also covers the time while the permission prompt is open.
Q6: The thrown message "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Not shown; if `permission.state` updates when the person returns, the location may be fetched again by itself, but I would assume they still tap Try again.
Q8: It calls `reset`, which runs the code again: it checks permission, asks for it again if needed, then calls `Location.getCurrentPosition()`.
Q9: Tapping Stop, which waits for `AudioRecorder.stop()` and then sets `recording` to false.
Q10: The app listens for `AudioRecorder` 'progress' events (attached while the recording view shows) and copies `status.seconds` into its own `seconds` value.
Q11: An `<audio controls>` element plays `clip.uri`, which was saved after Stop.

## UW
Q1: Not shown exactly; I would assume `<camera.error>` shows "Camera access is off…" only when access is refused (or for any camera error) while the trigger and Switch camera buttons still show.
Q2: The back camera.
Q3: `<camera.trigger>` takes the photo, the `onChange` on `camera.root` passes it to `photo`, and it shows as the "Last photo" image.
Q4: Several parts work together inside `camera.root`: `area`, `error` and `trigger`.
Q5: "Finding your location…", from the `@pending` branch.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Not shown; I would assume the error stays until the person taps Try again, so the page does not update by itself.
Q8: It calls `reset`, which I assume runs `currentPosition()` again.
Q9: Tapping the same `<recorder.trigger>` button again; I am assuming it switches between start and stop.
Q10: The `<recorder.valuelabel />` part fills it in from the recorder.
Q11: `onChange` passes the finished Clip to `clip`, and an `<audio controls>` element plays `clip.url`.

## BC
Q1: The `onError` handler sets `refused`, so the `<video>` is replaced by the "Camera access is off…" message, and both buttons still show.
Q2: The back camera.
Q3: `capturePhoto(video)` returns the photo, which is stored in `photo` and shown as the "Last photo" image.
Q4: One plain `<video>` element with a `cameraPreview` attachment, plus a separate `capturePhoto` function that reads from that video.
Q5: "Finding your location…", from the `@pending` branch.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Not shown; I would assume the error stays until the person taps Try again, so the page does not update by itself.
Q8: It calls `reset`, which runs `getPosition` again; I assume `signal` cancels the earlier request.
Q9: Tapping Stop, which calls `end()`; that clears the timer and calls `recording.stop()`.
Q10: A timer the app writes itself (`setInterval` in `memo.ts`) works it out from `Date.now()`.
Q11: `end()` returns `clip.url`, which is stored in `clipUrl` and played in an `<audio controls>` element.

## AU
Q1: If the error is `NotAllowedError`, the `@catch` branch shows the "Camera access is off…" message with no Take photo button, and Switch camera still shows.
Q2: The back camera (`'environment'`).
Q3: `takePhoto` returns a Blob, which becomes an object URL in `photoUrl` and shows as the "Last photo" image.
Q4: A `<MediaView>` element shows a stream that `getUserMedia` returns (computed), and the photo is taken from that stream's video track, so several pieces work together.
Q5: "Finding your location…", from the `@pending` branch.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Not shown; I would assume the error stays until the person taps Try again, so the page does not update by itself.
Q8: It calls `reset`, which runs `getCurrentPosition()` again.
Q9: Tapping Stop, which calls `stopMemo()`; that clears the timer and calls `MediaRecorder.stop()`, and the stream's tracks are then stopped.
Q10: A timer the app writes itself (`setInterval` in `memo.ts`) works it out from `Date.now()`.
Q11: The recorded chunks are joined into a Blob in `onstop`, turned into an object URL in `clipUrl`, and played in an `<audio controls>` element.

## Ranking
1. MS: Plain objects with readable fields (`status`, `capture`, `refresh`, `elapsed`) and no hidden callbacks or error branches.
2. EJ: Short and clear, though the refused state needs an `onError` name check and the photo arrives through `onChange`.
3. BC: Everything is explicit and easy to follow, but the voice memo needs a hand-written timer module.
4. KO: Explicit permission handling is clear, but the screens are long, permission checks repeat, and the progress listener is hand-wired.
5. UW: Very short, but behaviour is hidden in parts: when `camera.error` shows, the trigger toggling start and stop, and what `valuelabel` displays.
6. AU: You need to know the raw web media APIs (streams, tracks, MediaRecorder, Blobs, object URLs), and it has the most code.

Tools used: none