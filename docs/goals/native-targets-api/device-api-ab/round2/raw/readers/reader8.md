## Design ZK
Q1: The camera view is hidden by `@if (!cam.denied)`. `<camera.error of={cam}>` then presumably shows "Camera access is off." and an "Open Settings" button. The code never says when `camera.error` appears; I am reading that from its name. The "Take photo" trigger and the "Flip camera" button stay on screen.

Q2: The code does not show this. `<camera.trigger of={cam}>` is a library-made button, so whether it is disabled, ignores the press, or waits for the camera is not visible.

Q3: Several. `<camera el={cam} />` is the view. `<camera.error of={cam}>` and `<camera.trigger of={cam}>` are separate elements, all tied to the one `cam` object made by `camera()`.

Q4: A callback is registered once in the component body: `cam.scan((text) => …)`. Repeats are ignored by `if (text !== code)`, which only drops a code identical to the last one. Nothing shows that it reports QR codes only rather than any barcode.

Q5: It is released right after a photo arrives, when `onPhoto` sets `cam.active = false`. The "Close" button sets `cam.active = true`, which starts it again. The `<camera>` element stays in the markup the whole time.

Q6: `<recorder.trigger of={rec}>` starts and stops recording; the toggle logic is inside the library. On screen are that trigger button (its text comes from `rec.recording`) and `<recorder.label of={rec} />`, which presumably shows elapsed seconds. The recorder itself (`recorder()`) is an object with no visible element.

Q7: The search page calls `navigate('/map?lat=…&lng=…')`. MapPage reads `url.search` through `placeFrom` and passes the result as the starting `center` to `mapview({...})`.

Q8: `<mapview.trigger of={map}>` is a library-made button. It presumably gets the current location and recenters, but the code does not show this. A refusal shows up as `map.denied`.

## Design KJ
Q1: `onDenied` sets `denied`, which swaps the camera for "Camera access is off." plus an "Open Settings" button. "Take photo" stays visible but disabled, because `ready` never became true. "Flip camera" stays visible.

Q2: Nothing happens. The button is `disabled={!ready}` until `onReady` fires, and `if (cam)` also guards the call.

Q3: One element, `<device.camera el={cam} …/>`. Its handle `cam` provides `takePhoto()`. The buttons are plain buttons.

Q4: Through props on the camera: `scan={['qr']}` asks for QR codes and `onScan={(text) => …}` receives them. Repeats are dropped by `text !== code`, which only catches the same code twice in a row.

Q5: When `photo` is set (after `await cam.takePhoto()` resolves), the `@else if (photo)` branch removes `<device.camera>` from the page. That removal is what releases it, according to the comment. "Close" sets `photo = null`, so the `@else` branch mounts the camera again. It also resets `ready = false`.

Q6: The plain button flips `recording`, and that feeds `<device.recorder active={recording}>`. The seconds counter comes from `onTick` and the clip from `onChange`. The code does not show whether `<device.recorder>` itself draws anything; it has no children and seems to be invisible.

Q7: Through the URL query (`?lat=…&lng=…`). MapPage starts its `center` state from `placeFrom(url.search)` and binds `center={center}` on `<device.map>`.

Q8: It calls `await device.location.current()` and assigns the result to `center`. If that fails with `NotAllowedError`, `denied` becomes true. Any other error is swallowed: `denied` is set to false and nothing is shown.

## Design JR
Q1: When `cam.denied` is true, the view is replaced by "Camera access is off." and an "Open Settings" button. "Take photo" stays visible but is disabled by `!cam.ready`. "Flip camera" stays visible.

Q2: Nothing happens. The button has `disabled={!cam.ready}`.

Q3: One element, `<camera el={cam} />`, driven by the `cam` object. Its methods (`takePhoto`) and fields (`facing`, `ready`, `denied`) live on that object. The buttons are plain.

Q4: `cam.scan((text) => …)` is called once in the component body. Repeats are dropped by `text !== code`, which only catches consecutive repeats. Nothing shows that it is QR-only.

Q5: Right after `await cam.takePhoto()` resolves, the code sets `cam.active = false`. "Close" sets `cam.active = true`. The element stays mounted.

Q6: A plain button calls `rec.start()` or `rec.stop()`. Errors from `start()` are discarded with `void`, and a refusal shows up as `rec.denied`. Seconds come from `rec.seconds`. There is no recorder element, only the `recorder()` object.

Q7: Same as ZK: the query string is passed to `mapview({ center: placeFrom(url.search) ?? … })` when the page is created.

Q8: `map.locate()`. Presumably it gets the current position and recenters the map, but the code does not show what it does. A refusal shows up as `map.denied`.

## Design DU
Q1: `onError` sets `refused` when `error.name === 'NotAllowedError'`. The view is then replaced by "Camera access is off." and an "Open Settings" button. "Take photo" stays visible but disabled. Any other error sets `refused` to false and shows nothing.

Q2: Nothing happens. The button is `disabled={!ready}` until `onReady` fires, and `camera?.capture()` also guards a missing handle.

Q3: One component element, `<Camera el={camera} …/>`. `camera.capture()` triggers the shot, but the photo comes back separately through `onChange`.

Q4: Through props: `scan` (a plain on/off flag) plus `onCode={(text) => …}`. Repeats are dropped by `text !== code`. Which kinds of code it reads is not shown.

Q5: When `onChange` sets `photo`, the `@else if (photo)` branch removes `<Camera>`, which per the comment stops the camera. "Close" sets `photo = null`, so `<Camera>` mounts and starts again.

Q6: A plain button calls `rec.start()` or `rec.stop()`. A refusal is caught from the promise that `start()` returns and checked by error name. Seconds come from `rec.elapsed`. There is no recorder element.

Q7: Through the query string. `center={placeFrom(url.search) ?? spots[0].at}` is passed on `<MapView>`.

Q8: `view?.locate()` is called on the map element's handle. What it does exactly is not shown, presumably a recenter. A refusal arrives through `onError`.

## Design WZ
Q1: Presumably `<camera.error>` shows "Camera access is off." and an "Open Settings" button. The code does not show whether `<camera.area />` and `<camera.trigger>` hide, go blank, or stay.

Q2: The code does not show this. `<camera.trigger>` is a library-made button.

Q3: Several parts: `<camera.root>`, `<camera.area />`, `<camera.error>` and `<camera.trigger>`. The root wraps everything, including the unrelated "Flip camera" button and the `<img>`.

Q4: Through props on the root: `scan` and `onCode={(text) => …}`. Repeats are dropped by `text !== code`.

Q5: `active={photo === null}` on the root. The camera is released as soon as `onCapture` sets `photo`. "Close" sets `photo = null`, so `active` becomes true and the camera starts again. The whole thing is declarative.

Q6: `<recorder.trigger>` inside `<recorder.root handle={rec}>` starts and stops recording; the logic is inside the library. On screen are the trigger, `<recorder.label />` for the seconds, and `<recorder.error>`. Whether `recorder.root` draws a wrapper element is not shown.

Q7: The search page calls `cityMap.moveTo(spot.at)` on a shared handle created once at module level in `places.ts`, then `navigate('/map')`. Nothing goes in the URL. The code does not show how this interacts with `center={spots[0].at}` on `<map.root>` when the page mounts, or what `moveTo` does before the map exists.

Q8: `<map.trigger>` is a library-made button. Presumably it gets the location and recenters, but the code does not show it. A refusal shows through `<map.error>`.

## Ranking
1. JR — Every action is an explicit call you can read (`takePhoto`, `start`/`stop`, `locate`) on one object that owns one visible element. State such as `ready` and `denied` is read straight off that object.
2. KJ — Very explicit and easy to trace, because every flag is local `state`. The cost is a lot of repeated `ready`/`denied` wiring, plus an invisible `<device.recorder>` element and a `try/catch` that quietly swallows non-permission errors.
3. DU — Similar to KJ, but more indirect: `capture()` returns nothing and the photo arrives through `onChange`, pins are matched by array index, and refusals are detected by checking error-name strings in several places.
4. ZK — Short, but key behaviour lives inside library buttons (`camera.trigger`, `recorder.trigger`, `mapview.trigger`). One name, `camera`, is used as a function, a tag and a namespace, and the denied case is handled in two places at once.
5. WZ — The most implicit design. Library parts are wired through a hidden context, the root wraps unrelated markup, and a singleton map handle at module level replaces the URL. That makes the search-to-map flow depend on timing nobody can see, and deep links and reloads lose the location.

## Confusions
ZK/JR: `<map.pin at={spot.at} … />`. Here `map` is a local variable returned by `mapview()`, yet it is used as a tag namespace, while the sibling tag is `<mapview.trigger of={map}>`. It is unclear where the `map.pin` tag comes from.

ZK: `<camera el={cam} />` next to `const cam = camera(...)`. `camera` is a function, a tag, and the namespace for `camera.error` and `camera.trigger`. The code also uses both `@if (!cam.denied)` and `<camera.error of={cam}>`, so it is unclear which one actually controls what shows on refusal.

ZK/WZ: `<recorder.label of={rec} /> s`. Nothing says what the label renders. I assumed seconds only because of the trailing " s".

KJ: `<device.recorder active={recording} … />`. This element seems to show nothing on screen. `onChange={(next) => (clip = next)}` is also an odd name for "recording finished".

KJ: `denied = (error as Error).name === 'NotAllowedError';` hides every other location error without telling anyone.

DU: `onChange={(next) => (photo = next)}` on a camera, together with `camera?.capture()`, splits one action across two places. `onPin={(index) => (chosen = spots[index])}` relies on the array order staying in sync.

WZ: `export const cityMap = map.handle();` in a data file, together with `<map.root handle={cityMap} center={spots[0].at}>`. It is unclear whether `center` overrides an earlier `cityMap.moveTo(...)`. `<camera.area />` and `<camera.root>` leave it unclear which parts render real elements.

Tools used: none