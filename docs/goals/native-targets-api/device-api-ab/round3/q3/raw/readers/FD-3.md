1: There are four. `openSettings()` opens the phone's Settings app. `openShareSheet({ url: last.url })` opens the phone's share sheet. `camera.takePhoto()` is on the bare `camera` export, not the `cam` instance, so I guess it opens the phone's own full-screen camera app. `choosePhoto()` most likely opens the phone's photo library or picker. The last two are inferences from the names and from the `?? last` fallback, which suggests the user can cancel.

2: `cam.takePhoto()` in the Shutter button. `cam` comes from `camera()` and is passed to `<base.camera el={cam} />`, so it is the camera shown on the page.

3:
- `openSettings()`: nothing is used. I'd guess it returns void, or maybe a promise.
- `cam.takePhoto()`: a promise of a `Photo`, which has at least `.url`. It is awaited and assigned with no null fallback, so it seems always to give a photo, or to throw on failure.
- `camera.takePhoto()`: a promise of `Photo | null`. Null means the user cancelled, so the code keeps the previous `last`.
- `choosePhoto()`: a promise of `Photo | null`, with null meaning cancelled, handled the same way.
- `openShareSheet({ url })`: nothing is used. It isn't awaited, so it probably returns void or a promise nobody waits for.

4: "Use phone camera" calls `camera.takePhoto()`. That probably opens the phone's own camera app so the user can take a new photo. "Choose a photo" calls `choosePhoto()`, which probably opens the photo library or picker so the user can pick an existing photo. Both give back a `Photo` or null, and on cancel the code keeps the old `last`. Neither uses the camera shown on this page.

5: Yes. `cam.takePhoto()` and `camera.takePhoto()` have the same method name but act very differently. One uses the camera shown on the page and seems to return a photo for sure. The other is a static call on the factory and seems to open the phone's own camera, possibly returning null. They differ by one identifier, and only the `?? last` hints at the difference. The name `camera` is also used for both the factory (`camera()`) and the one-off capture (`camera.takePhoto`). And `base.camera`, the UI piece, shares the name too, which made me unsure which `camera` was which. A smaller point: from `cam.ready` versus `cam.access === 'denied'` I can't tell whether "ready" also covers "permission still being asked".

Tools used: none
