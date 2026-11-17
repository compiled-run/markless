## Variant MM
A: `screen.open()` opens the phone's own camera screen (`const screen = cameraScreen();`). `cam.capture()` takes a photo from the camera shown on the page (`const cam = camera();`).
B: Every feature is an object you make first: you call a factory once in the component body (`cameraScreen()`, `location()`, `settings()`, `sharing()`, `haptics()`, `notifications()`), then call methods on it. Nothing is a bare function call.
C: `const app = settings();` followed by `app.open()`, and `const sheet = sharing();` followed by `sheet.share(...)`. Making an object only to make one fire-and-forget call reads like ceremony, and it made me wonder whether the object holds state or needs cleanup. `const buzz = haptics();` has the same problem. Task 2 (`loc.current()`) and task 3 (`me.position`) both use `location()`, so I can't tell from the name whether making one starts watching the position.

## Variant EC
A: `camera.takePhoto()` (a method called directly on the imported `camera`) opens the phone's own camera screen. `cam.takePhoto()` (on `const cam = camera();`) takes a photo from the camera shown on the page.
B: A one-shot action is a plain function or a method on the imported name (`share()`, `haptic()`, `openSettings()`, `notifications.schedule()`, `location.current()`, `camera.takePhoto()`). Something with live state or something shown on the page is an object you make by calling that same name (`location()`, `camera()`, `mapview()`).
C: Yes, task 7: `photo = await cam.takePhoto();` next to `photo = (await camera.takePhoto()) ?? photo;`. The two lines differ only in `cam` versus `camera`, yet they do very different things. `camera` is also a function, a namespace and (in `<camera el={cam} />`) a tag all at once, and `location` is used both as `location.current()` and as `location()`, so the same name means two things.

## Variant AZ
A: `takePhoto()` opens the phone's own camera screen. `cam.capture()` (on `const cam = camera();`) takes a photo from the camera shown on the page.
B: A one-shot action is a bare verb function (`takePhoto`, `currentPosition`, `openSettings`, `share`, `haptic`, `notify`). Something with a lifetime is an object you make: a view on the page (`camera()`, `mapview()`) or a live subscription (`watchLocation()`).
C: Only a little: `notify({ ..., at: new Date(...) })`. The name `notify` suggests it fires now, but passing `at` schedules it for later. `watchLocation()` returning an object with `.position` and `.denied`, not taking a callback, also took a second look.

## Ranking
1. AZ — Each name says what it does (`takePhoto()` versus `cam.capture()`), so the two cameras can't be confused, and only things with a lifetime become objects.
2. MM — The single "always make an object" rule is predictable and keeps the two cameras apart (`cameraScreen` versus `camera`), but it adds boilerplate objects for one-shot actions.
3. EC — The same name serves as a namespace, a factory and a tag, and both cameras use the same method name, so `cam.takePhoto()` and `camera.takePhoto()` are easy to mix up.

## Spelling
D: From the `camera` import (`import { camera, ... } from '@markless/device'`). The tag seems to resolve to that binding in scope, not to an HTML element, though a lowercase tag normally looks like a built-in element.
E: In X, `<camera el={cam} />` looks like a native HTML element, and `camera` is a factory, a tag and a namespace all at once. In both spellings, `cam.takePhoto()` and `camera.takePhoto()` / `device.camera.takePhoto()` use the same method name for different actions. Y is a little better on that point because the `device.` prefix sets the system-camera call apart.
F: Y. `<device.camera el={cam} />` is clearly a framework component, not an HTML tag, and every device feature can be found under one `device.` prefix. The extra length is small, and I would rather read Y.

Tools used: none