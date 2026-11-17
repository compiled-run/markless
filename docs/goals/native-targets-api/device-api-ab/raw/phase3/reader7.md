## BC
Q1: The camera preview is replaced by "Camera access is off. Allow it in Settings to take photos." The Take photo and Switch camera buttons stay on screen.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `capturePhoto(video)` returns a `Photo`, which is stored in `photo` state and shown as an `<img>` using `photo.url`.
Q4: One element: a plain `<video>` that the `cameraPreview` behaviour drives through `attach`.
Q5: The text "Finding your location…" from the `@pending` branch.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: The code shows nothing that re-runs on return, so I assume the error stays until they tap Try again; it does not update by itself.
Q8: `reset` re-runs the `computed`, which calls `getPosition` again with a new abort signal and shows the loading text in the meantime.
Q9: Tapping Stop, which calls `end()`; that clears the timer and calls `recording.stop()`.
Q10: The app's own `setInterval` in `memo.ts`, which counts from `Date.now()`, not the device package.
Q11: The URL of the clip returned by `recording.stop()` is put into an `<audio controls>` element.

## AU
Q1: The `@catch` branch shows "Camera access is off. Allow it in Settings to take photos." The preview and Take photo disappear, but Switch camera stays.
Q2: The back camera, because `facingMode` starts as `'environment'`.
Q3: `takePhoto` returns a blob, which becomes an object URL in `photoUrl` and is shown as an `<img>`.
Q4: One `<MediaView>` element, but it needs a separately computed stream, and the shutter digs the video track out of that stream.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Nothing is shown re-running on return, so I assume it stays on the error until Try again; no automatic update.
Q8: `reset` re-runs the `computed`, which calls `getCurrentPosition()` again.
Q9: The Stop button calls `stopMemo()`, which calls `MediaRecorder.stop()`; the `onstop` handler then stops the stream's tracks.
Q10: The app's own `setInterval` in `memo.ts`.
Q11: Recorded chunks are combined into a Blob, turned into an object URL, and played in `<audio controls>`.

## KO
Q1: If refused, only "Camera access is off…" is shown, with no preview and no camera buttons; before they decide, an "Allow camera" button is shown instead.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `cam.takePicture()` returns a `Picture`, which is stored in state and shown as an `<img>` using `photo.uri`.
Q4: One `<CameraView>` element, which the screen controls through an element handle.
Q5: "Finding your location…" from `@pending`.
Q6: The thrown message "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: The `computed` reads `permission.state`, so it might re-run by itself if that permission value updates when the app comes back; the code doesn't show that it does, so I'd assume a tap on Try again may still be needed.
Q8: `reset` re-runs the `computed`: it checks permission, asks again if access isn't granted, then gets the position.
Q9: The Stop button calls `AudioRecorder.stop()`, which is a single shared recorder for the whole app.
Q10: A `'progress'` event listener on `AudioRecorder`, attached while the recording `<div>` is on screen.
Q11: `clip.uri` from `stop()` is played in `<audio controls>`.

## MS
Q1: "Camera access is off…" replaces the `<Preview>` when `cam.status === 'denied'`; the buttons stay.
Q2: The back camera, because the code calls `camera({ facing: 'back' })`.
Q3: `cam.capture()` returns a `Photo`, which is stored in state and shown as an `<img>` using `photo.url`.
Q4: One `<Preview of={cam}>` element showing a camera object that holds its own state.
Q5: "Finding your location…" inside the same `<p>`, shown while `where.position` is empty.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: It is not shown; since `where.status` is reactive, I'd assume it re-checks and updates by itself on return, but the code doesn't prove it.
Q8: It calls `where.refresh()`, which I assume asks for permission and the position again; the code doesn't show the details.
Q9: The Stop button calls `rec.stop()`.
Q10: `rec.elapsed`, kept by the recorder object in the package.
Q11: `rec.clip.url` is played in `<audio controls>`.

## EJ
Q1: The `<Camera>` element is replaced by "Camera access is off…"; the buttons stay.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `camera.capture()` takes the shot, and the photo arrives through the `onChange` callback into `photo` state, which shows it as an `<img>`.
Q4: One `<Camera>` element, with a separate button that controls it through an element handle.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Nothing is shown re-running on return, so I assume it stays on the error until Try again.
Q8: `reset` re-runs the `computed`, which calls `currentPosition()` again.
Q9: The Stop button calls `rec.stop()`.
Q10: `rec.elapsed`, kept by the recorder object in the package.
Q11: `rec.clip.url` is played in `<audio controls>`.

## UW
Q1: I assume the `<camera.error>` part shows "Camera access is off…" only when access is refused, but the code doesn't show when it appears or whether the preview hides.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: The `onChange` callback on the root delivers the `Photo` into state, which shows it as an `<img>`.
Q4: Several parts working together: `root`, `area`, `error` and `trigger`.
Q5: "Finding your location…" from `@pending`.
Q6: "Location access is off. Turn it on in Settings." with Open Settings and Try again buttons.
Q7: Nothing is shown re-running on return, so I assume it stays on the error until Try again.
Q8: `reset` re-runs the `computed`, which calls `currentPosition()` again.
Q9: I assume a second press of the same `<recorder.trigger>` toggle stops it, since the button says "Start or stop recording"; this isn't shown.
Q10: The `<recorder.valuelabel>` part, which the package fills in.
Q11: `onChange` delivers a `Clip`, and its `url` is played in `<audio controls>`.

## Ranking
1. MS: Each feature is one reactive object with readable fields (`status`, `elapsed`, `clip`), so every answer can be read straight off the code.
2. EJ: Location and voice memo read clearly, but the camera photo arriving through `onChange` after `capture()` is less direct.
3. BC: Explicit and easy to follow, but the app runs its own timer and passes callbacks around a separate module.
4. KO: Permission handling is visible, but there is a global `AudioRecorder` singleton, an event listener on `attach`, and an unclear refresh on return.
5. AU: Raw web media plumbing (tracks, chunks, Blobs, object URLs) hides what the screen does behind boilerplate.
6. UW: The compound parts hide when the error shows, how stop works and where seconds come from, so several answers are guesses.

Tools used: none