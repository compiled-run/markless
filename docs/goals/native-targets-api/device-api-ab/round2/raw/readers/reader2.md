## Design KJ
Q1: The `<device.camera>` element is removed and they see "Camera access is off." with an "Open Settings" button. "Take photo" stays on screen but disabled, because `ready` never becomes true. "Flip camera" is still shown.

Q2: They can't press it. The button is `disabled={!ready}` until `onReady` fires, and the handler also checks `if (cam)`.

Q3: One element, `<device.camera>`. The code reaches it through `element<CameraElement>()`. The buttons are ordinary buttons outside it.

Q4: The `scan={['qr']}` prop turns QR scanning on, and `onScan(text)` reports each code. Repeats are ignored by `if (text !== code)`, which only skips the same code read twice in a row.

Q5: The camera is released once `takePhoto()` resolves and sets `photo`. The `@else if (photo)` branch then removes `<device.camera>` from the page. "Close" sets `photo = null` (and `ready = false`), which puts the camera back in the page and starts it again. The code only implies that removal releases the device; the comment says so, but the code does not show it.

Q6: The "Record"/"Stop" button flips `recording`, which drives `<device.recorder active={recording}>`. `onTick` feeds the seconds and `onChange` delivers the clip. The code doesn't show whether `<device.recorder>` draws anything; it seems to be an element with nothing visible.

Q7: The search page calls `navigate('/map?lat=…&lng=…')`. MapPage reads `url.search` through `placeFrom` to set the starting `center` state.

Q8: It awaits `device.location.current()` and assigns the result to `center`. If the error is a `NotAllowedError`, it shows "Location access is off."

## Design ZK
Q1: The `@if (!cam.denied)` block removes `<camera>`. `<camera.error of={cam}>` then shows its children ("Camera access is off." plus "Open Settings"). I'm assuming `camera.error` renders only on denial; the code does not show that. The trigger and "Flip camera" stay on screen.

Q2: The code doesn't show it. It depends on how `<camera.trigger>` behaves, perhaps disabled or doing nothing until the camera is ready.

Q3: Several pieces work together: the `camera()` object, `<camera el={cam}>`, `<camera.error of={cam}>` and `<camera.trigger of={cam}>`.

Q4: `cam.scan(callback)` is registered in the component body. The code doesn't say which formats are scanned; nothing names QR. Repeats are ignored by `text !== code`.

Q5: It is released in the trigger's `onPhoto`, which sets `cam.active = false`. "Close" sets `cam.active = true`, which starts it again. The `<camera>` element stays in the page the whole time.

Q6: `<recorder.trigger of={rec}>` presumably toggles start and stop; this is implied, not shown. `<recorder.label>` presumably shows the elapsed seconds. On screen there is only the trigger and the label, no other recorder element. Denial is read from `rec.denied`.

Q7: Same as KJ: a URL query, read by `placeFrom` when `mapview({ center })` is created.

Q8: `<mapview.trigger of={map}>` presumably moves the map to the user's location, but the code doesn't say so. Denial shows through `map.denied`.

## Design DU
Q1: `onError` sets `refused` only when the error is a `NotAllowedError`. They then see the text and "Open Settings", and `<Camera>` is removed. Other errors set `refused = false`, so nothing is shown for them.

Q2: The button is disabled until `onReady` fires. `camera?.capture()` guards against a missing camera, and the photo arrives later through `onChange`.

Q3: One component, `<Camera>`, reached through an element reference.

Q4: The boolean `scan` prop turns scanning on, but the code doesn't say which formats. `onCode(text)` reports each code, and repeats are ignored by `text !== code`.

Q5: Same as KJ. When `onChange` sets `photo`, the `@if` removes `<Camera>`. "Close" sets `photo = null`, which mounts it again. That this releases the camera rests on the comment.

Q6: The button calls `rec.start()` and `rec.stop()`. If `start()` rejects with `NotAllowedError`, `refused` is set. `rec.elapsed` shows the seconds. Nothing is rendered for the recorder itself; it is only the `recorder()` object.

Q7: The same URL query. `placeFrom(url.search)` is passed straight into the `center` prop.

Q8: It calls `view?.locate()`, which presumably centers on the user. A `NotAllowedError` arrives through `onError`. Pins are an array of places, and `onPin(index)` looks the spot up by index.

## Design JR
Q1: When `cam.denied` is true, `<camera>` is removed and they see the text and "Open Settings". "Take photo" stays disabled.

Q2: They can't press it. The button is `disabled={!cam.ready}`.

Q3: One element, `<camera el={cam} />`, backed by the `camera()` object.

Q4: `cam.scan(callback)`, with no format named. Repeats are ignored by `text !== code`.

Q5: It is released right after `await cam.takePhoto()` resolves, which sets `cam.active = false`. "Close" sets `cam.active = true` to start it again. The element stays in the page.

Q6: The button calls `rec.start()` and `rec.stop()`. `void` discards the promise from `start()`. `rec.seconds`, `rec.denied` and `rec.clip` drive the screen. No recorder element is on screen.

Q7: The same URL query, read by `placeFrom` into `mapview({ center })`.

Q8: It calls `map.locate()`, which presumably centers on the user. Denial shows through `map.denied`.

## Design WZ
Q1: `<camera.error>` presumably shows its content (the text and "Open Settings") when access is refused. The code doesn't show whether `<camera.area>` hides or whether the trigger is disabled. "Flip camera" stays on screen.

Q2: The code doesn't show it. It depends on `<camera.trigger>`'s built-in behaviour.

Q3: Several parts work together: `camera.root` wraps the whole UI, and `camera.area`, `camera.error` and `camera.trigger` sit inside it.

Q4: A `scan` prop on the root plus `onCode(text)`, with no format named. Repeats are ignored by `text !== code`.

Q5: `active={photo === null}` controls it. The camera is released as soon as `onCapture` sets `photo`. "Close" sets `photo = null`, which makes `active` true and restarts the camera.

Q6: `<recorder.trigger>` presumably toggles recording. `<recorder.label>` presumably shows the seconds, and `<recorder.error>` shows the denial message. `recorder.root` with `handle={rec}` wraps them, and state is read from `rec`.

Q7: A shared handle at module level, `cityMap = map.handle()`. The search page calls `cityMap.moveTo(spot.at)` and then `navigate('/map')`. The code doesn't show whether a `moveTo` made before the map is mounted survives the root's `center={spots[0].at}`. The URL also no longer carries the location, so a reload or shared link loses it.

Q8: `<map.trigger>` presumably recenters on the user. This is implied, not shown. `<map.error>` shows the denial message.

## Ranking
1. JR — Every behaviour is visible in the code: `cam.ready`, `cam.denied`, `takePhoto()`, `cam.active`, `rec.start()`/`stop()` and `map.locate()`, with very little state to manage by hand.

2. KJ — Explicit and easy to trace, but it needs a lot of hand-managed `ready`/`denied` state. The `<device.recorder>` element that draws nothing is odd.

3. DU — A familiar component-plus-reference style. However, `onError` filtering by `error.name`, pins matched by array index, and two different patterns (a component for the camera, an object for the recorder) add friction.

4. ZK — It mixes objects with trigger, error and label parts whose behaviour is hidden. The `of={cam}` wiring is easy to get wrong.

5. WZ — Most behaviour hides inside compound parts: the trigger, the error display, and what makes "Recenter" work. The module-level map handle is shared global state with unclear timing against `navigate`.

## Confusions
In ZK and JR, `<map.pin at={spot.at} … />` uses `map`, a local variable from `const map = mapview(...)`, as a tag namespace. It's unclear whether `pin` comes from the instance or the module.

In ZK and JR, `<camera el={cam} />` uses the same name `camera` as both the factory function and the tag.

In ZK, I couldn't tell when `<camera.error of={cam}>` renders. It is also unclear why the code needs `@if (!cam.denied)` if the parts already know about denial.

In KJ, `<device.recorder active={recording} … />` seems to draw nothing on screen.

In DU, `onError={(error) => (refused = error.name === 'NotAllowedError')}` silently resets `refused` on other errors.

In WZ, it's unclear whether `cityMap.moveTo(spot.at); await navigate('/map');` wins over `<map.root handle={cityMap} center={spots[0].at}>` when the page mounts.

In ZK, `<mapview.trigger of={map}>Recenter on me</mapview.trigger>` gives no hint that the trigger means "locate the user".

Tools used: none