1: These calls open a screen that belongs to the phone itself, outside this page: `settings.open()`, `systemCamera.open()`, `photoLibrary.open()` and `sharesheet.open({ url: last.url })`. The shared `.open()` naming supports this, but I'm guessing for `settings.open()`. I assume it opens the system Settings app (probably this app's permission page), and nothing in the code confirms that.

2: `cam.takePhoto()` uses the camera shown on this page. `cam` comes from `camera()` and is drawn by `<base.camera el={cam} />`.

3: `settings.open()` has no awaited result, so it returns nothing useful (maybe void or a promise). `cam.takePhoto()` returns a promise of a `Photo`, which is assigned directly to `last` and has a `.url`. `systemCamera.open()` and `photoLibrary.open()` return a promise of `Photo` or null/undefined. The `?? last` suggests null or undefined means the user cancelled, so `last` keeps its old value. `sharesheet.open({ url })` isn't awaited and its result is ignored. It may return something, such as a promise of whether the user shared, but I'm guessing.

4: "Use phone camera" opens the phone's own camera app so the user takes a new photo there. "Choose a photo" opens the phone's photo library so the user picks an existing photo. Both appear to return a `Photo` or nothing if cancelled, and either result replaces `last`. Neither one uses the camera embedded on this page.

5: Two pairs are easy to mix up. The first is `camera()` / `cam.takePhoto()` versus `systemCamera.open()`: both are "the camera", and only the `system` prefix tells you one is the phone's app and the other is the camera on the page. The second is the `.open()` calls themselves. Three of them produce or hand over a photo, but `settings.open()` returns nothing, and I can't tell whether `sharesheet.open` returns a result. Two names left me unsure. `cam.access === 'denied'` hints at other values ('granted', 'prompt'?) that I don't know, and it isn't clear when the permission prompt happens. `cam.ready` doesn't say whether it covers permission, hardware startup or both.

Tools used: none
