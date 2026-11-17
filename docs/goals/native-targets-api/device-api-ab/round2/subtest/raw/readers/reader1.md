## Variant AZ
A: The phone's own camera screen opens with `await takePhoto()`. The photo from the camera shown on the page comes from `await cam.capture()`.

B: Anything with a live presence is an object you make first. That covers features that show something on the page (`camera()`, `mapview()`) and features that keep updating state (`watchLocation()` with `.position`/`.denied`). One-shot actions are plain imported functions: `takePhoto`, `currentPosition`, `share`, `haptic`, `notify`, `openSettings`.

C: Nothing in the device API confused me. The verbs `takePhoto()` and `cam.capture()` are different, so the two cameras are easy to tell apart. One small gap is that `watchLocation()` and `currentPosition()` have unrelated names for the same feature, so nothing tells me they belong together. A gap shared by all three variants: in task 2, `attempt;` is read but never assigned, so it's unclear whether `reset` re-runs the computed by itself or whether `attempt` is dead code.

## Variant MM
A: The phone's own camera screen opens with `await screen.open()` (from `const screen = cameraScreen();`). The photo from the camera shown on the page comes from `await cam.capture()`.

B: Every feature is an object you make first with a factory (`cameraScreen()`, `location()`, `settings()`, `sharing()`, `haptics()`, `notifications()`), and then you call methods on it. Nothing is a bare function call.

C: Several lines felt like ceremony. `const app = settings(); ... app.open()` and `const sheet = sharing();` create objects that hold no visible state just to call one method. Also, `location()` serves both the one-shot read in task 2 (`loc.current()`) and the live position in task 3 (`me.position`). I couldn't tell whether making it in task 2 already starts watching the location or asks for permission.

## Variant EC
A: The phone's own camera screen opens with `await camera.takePhoto()`. The photo from the camera shown on the page comes from `await cam.takePhoto()`.

B: The feature name does double duty. Calling it (`camera()`, `location()`) makes a live or on-page instance. The same name also works as a namespace for one-shot static methods (`camera.takePhoto()`, `location.current()`, `notifications.schedule()`). Features that are only an action stay bare functions: `share`, `haptic`, `openSettings`.

C: Yes. In task 7, `photo = await cam.takePhoto();` and `photo = (await camera.takePhoto()) ?? photo;` differ only by `cam` versus `camera`, yet one uses the camera on the page and the other opens a separate system screen. That is very easy to misread or mistype. `location.current()` next to `location()` has the same problem. And `notifications` is used only as a namespace, while `camera`/`location` are also callable, so the rule is not uniform.

## Ranking
1. AZ — Different verbs (`takePhoto()` versus `cam.capture()`) and plain functions for one-shot actions make each line say exactly what it does, with the least code.

2. MM — It is fully consistent and unambiguous, but making an object for every one-shot action adds boilerplate and raises lifecycle questions such as what `location()` starts.

3. EC — Using one name as both a factory and a namespace with a shared verb (`cam.takePhoto` versus `camera.takePhoto`) hides the most important distinction behind one identifier.

## Spelling
D: I assume `<camera>` resolves to the `camera` binding imported from `@markless/device`, so the compiler treats a lowercase tag that matches an in-scope import as that component. Visually, though, it reads like a native or custom HTML element. I can't be sure it doesn't fall back to an unknown `<camera>` DOM element if the import is missing.

E: In X, the bare `<camera el={cam} />` is confusing because nothing in the markup shows it is the import rather than HTML. In both spellings, one name plays three roles: factory (`camera()` / `device.camera()`), tag (`<camera>` / `<device.camera>`) and namespace (`camera.takePhoto()` / `device.camera.takePhoto()`). Y makes `device.camera.takePhoto()` versus `cam.takePhoto()` no easier to tell apart.

F: I'd rather use Y. `<device.camera el={cam} />` clearly points at an imported value, not an HTML element, and the single `device` import makes it obvious which calls touch hardware. The extra length is a fair price. Better still would be to keep Y's dotted tag and give the system camera its own verb, as AZ does, so it can't be confused with the in-page camera's shutter call.

Tools used: none