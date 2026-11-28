1: `openSettings()` opens the phone's Settings app. `takePhoto()` (the bare import, used by "Use phone camera") opens the phone's own camera app. `choosePhoto()` opens the phone's photo picker or gallery. `openShareSheet({ url: last.url })` opens the phone's share sheet. I'm guessing on details such as which Settings page opens, but all four look like they leave the page for a native screen.

2: `cam.takePhoto()` uses the camera shown on this page. `cam` comes from `camera()` and is passed into `<base.camera el={cam} />`.

3: `openSettings()` seems to return nothing; the handler doesn't use a result, so this is a guess. `cam.takePhoto()` returns a Promise<Photo>, assigned straight to `last` with no null check, so it seems always to give a photo, or throw on failure (guess). `takePhoto()` returns a Promise<Photo | null>, and the `?? last` suggests null when the user cancels. `choosePhoto()` also returns a Promise<Photo | null>, null on cancel. `openShareSheet({ url })` has an unused result, and it isn't awaited, so it probably returns nothing or a promise that gets ignored (guess). A Photo has at least a `.url`.

4: "Use phone camera" opens the phone's camera app to take a new photo right now. "Choose a photo" opens the gallery to pick a photo that already exists. Both resolve to a Photo, or null if cancelled, and neither uses the camera view on this page.

5: Yes: `cam.takePhoto()` and the bare `takePhoto()`. They have the same name but do different things: one shoots from the camera on this page, the other opens the phone's own camera app. Only the `cam.` prefix tells them apart, and from the name alone I could not tell which one leaves the page. `camera()` was also a bit unclear: it reads like it might open the camera, but it seems to create a handle for the camera on the page. And `cam.ready` versus `cam.access` leaves me guessing which values `access` can take besides 'denied'.

Tools used: none
