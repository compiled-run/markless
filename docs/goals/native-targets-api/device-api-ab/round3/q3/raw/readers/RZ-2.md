1: `settings.open()` (opens the phone's Settings app), `cameraApp.open()` (opens the phone's own camera app), `photoLibrary.open()` (opens the phone's photo library or picker) and `sharesheet.open({ url: last.url })` (opens the system share sheet). I'm partly guessing from the names: these all follow a `<thing>.open()` pattern and appear to be system screens.

2: `cam.takePhoto()`. `cam` comes from `camera()` and is passed to `<base.camera el={cam} />`, so it is the camera shown on this page.

3:
`settings.open()`: nothing is used. The code does not await it, so it probably returns nothing or a promise nobody uses (a guess).
`cam.takePhoto()`: a promise of a `Photo` (it has a `.url`). The code assigns it straight to `last` with no fallback, so it always gives a photo or throws (a guess).
`cameraApp.open()`: a promise of a `Photo`, or `null`/`undefined` if the user cancels. The code uses `?? last`, which shows the empty case exists.
`photoLibrary.open()`: same as above, a `Photo` or nothing if the user cancels.
`sharesheet.open({ url })`: nothing is used. It is not awaited, so it probably returns void or a promise that is ignored (a guess).

4: "Use phone camera" leaves the page for the phone's own camera app so the user can take a new photo there. "Choose a photo" opens the photo library so the user can pick an existing photo. Both return a `Photo` or nothing if cancelled, and on cancel `last` stays as it was. Neither uses the in-page camera.

5: Yes. `camera()` and `cameraApp.open()` have very similar names: one is the in-page camera, the other opens the phone's own camera app. The code only makes this clear through `base.camera el={cam}` and the "Use phone camera" label. I was also unsure whether `cam.ready` and `cam.access === 'denied'` are related (for example, is `ready` false while access is being asked?). The many `.open()` calls are another source of doubt: `settings.open()` and `sharesheet.open()` return nothing useful, while `cameraApp.open()` and `photoLibrary.open()` return a photo, yet the same verb hides that difference.

Tools used: none
