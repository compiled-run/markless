1: The calls that open the phone's own screens are `settings.open()` (the phone's Settings app), `systemCamera.open()` (the phone's built-in camera app), `photoLibrary.open()` (the phone's photo picker or gallery) and `sharesheet.open({ url: last.url })` (the phone's share sheet). I'm guessing that all four are native screens shown on top of the app, based on their names and the shared `.open()` verb.

2: `cam.takePhoto()`. Here `cam` comes from `camera()` and is passed to `<base.camera el={cam} />`, so it is the camera shown on this page.

3: The calls return the following.
`settings.open()`: nothing is used. It may return a promise, but I'm guessing.
`cam.takePhoto()`: a promise that resolves to a `Photo`, which has at least a `url`. The code expects it never to be null.
`systemCamera.open()`: a promise of `Photo | null` or `undefined`, where null or undefined means the user cancelled. I infer this from `?? last`, which keeps the old photo in that case.
`photoLibrary.open()`: the same as `systemCamera.open()`, a promise of a Photo or null/undefined on cancel.
`sharesheet.open({ url })`: the result is not awaited or used. It may be a promise that settles when the sheet closes (a guess).

4: "Use phone camera" opens the phone's own camera app so the user can take a new photo. "Choose a photo" opens the photo library so the user can pick an existing photo. Both give back a Photo, or nothing if the user cancels, and in that case the last photo stays. Neither one uses the on-page camera or depends on `cam.ready` or camera permission. I'm guessing that `systemCamera` needs no camera permission from this app.

5: Yes. `camera()` and `systemCamera` are easy to mix up: both are "the camera", but one is the camera embedded in the page and the other is the phone's own camera app. Calling `camera()` versus using `systemCamera.open()` directly also suggests different lifetimes. `cam.access === 'denied'` was also unclear: I wasn't sure whether denied access affects `systemCamera` too. `base.camera el={cam}` was another: the `el` name suggests an element, not a camera object. Finally, `settings.open()` doesn't say which settings it opens: the phone's general Settings or this app's settings page. I'm guessing it is the app's own page.

Tools used: none
