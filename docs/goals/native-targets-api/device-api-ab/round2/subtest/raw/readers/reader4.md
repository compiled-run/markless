## Variant EC
A: `camera.takePhoto()` opens the phone's own camera screen. `cam.takePhoto()` takes a photo from the camera shown on the page.

B: Anything that has to stay alive and be shown or watched is an object you make with a call: `camera()`, `location()`, `mapview(...)`. One-off actions are functions, or methods on the same import used as a namespace: `camera.takePhoto()`, `location.current()`, `notifications.schedule(...)`, `share(...)`, `haptic(...)`. So one import name often does both jobs.

C: Yes. In task 7, `photo = await cam.takePhoto();` and `photo = (await camera.takePhoto()) ?? photo;` use the same method name and differ only in `cam` versus `camera`. One works quietly on the camera in the page and the other opens a full-screen system screen, which is easy to misread or mistype. It was also confusing that `location` is both called, in `const me = location();`, and used as a namespace, in `return await location.current();`. That made it hard to tell whether calling `location()` starts watching the position.

## Variant AZ
A: `takePhoto()` opens the phone's own camera screen. `cam.capture()` takes a photo from the camera shown on the page.

B: One-off actions are bare verb functions you import and call: `takePhoto`, `currentPosition`, `share`, `haptic`, `notify`, `openSettings`. Things with ongoing state or something on screen are objects you make first: `camera()`, `watchLocation()`, `mapview()`.

C: A little. The names don't follow one pattern: `currentPosition()` is a noun, `watchLocation()` is a verb, and "position" sits beside "location". Also, `notify({ ..., at: new Date(...) })` sounds like it notifies right away, even though it schedules a notification for later. Task 7 was clear because `takePhoto()` and `cam.capture()` are different words.

## Variant MM
A: `screen.open()` opens the phone's own camera screen, where `screen = cameraScreen()`. `cam.capture()` takes a photo from the camera shown on the page.

B: Every feature is an object you make first and then call methods on: `cameraScreen()`, `location()`, `settings()`, `sharing()`, `haptics()`, `notifications()`. There are no bare functions.

C: Yes. `const app = settings();` followed by `app.open()` reads as if it opens the app, not the Settings screen. `const sheet = sharing();` and `const buzz = haptics();` are setup steps for features that have no state to keep. The most important one is `const loc = location();` in task 2: task 3 uses the same `location()` to watch the position live, so it is unclear whether task 2 also starts live tracking when it only wants to read the position once.

## Ranking
1. AZ — Each distinct action has its own word (`takePhoto()` versus `cam.capture()`), and objects appear only where there is live state, so a reader can tell what each line does.
2. MM — Nothing is ambiguous, but making an object for every stateless action adds setup lines and odd names, and `location()` does double duty.
3. EC — It is the shortest, but `camera.takePhoto()` and `cam.takePhoto()` look almost the same while doing very different things, which is a trap for whoever maintains the code.

## Spelling
D: It comes from the `camera` imported from `@markless/device` in that file. The tag uses the in-scope import rather than a built-in HTML element, even though a lowercase tag normally means a plain HTML element.

E: Spelling Y did. In `<camera el={cam} />` you can't tell it apart from an HTML element, and the one name `camera` is the factory (`camera()`), the tag (`<camera>`) and the system-camera action (`camera.takePhoto()`). Spelling X only bothered me by being long: `device.camera.takePhoto()`. It also still has the same-method-name problem, `cam.takePhoto()` versus `device.camera.takePhoto()`, though the `device.` prefix makes the system call stand out more.

F: I'd rather write and read Spelling X. `<device.camera el={cam} />` shows clearly that this is a device component and not an HTML tag, and `device.camera.takePhoto()` reads as "ask the device's camera", which separates it from `cam.takePhoto()`. A few extra characters are worth that clarity.

Tools used: none