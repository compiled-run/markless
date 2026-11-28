# Q3 reading questions and answer key

Written before any reader ran. Readers get one variant's `solutions/<label>.tsrx` with no sheet.

## Variants and labels

Blind writers (8, `raw/blind/`) named the phone's camera screen `systemCamera` 3 times, `cameraScreen` 3 and `cameraApp`
2, so those are the three noun variants. They named the photo library `photoLibrary` 7 times and `photoPicker` once.
`photopicker.open()` is not tested as a camera-screen name: no blind writer proposed it for the camera screen, and the one
writer who used `photoPicker` used it to choose an existing photo, so it names the other task and would invite exactly
the "take a new photo" / "choose an existing photo" mix-up the tasks keep apart.

| Label | System camera screen | Photo library | Settings | Share panel |
| --- | --- | --- | --- | --- |
| FD | `camera.takePhoto()` (round 2's one import, same verbs; control) | `choosePhoto()` | `openSettings()` | `openShareSheet(…)` |
| TJ | `systemCamera.open()` | `photoLibrary.open()` | `settings.open()` | `sharesheet.open(…)` |
| NB | `cameraScreen.open()` | `photoLibrary.open()` | `settings.open()` | `sharesheet.open(…)` |
| RZ | `cameraApp.open()` | `photoLibrary.open()` | `settings.open()` | `sharesheet.open(…)` |
| WK | `takePhoto()` (plain functions) | `choosePhoto()` | `openSettings()` | `openShareSheet(…)` |

In every variant the in-page camera is `const cam = camera()`, shown with `<base.camera el={cam} />`, and the shutter calls
`cam.takePhoto()`.

## Questions (message 1, one variant)

1. Which calls open a screen of the phone's own, outside this page? Quote each call.
2. Which call uses the camera shown on this page? Quote it.
3. For each call that the buttons make, what comes back (if anything)?
4. What is the difference between pressing "Use phone camera" and pressing "Choose a photo"?
5. Is there any pair of calls you could mix up, or a name that made you unsure? Quote it.

## Scoring (6 points; question 5 is tallied, not scored)

- 1 (1 point): names the system-camera call, the library call, the settings call and the share call, and does not name
  `cam.takePhoto()`.
- 2 (1 point): `cam.takePhoto()` only (naming `<base.camera>` beside it is fine); not the system-camera call.
- 3 (3 points): `cam.takePhoto()` gives a photo (1); the system-camera call and the library call give a photo or nothing
  when the person cancels (1; "a photo" alone scores, since `?? last` shows only that a missing answer is possible);
  settings gives nothing and share gives nothing useful or resolves when closed (1).
- 4 (1 point): "Use phone camera" takes a new photo with the phone's camera screen; "Choose a photo" picks an existing
  photo from the phone's library.

Question 5 is tallied per variant: did the reader name the in-page and system camera calls as a pair they could mix up?
