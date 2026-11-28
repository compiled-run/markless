1: Four calls open one of the phone's own screens, outside this page: `settings.open()` (the phone's Settings app), `cameraScreen.open()` (the phone's built-in camera screen), `photoLibrary.open()` (the phone's photo picker) and `sharesheet.open({ url: last.url })` (the phone's share sheet). Each one is named "open" and is a top-level device object, which is what points to this. That `cameraScreen` and `photoLibrary` are full-screen native screens is partly a guess.

2: `cam.takePhoto()` uses the camera shown on this page. `cam` comes from `camera()` and is passed to `<base.camera el={cam} />`, so that same camera is the one on screen.

3: `settings.open()`: the code doesn't use a return value. My guess is nothing, or a promise that resolves when the app hands off.
`cam.takePhoto()`: a promise of a `Photo`, which is assigned to `last`.
`cameraScreen.open()`: a promise of a `Photo`, or null/undefined if the user cancels. I read that from `?? last`, which keeps the previous photo.
`photoLibrary.open()`: the same as `cameraScreen.open()`, a `Photo` or null/undefined on cancel, again read from `?? last`.
`sharesheet.open({ url })`: not awaited and its result isn't used. I'm guessing it returns nothing useful, or a promise.

4: "Use phone camera" opens the phone's own camera screen so the user can take a new photo there. "Choose a photo" opens the phone's photo library so the user can pick a photo that already exists. Both give back a `Photo`, or nothing if the user cancels, and in that case `last` stays as it was.

5: Yes. `camera()` and `cameraScreen` are easy to mix up. `cam.takePhoto()` uses the camera on this page, while `cameraScreen.open()` opens the phone's own camera screen, and only the "Screen" suffix tells them apart. `base.camera` (the on-page view) next to `camera()` adds to the confusion. I was also unsure whether `settings.open()` opens the phone's Settings app or settings inside this app. The "Camera access is off" context suggests the phone's Settings, but that is a guess. `cam.access === 'denied'` made me wonder which other values it can take, for example 'prompt' or 'granted'.

Tools used: none
