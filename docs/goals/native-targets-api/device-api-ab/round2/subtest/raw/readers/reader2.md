## Variant MM
A: The phone's own camera screen opens with `screen.open()` (in `photo = (await screen.open()) ?? photo;`). The camera shown on the page takes a photo with `cam.capture()` (in `photo = await cam.capture();`).

B: Every feature is an object you make first, always. Each one comes from a factory at the top of the component (`cameraScreen()`, `location()`, `settings()`, `sharing()`, `haptics()`, `notifications()`), and you then call methods on it. This holds even for one-shot actions that keep no state.

C: The uniform ceremony around one-shot actions slowed me down: `const app = settings();` followed by `app.open()`, and `const sheet = sharing();` followed by `sheet.share(...)`. I couldn't tell whether making these objects does anything, such as asking for permission or holding a resource. I also wasn't sure that `location()` serves both jobs: a one-time read in task 2 (`loc.current()`) and live tracking in task 3 (`me.position`, `me.denied`). From the code I can't tell whether making it in task 2 also starts watching the position.

## Variant AZ
A: The phone's own camera screen opens with `takePhoto()` (in `photo = (await takePhoto()) ?? photo;`). The camera shown on the page takes a photo with `cam.capture()` (in `photo = await cam.capture();`).

B: One-shot actions are plain functions you call directly (`takePhoto`, `currentPosition`, `openSettings`, `share`, `haptic`, `notify`). Things with an ongoing lifetime or state that you render or watch are objects (`camera()`, `mapview()`, `watchLocation()`).

C: `notify({ ..., at: new Date(...) })` confused me a little, because "notify" sounds like it fires right away, not like scheduling. `takePhoto()` versus `cam.capture()` is a small naming mismatch for two ways of getting a photo, but at least the two names can't be mixed up.

## Variant EC
A: The phone's own camera screen opens with `camera.takePhoto()` (in `photo = (await camera.takePhoto()) ?? photo;`). The camera shown on the page takes a photo with `cam.takePhoto()` (in `photo = await cam.takePhoto();`).

B: A feature name is a namespace that you can also call. Calling it (`camera()`, `location()`) makes a live instance. Calling a method on the namespace itself (`camera.takePhoto()`, `location.current()`, `notifications.schedule()`) does a one-shot action. Very simple features are bare functions (`share`, `haptic`, `openSettings`).

C: Yes, task 7: `await cam.takePhoto()` versus `await camera.takePhoto()`. Same method name, nearly the same receiver, but they do different things: one uses the camera on the page, the other opens the phone's camera screen. That is easy to misread and easy to mistype. `location.current()` beside `location()` has the same problem. The split also seems inconsistent: `openSettings()` is a bare function, but `notifications.schedule()` goes through a namespace.

## Ranking
1. AZ — Every one-shot action has its own name, so the phone's camera screen (`takePhoto()`) can't be confused with the on-page camera (`cam.capture()`), and objects appear only where something has a lifetime.
2. MM — Fully consistent and unambiguous, but making an object for every one-shot action (`settings()`, `sharing()`, `haptics()`) adds ceremony and hides which objects actually hold anything.
3. EC — The same name, `camera`, is both a factory and a namespace, so `cam.takePhoto()` and `camera.takePhoto()` look almost the same while doing different things.

## Spelling
D: I'd guess it comes from the imported `camera` binding: the compiler sees that a lowercase tag matches a name in scope and treats it as that component rather than an HTML element. But nothing in the code says so, and a lowercase tag normally reads as a native element (as if `<camera>` were HTML).

E: In Y, `<camera el={cam} />` looks like a built-in HTML tag. And `camera` is doing three jobs at once: factory in `camera()`, tag in `<camera>`, and namespace in `camera.takePhoto()`. In X, `device.camera` carries the same three jobs (`device.camera()`, `<device.camera>`, `device.camera.takePhoto()`), so `cam.takePhoto()` versus `device.camera.takePhoto()` still needs a careful read.

F: I'd rather write and read X. The dotted tag `<device.camera el={cam} />` is clearly a component from the device package, not an HTML element, and the `device.` prefix shows where each call comes from. The cost is some verbosity, and it doesn't fix the shared `takePhoto` name.

Tools used: none