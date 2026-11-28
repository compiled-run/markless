1: `settings.open()` opens the phone's Settings app. `cameraApp.open()` opens the phone's own camera app. `photoLibrary.open()` opens the system photo picker or library. `sharesheet.open({ url: last.url })` opens the system share sheet. I'm guessing on the last two: the code shows they are `.open()` calls on device objects, but not for certain whether each one is a full-screen system screen or an overlay sheet.

2: `cam.takePhoto()`. Here `cam` is the `camera()` object, and it is bound to `<base.camera el={cam} />` on this page.

3: `settings.open()` probably returns nothing. Its result isn't used, and I'm guessing whether it returns a promise. `cam.takePhoto()` returns a promise of a `Photo`, which has a `.url`, and the result is assigned straight to `last`. `cameraApp.open()` returns a promise of a `Photo` or null/undefined, because `?? last` handles the user cancelling. `photoLibrary.open()` works the same way: a promise of a `Photo` or null/undefined if cancelled. `sharesheet.open({ url })` has its result ignored. It is perhaps a promise or void, and that is a guess.

4: "Use phone camera" leaves the app for the phone's own camera app, so the user takes a new photo there. "Choose a photo" opens the photo library, so the user picks an existing photo. Both give back a `Photo`, or nothing if the user cancels, and in that case `last` stays as it was. Neither one uses the camera view shown on this page.

5: `camera()` and `cameraApp` are the easiest to mix up. `camera()` is the live camera shown on this page, while `cameraApp.open()` launches the phone's camera app. The names differ only by the "App" suffix, and one is a function call while the other is an object. It is also odd that `camera()` is called while `settings`, `cameraApp`, `photoLibrary` and `sharesheet` are used as plain objects. I also wasn't sure what `cam.ready` means compared with `cam.access`: I'm guessing `ready` means the stream has started. I couldn't tell whether `access` has other values, such as 'prompt' or 'granted'. Finally, the `photoLibrary.open()` name doesn't say whether it picks a single photo or several.

Tools used: none
