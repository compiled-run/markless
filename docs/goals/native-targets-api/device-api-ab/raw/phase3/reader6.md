## KO
Q1: If camera access is refused, they see "Camera access is off. Allow it in Settings to take photos." Before they have chosen, they see an "Allow camera" button instead.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `cam.takePicture()` returns a `Picture` that is stored in `photo` and shown as `<img src={photo.uri}>` below the preview.
Q4: The camera view is one element, `<CameraView>`, reached through an `el` handle; the shutter and switch buttons are ordinary buttons beside it.
Q5: While loading, they see "Finding your location…", and the permission prompt may also appear during this time, since the request happens inside the computed.
Q6: If location access is refused, they see "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again" buttons.
Q7: This is not shown; I would assume the error stays until they tap "Try again", although the page might update itself if `permission.state` is reactive and refreshes when they return to the app.
Q8: "Try again" calls `reset`, which reruns the computed: it asks for permission again if not granted, then calls `Location.getCurrentPosition()`.
Q9: The Stop button calls `AudioRecorder.stop()`; if mic access is refused, tapping Record does nothing and shows no message.
Q10: The number comes from the recorder's `'progress'` events (`status.seconds`), listened to through an `attach` on the recording block.
Q11: The clip's `uri` is stored in `clipUri` and played in `<audio controls>`.

## EJ
Q1: They see "Camera access is off…", set when `onError` reports `NotAllowedError`; the Take photo and Switch buttons still show.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `camera.capture()` sends the photo through `onChange` into `photo`, which is shown as `<img src={photo.url}>`.
Q4: The camera view is one `<Camera>` element, with an `el` handle that the shutter button uses.
Q5: They see "Finding your location…" from the `@pending` block.
Q6: They see "Location access is off. Turn it on in Settings." (chosen when the error is `NotAllowedError`) with "Open Settings" and "Try again" buttons.
Q7: This is not shown; I would assume the error stays until they tap "Try again", so the page does not update by itself.
Q8: "Try again" calls `reset`, which reruns `currentPosition()`, presumably prompting or reading the position again.
Q9: The Stop button calls `rec.stop()`.
Q10: The number comes from `rec.elapsed`, which the `recorder()` object provides.
Q11: The clip plays in `<audio controls src={rec.clip.url}>`; how mic permission is handled is not shown.

## AU
Q1: They see the `@catch` text "Camera access is off…" (chosen when the error is `NotAllowedError`), with the Switch button still below it.
Q2: The back camera, because `facingMode` starts as `'environment'`.
Q3: `takePhoto` on the video track returns a Blob, which becomes an object URL in `photoUrl` and is shown in an `<img>`.
Q4: The camera view is one `<MediaView>` element fed by a stream that `getUserMedia` returns; the camera only works with the separate stream, track and `takePhoto` pieces.
Q5: They see "Finding your location…" (and "Starting camera…" is the camera screen's equivalent).
Q6: They see "Location access is off. Turn it on in Settings." with "Open Settings" (`openAppSettings`) and "Try again" buttons.
Q7: This is not shown; I would assume the error stays until "Try again" is tapped, and permission is also declared in `markless.config.ts` grants.
Q8: "Try again" calls `reset`, which reruns `getCurrentPosition()`.
Q9: Stop calls `stopMemo()`, which clears the timer and calls `MediaRecorder.stop()`; the `onstop` handler then stops the stream's tracks.
Q10: The number comes from a hand-written `setInterval` in `memo.ts` that measures wall-clock time since start.
Q11: The recorded chunks are joined into a Blob, turned into an object URL and played in `<audio controls>`.

## BC
Q1: They see "Camera access is off…", set by the `onError` callback of the `cameraPreview` attachment; the buttons still show.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `capturePhoto(video)` returns a `Photo` that is stored in `photo` and shown as `<img src={photo.url}>`.
Q4: The camera view is several pieces working together: a plain `<video>` element, a `cameraPreview` attach behaviour and a separate `capturePhoto` function.
Q5: They see "Finding your location…" from `@pending`.
Q6: They see "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again" buttons.
Q7: This is not shown; I would assume nothing happens until "Try again", although the abort `signal` suggests the request is cancellable.
Q8: "Try again" calls `reset`, which reruns `getPosition({ signal })`.
Q9: Stop calls `end()`, which clears the timer and calls `recording.stop()` on the handle that `startRecording` returned.
Q10: The number comes from a hand-written `setInterval` in `memo.ts`.
Q11: `end()` returns `clip.url`, which is stored in `clipUrl` and played in `<audio controls>`.

## UW
Q1: They presumably see the `<camera.error>` text "Camera access is off…"; when it shows is not stated, so I assume only when access is refused.
Q2: The back camera, because `facing` starts as `'back'`.
Q3: `<camera.trigger>` takes the photo and `onChange` puts it in `photo`, which is shown as an `<img>` inside the root.
Q4: The camera is several parts working together: `camera.root`, `area`, `error` and `trigger`.
Q5: They see "Finding your location…" from `@pending`.
Q6: They see "Location access is off. Turn it on in Settings." with "Open Settings" and "Try again" buttons.
Q7: This is not shown; I would assume the error stays until they tap "Try again".
Q8: "Try again" calls `reset`, which reruns `currentPosition()`.
Q9: Tapping the single `<recorder.trigger>` button again stops it, since that one button toggles start and stop.
Q10: The number comes from `<recorder.valuelabel />` inside `<recorder.indicator>`; I assume the indicator shows only while recording, which is not stated.
Q11: `onChange` hands over a `Clip`, which is stored and played in `<audio controls src={clip.url}>`.

## MS
Q1: They see "Camera access is off…" when `cam.status === 'denied'`; the Take photo and Switch buttons still show.
Q2: The back camera, set by `camera({ facing: 'back' })`.
Q3: `cam.capture()` returns a `Photo` that is stored in `photo` and shown as `<img src={photo.url}>`.
Q4: The camera view is one `<Preview of={cam}>` element driven by a separate `cam` controller object.
Q5: They see the text "Finding your location…" while `where.position` is empty, which may include the time the permission prompt is open.
Q6: They see "Location access is off. Turn it on in Settings." with "Open Settings" (`settings().open()`) and "Try again" buttons.
Q7: This is not shown; because `location()` is a live object, I would assume it may pick up the new permission and update by itself, but that is a guess.
Q8: "Try again" calls `where.refresh()`, which presumably asks for permission and the position again.
Q9: The Stop button calls `rec.stop()`.
Q10: The number comes from `rec.elapsed`, which the `recorder()` object provides.
Q11: The clip plays in `<audio controls src={rec.clip.url}>`.

## Ranking
1. MS: Each feature is one live object with plainly named fields (`status`, `position`, `elapsed`, `clip`), and permission is shown directly; only the return from Settings is unclear.
2. KO: Permission handling is fully spelled out and every behaviour can be traced, but the screens are longer and the recorder events are wired by hand.
3. EJ: The code is short and readable, but camera refusal is inferred from an error name and mic permission is invisible.
4. BC: It is readable, but the camera is spread across a video element, an attachment and a function, and the memo needs a hand-written timer module.
5. AU: It is browser-API plumbing (streams, tracks, Blobs, `setInterval`) plus separate config files; it is correct but the most to read.
6. UW: The compound parts hide when the error shows, what the trigger does, and where the seconds come from.

Tools used: none