## Variant AZ
A: The phone's own camera screen opens with `takePhoto()`, in `photo = (await takePhoto()) ?? photo;`. The camera on the page takes a photo with `cam.capture()`, in `photo = await cam.capture();`.

B: Anything that stays on the page or keeps changing over time is an object you make first: `camera()`, `mapview()` and `watchLocation()`. One-time actions are plain functions you call directly: `takePhoto`, `currentPosition`, `share`, `haptic`, `notify` and `openSettings`.

C: A little. Nothing in the names tells you that `takePhoto()` is the system-camera partner of `camera()`, because they have no common name. The two location calls are named in different styles, `watchLocation()` and `currentPosition()`, so I couldn't guess one from the other. `?? photo` suggests `takePhoto()` can return null, probably when the user cancels, but the code doesn't say so.

## Variant EC
A: The phone's own camera screen opens with `camera.takePhoto()`, in `photo = (await camera.takePhoto()) ?? photo;`. The camera on the page takes a photo with `cam.takePhoto()`, in `photo = await cam.takePhoto();`.

B: Each feature name does two jobs. Calling it, as in `camera()` or `location()`, makes an object that lives on the page. Methods on the name itself, like `camera.takePhoto()`, `location.current()` and `notifications.schedule()`, are one-time actions. Features with only one action stay plain functions: `share`, `haptic` and `openSettings`.

C: Yes. `cam.takePhoto()` and `camera.takePhoto()` do different things, but they differ by a single word that is easy to swap. `const me = location();` hides the browser's global `location`. It is also unclear why `notifications.schedule(...)` is a method on a name while `share(...)` is a plain function.

## Variant MM
A: The phone's own camera screen opens with `screen.open()`, in `photo = (await screen.open()) ?? photo;`. The camera on the page takes a photo with `cam.capture()`, in `photo = await cam.capture();`.

B: Every feature is an object you make first, even for one-time actions: `cameraScreen()`, `location()`, `settings()`, `sharing()`, `haptics()` and `notifications()`.

C: Mostly the extra setup. `const app = settings();` followed by `app.open()` is boilerplate for a single call, and so is `const sheet = sharing();`. `const screen = cameraScreen();` hides the browser's global `screen`. It also wasn't clear whether `loc` in task 2 starts watching the position just to read it once.

## Ranking
1. AZ — In task 7 the two cameras use clearly different words (`takePhoto()` vs `cam.capture()`), and the code has the least setup.
2. MM — The rule is uniform and easy to predict, and the two cameras have distinct names, but every one-time call needs a setup line first.
3. EC — Two calls that look almost the same, `camera.takePhoto()` and `cam.takePhoto()`, do different things, which is a trap when maintaining or reviewing this code.

## Spelling
D: In spelling Y, I assume the tag comes from the `camera` imported from `@markless/device`, and the compiler matches the tag to that import in scope. Read on its own, it looks like a native HTML or custom element.

E: Yes. In Y, `<camera el={cam} />` looks like a plain HTML tag. In both spellings, `cam.takePhoto()` next to `camera.takePhoto()` (or `device.camera.takePhoto()`) is confusing. In X, `device.camera` serves as a tag, as a factory and as a holder of the `takePhoto` method all at once.

F: I would rather write and read Y. It is shorter, and the import line explains where `camera` comes from. X's `device.` prefix adds noise to every line and doesn't fix the `takePhoto` naming clash. The one thing X does better is that the dotted tag clearly isn't HTML.

Tools used: none