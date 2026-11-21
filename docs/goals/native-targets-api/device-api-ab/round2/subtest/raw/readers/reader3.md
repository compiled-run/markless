## Variant EC
A: The phone's own camera screen opens with `camera.takePhoto()` in `photo = (await camera.takePhoto()) ?? photo;`. The camera on the page takes a photo with `cam.takePhoto()` in `photo = await cam.takePhoto();`.
B: One import per feature, and that import works two ways. When the feature needs a lifetime (an element on the page, a live subscription, ready state), you call it to make an object: `camera()`, `location()`, `mapview()`. One-off actions are methods on that same import (`camera.takePhoto()`, `location.current()`, `notifications.schedule()`) or plain functions (`share`, `haptic`, `openSettings`).
C: Yes. The two cameras use the same method name, and only one letter tells them apart: `await cam.takePhoto()` vs `await camera.takePhoto()`. The `?? photo` on one call and not the other is the only hint that the system screen can be cancelled. It was also unclear whether `<camera el={cam} />` refers to the imported `camera` or is a built-in tag. `location` also hides the browser's global `window.location`.

## Variant MM
A: The phone's own camera screen opens with `screen.open()` in `photo = (await screen.open()) ?? photo;`, after `const screen = cameraScreen();`. The camera on the page takes a photo with `cam.capture()` in `photo = await cam.capture();`.
B: Every feature is an object you make first in the component body and then call methods on, even for one-off actions.
C: Yes. `const app = settings();` followed by `app.open()` adds a step just to open Settings, and so do `const sheet = sharing();` and `const buzz = haptics();`. In `const screen = cameraScreen();`, the name `screen` hides the browser's global `window.screen`. With both `camera()` and `cameraScreen()` imported, I had to stop and work out which one is the page camera.

## Variant AZ
A: The phone's own camera screen opens with `takePhoto()` in `photo = (await takePhoto()) ?? photo;`. The camera on the page takes a photo with `cam.capture()` in `photo = await cam.capture();`.
B: If something keeps state or is shown on the page, it is an object you make (`camera()`, `mapview()`, `watchLocation()`). One-off actions are plain functions named with a verb (`takePhoto`, `currentPosition`, `share`, `haptic`, `notify`, `openSettings`).
C: Mostly no. `notify({ ..., at: new Date(...) })` hides the fact that this schedules a notification for later, because the name sounds like it fires now. `watchLocation()` returning an object with `.position`/`.denied` is fine but surprised me a little, since "watch" usually takes a callback. `takePhoto()` and `cam.capture()` use two verbs for similar actions, but that is exactly what makes them easy to tell apart.

## Ranking
1. AZ — The names say what each call does, and in task 7 the two cameras can't be confused (`takePhoto()` vs `cam.capture()`).
2. EC — Grouping everything under one import per feature is tidy and easy to discover, but `camera.takePhoto()` vs `cam.takePhoto()` is a one-letter difference with very different behaviour.
3. MM — It is consistent, but making an object for every one-off action (`settings()`, `sharing()`, `haptics()`) adds steps and names that don't help the reader.

## Spelling
D: I'd guess it comes from the `camera` imported from `@markless/device`: the compiler uses the binding in scope as the component for the tag. But because it is lowercase, it looks like a built-in HTML-style element, so a reader can't tell from the tag alone.
E: In X, `<camera el={cam} />` is ambiguous between the import and a built-in tag. In Y, `device.camera` does three jobs: you call it (`device.camera()`), use it as a tag (`<device.camera el={cam} />`), and call methods on it (`device.camera.takePhoto()`). That is a lot of meaning on one name, though the dotted tag at least shows plainly where the tag comes from.
F: Y, narrowly, for maintainers. `<device.camera>` and `device.camera.takePhoto()` make it obvious that both are device features and not built-in tags or local helpers, and that is worth the extra `device.` prefix. X is shorter to write, but it depends on the reader noticing the import line.

Tools used: none