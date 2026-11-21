1: `openSettings()` opens the phone's Settings app. `openShareSheet({ url: last.url })` opens the system share sheet. `takePhoto()` (the top-level import, not `cam.takePhoto()`) most likely opens the phone's own camera app, and `choosePhoto()` most likely opens the photo library or picker. The last two are guesses based on their names and the "?? last" fallback, which suggests the user can cancel.

2: `cam.takePhoto()` uses the camera shown on this page. It is the method on `cam = camera()`, the object passed to `<base.camera el={cam} />`, and the Shutter button is only enabled when `cam.ready`.

3: `openSettings()` returns nothing the code uses. `cam.takePhoto()` returns a promise of a `Photo`; the code assigns it straight to `last`, so it seems never to be null, though that is a guess. `takePhoto()` returns a promise of `Photo | null` or `undefined`, with null when the user cancels; the `?? last` fallback suggests this. `choosePhoto()` also returns a promise of `Photo | null` or `undefined`, with nothing when the picker is dismissed. `openShareSheet(...)` returns nothing the code uses. It may return a promise, but it isn't awaited. A `Photo` has at least a `.url`.

4: "Use phone camera" (`takePhoto()`) hands off to the phone's own camera to take a new picture. "Choose a photo" (`choosePhoto()`) lets the user pick an existing picture from the photo library. Both give back a `Photo`, or nothing if the user cancels, and in that case `last` keeps its old value. Neither uses the camera shown on the page. This is inferred from the names and button labels.

5: Yes. `cam.takePhoto()` and the top-level `takePhoto()` have the same name but do different things: one uses the camera shown on the page, the other opens the phone's camera app. Only the `cam.` prefix tells them apart. The name `takePhoto` alone doesn't say that it opens a screen of the phone's own, so I'm partly guessing. `camera()` (the device object) and `base.camera` (the UI element) also share a name.

Tools used: none (apart from the one required Read of the instructions file)
