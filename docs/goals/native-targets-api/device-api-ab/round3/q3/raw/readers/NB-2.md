1: `settings.open()` (the phone's Settings app), `cameraScreen.open()` (the phone's own full-screen camera), `photoLibrary.open()` (the phone's photo picker) and `sharesheet.open({ url: last.url })` (the system share sheet). I'm reading this from the `.open()` names and the button labels.

2: `cam.takePhoto()`. `cam` comes from `camera()` and is passed to `<base.camera el={cam} />`, so the shutter takes the photo from the camera shown in the page.

3: Going by the code only:
- `settings.open()`: the result isn't used. Guess: nothing useful, maybe a promise that does nothing.
- `cam.takePhoto()`: a `Photo` (it's awaited and stored in `last`, which is `Photo | null`). It has at least a `.url`.
- `cameraScreen.open()`: `Photo | null` or undefined. The `?? last` suggests it comes back empty when the user cancels.
- `photoLibrary.open()`: same, a `Photo` or nothing on cancel.
- `sharesheet.open(...)`: the result isn't used. Guess: nothing, or maybe a promise for whether it was shared.

4: "Use phone camera" opens the phone's own camera screen so the user takes a new photo. "Choose a photo" opens the photo library so the user picks a photo they already have. Both leave the page, both return a `Photo` or nothing on cancel, and both keep the previous `last` if cancelled.

5: Yes, a few:
- `camera` (import and `camera()`) next to `cameraScreen`, plus `base.camera` from `@markless/ui`. That makes three "camera" names. `camera()` is the one built into the page, and `cameraScreen` is the phone's own camera app. Only the "Screen" suffix tells them apart.
- `cam.access === 'denied'`: I'm guessing the other values, such as 'granted' or 'prompt'.
- `cam.ready`: I'm unsure whether it means permission granted or stream running.
- It's also unclear whether `settings.open()` opens this app's settings page or the general Settings app.

Tools used: none
