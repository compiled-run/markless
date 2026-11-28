1: Four calls open one of the phone's own screens, outside this page: `settings.open()` (the phone's Settings), `systemCamera.open()` (the phone's built-in camera app), `photoLibrary.open()` (the phone's photo picker) and `sharesheet.open({ url: last.url })` (the phone's share sheet). I'm inferring this from the names and the `.open()` pattern. The code itself doesn't say so.

2: `cam.takePhoto()`. `cam` comes from `camera()` and is passed to `<base.camera el={cam} />`, so the shutter takes a photo from the camera shown on the page.

3: The calls and what comes back:
- `settings.open()`: nothing is used. It is not awaited, so I'm guessing it returns void or a promise that gets ignored.
- `cam.takePhoto()`: a promise of a `Photo`, which is stored in `last`. It always gives a photo. The code has no `?? last` fallback here, though it might throw.
- `systemCamera.open()`: a promise of a `Photo`, or `null`/`undefined` if the user cancels. That is why the code adds `?? last`.
- `photoLibrary.open()`: the same as `systemCamera.open()`, a promise of a `Photo` or nothing if cancelled.
- `sharesheet.open({ url })`: nothing is used. It is not awaited, so I'm guessing void or an ignored promise.

4: "Use phone camera" opens the phone's own camera app to take a new photo. "Choose a photo" opens the photo library to pick a photo that already exists. Both give back a `Photo`, or nothing on cancel, and both keep the previous `last` if the user cancels. Neither one uses the camera shown on the page.

5: Yes, a few:
- `camera()` versus `systemCamera.open()`: both are "camera", but one is the camera shown on the page and the other is the phone's own camera app. I only told them apart from the `system` prefix and from the fact that `camera` is a function called once while `systemCamera` is an object with `.open()`.
- `base.camera` (the element from `@markless/ui`) versus `camera` (from `@markless/device`): same name, different packages.
- `cam.ready` versus `cam.access === 'denied'`: I'm guessing at their states. I don't know if `ready` is false while the permission prompt is pending, or what other values `access` can have (`'granted'`, `'prompt'`?).
- `sharesheet.open`: "open" here means the share UI, not opening a file. It is also unclear whether it returns a result.

Tools used: none
