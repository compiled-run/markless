## Design KJ
Q1: The `<device.camera>` element is removed. In its place they see "Camera access is off." and an "Open Settings" button that calls `device.openSettings()`. `onDenied` sets `denied = true`, which causes this.

Q2: They can't press it. The button stays `disabled={!ready}` until `onReady` fires. The handler also checks `if (cam)` before calling `cam.takePhoto()`.

Q3: The camera view is one element, `<device.camera el={cam} …/>`. The shutter and flip buttons are ordinary `<button>`s that reach the camera through the `cam` element reference.

Q4: The camera element gets a `scan={['qr']}` prop, so QR is named explicitly, and an `onScan={(text) => …}` callback. Repeats are ignored with `if (text !== code)`. This only filters out the same code arriving twice in a row.

Q5: The camera is released once `takePhoto()` resolves and `photo` is set. At that point the `@else if (photo)` branch replaces the `@else` branch, so `<device.camera>` leaves the markup. The code comment says leaving the markup releases the device; the code itself doesn't show that. Pressing "Close" sets `photo = null` (and `ready = false`), which puts `<device.camera>` back and starts the camera again.

Q6: The Record/Stop button flips the `recording` state, and that state is bound to `<device.recorder active={recording}>`. Elapsed seconds come from `onTick` and the clip from `onChange`. The code does not show whether `<device.recorder>` draws anything itself. It has no children and looks like a non-visual controller element.

Q7: The search page calls `navigate('/map?lat=…&lng=…')`. MapPage reads `url.search` through `placeFrom` to set the starting `center` state, which feeds `<device.map center={center}>`.

Q8: It awaits `device.location.current()` and assigns the result to `center`, which moves the map. If the error's name is `NotAllowedError`, it sets `denied` and shows "Location access is off."

## Design ZK
Q1: Because `cam.denied` is true, `<camera el={cam} />` is not rendered. `<camera.error of={cam}>` presumably shows its children: "Camera access is off." and an "Open Settings" button. The code doesn't show when `camera.error` displays; I infer it shows only when access is denied.

Q2: The code does not show this. `<camera.trigger of={cam} onPhoto=…>` handles readiness inside the library. It might be disabled, queue the press, or do nothing.

Q3: Several elements work together: `<camera el={cam}>`, `<camera.error of={cam}>` and `<camera.trigger of={cam}>`. They are linked by the object that `camera({ facing: 'back' })` returns.

Q4: `cam.scan((text) => …)` is called once in the component body. QR is never named, so the code doesn't say which barcode formats are reported. Repeats are ignored with `if (text !== code)`, which only filters out the same code twice in a row.

Q5: The camera is released inside `onPhoto`, right after the photo arrives, when `cam.active = false` is set. The `<camera>` element stays in the markup. "Close" sets `cam.active = true`, which starts it again.

Q6: `<recorder.trigger of={rec}>` presumably toggles start and stop. Its label text comes from `rec.recording`. `<recorder.label of={rec} />` presumably shows the elapsed seconds; the code doesn't say what it renders. There is no recorder view element apart from the trigger and the label.

Q7: Through the URL query. MapPage builds `mapview({ center: placeFrom(url.search) ?? spots[0].at, zoom: 13 })`.

Q8: The code does not show this. `<mapview.trigger of={map}>` presumably locates the user and recenters the map. `map.denied` drives "Location access is off."

## Design WZ
Q1: The children of `<camera.error>` presumably show: "Camera access is off." and "Open Settings". The code doesn't show whether `<camera.area />` hides or stays empty on refusal. The trigger and flip button are still rendered.

Q2: The code does not show this. Readiness is handled inside `<camera.trigger>` and `<camera.root>`.

Q3: Several parts work together: `camera.root` holds `camera.area` (the view), `camera.error` and `camera.trigger`. The parts are linked implicitly by being nested inside the root.

Q4: There is a boolean `scan` prop on `camera.root` and an `onCode` callback. QR is not named. Repeats are ignored with `if (text !== code)`, which only filters out consecutive repeats.

Q5: The root has `active={photo === null}`. When `onCapture` sets `photo`, `active` becomes false and the camera is released. "Close" sets `photo = null`, which makes `active` true again. `<camera.area />` stays mounted throughout. The review panel is a child of `camera.root`.

Q6: `<recorder.trigger>` inside `<recorder.root handle={rec}>` presumably toggles recording. `<recorder.label />` presumably shows the seconds. `recorder.error` shows the refusal message. The code doesn't show whether `recorder.root` renders a wrapper element.

Q7: `places.ts` exports a module-level handle, `cityMap = map.handle()`. The search page calls `cityMap.moveTo(spot.at)` and then `navigate('/map')`. There is no URL parameter. The code does not show what happens to that move once MapPage mounts with `center={spots[0].at}`, which could override it.

Q8: The code does not show this. `<map.trigger>` presumably locates the user and recenters the map. `<map.error>` shows "Location access is off."

## Design JR
Q1: The `<camera>` is replaced by "Camera access is off." and an "Open Settings" button that calls `openSettings()`. This is driven by `cam.denied`.

Q2: They can't press it. The button is `disabled={!cam.ready}`.

Q3: The camera view is one element, `<camera el={cam} />`. The buttons are plain buttons that call methods on `cam`.

Q4: `cam.scan((text) => …)` registers the callback. QR is not named. Repeats are ignored with `if (text !== code)`, which only filters out consecutive repeats.

Q5: In the shutter handler, after `await cam.takePhoto()` resolves, `cam.active = false` releases the camera. The `<camera>` element stays in the markup. "Close" sets `cam.active = true`.

Q6: A plain button calls `rec.start()` or `rec.stop()`. The promise from `start()` is discarded with `void`, and a refusal shows up in `rec.denied`. Seconds come from `rec.seconds`. Nothing on screen belongs to the recorder itself.

Q7: Through the URL query (`navigate('/map?lat=…&lng=…')`). MapPage reads it with `placeFrom` to set the initial `center` passed to `mapview(...)`.

Q8: `map.locate()` is called. Presumably it gets the user's position and recenters the map. `map.denied` drives the refusal message.

## Design DU
Q1: `onError` sets `refused = error.name === 'NotAllowedError'`. The `<Camera>` is then replaced by "Camera access is off." and "Open Settings". For any other error, `refused` stays false and nothing is shown.

Q2: They can't press it. The button is `disabled={!ready}` until `onReady` fires. The handler calls `camera?.capture()`.

Q3: The camera view is one `<Camera>` component. The shutter button is separate. `capture()` doesn't return the photo; it arrives through `onChange`.

Q4: There is a boolean `scan` prop and an `onCode` callback. QR is not named. Repeats are ignored with `if (text !== code)`, which only filters out consecutive repeats.

Q5: When `onChange` delivers the photo, `photo` is set and the `@else if (photo)` branch removes `<Camera>`. The code comment says the camera runs only while `<Camera>` is in the page. "Close" sets `photo = null` (and `ready = false`), which mounts it again.

Q6: A plain button calls `rec.start()` or `rec.stop()`. A refusal is caught from `start()` and checked for `NotAllowedError`. Seconds come from `rec.elapsed`. Nothing on screen belongs to the recorder itself.

Q7: Through the URL query. The query feeds the `center` prop of `<MapView>` through `placeFrom(url.search)`.

Q8: `view?.locate()` is called on the map element reference. A refusal comes back through `onError` on `<MapView>`. Pins are passed as an array of positions, and `onPin(index)` maps the index back to `spots[index]`.

## Ranking
1. JR — Every action is an explicit method or property on one object (`takePhoto`, `start`/`stop`, `locate`, `active`), and there is one camera element. Readiness, refusal and release are all visible in the code.
2. DU — It is a familiar pattern of component plus element reference plus callbacks, and unmounting to release the camera is explicit. However, the photo arriving through `onChange` rather than from `capture()`, and the `NotAllowedError` checks repeated in every file, add friction.
3. KJ — It is explicit and close to DU. But `<device.recorder active={recording}>` is an element whose screen presence is unclear, and the `device.` namespace on tags (including `device.map.pin`) is unusual.
4. WZ — The compound parts (`root`/`area`/`error`/`trigger`) hide readiness, the "Recenter" behavior and when the error shows. The module-level `cityMap` handle shared across pages, combined with `center={spots[0].at}`, makes it unclear whether the search move survives.
5. ZK — It mixes an object (`cam`) with tag namespaces that take `of={cam}`, triggers that hide their behavior, and a tag namespace taken from a local instance variable (`map.pin`). Of the five, it is the hardest to trace.

## Confusions
- ZK: `<map.pin at={spot.at} … />` uses `map`, a local variable (`const map = mapview(...)`), as a tag namespace. The same file uses `<mapview.trigger of={map}>` from the module. JR does the same thing with `<map.pin …/>`.
- ZK/JR: `<camera el={cam} />`. A lowercase tag named after an imported function looks like an unknown HTML element.
- KJ: `<device.recorder active={recording} … />`. I can't tell whether this element shows anything on screen.
- ZK: `<camera.error of={cam}>` and `<camera.trigger of={cam} …>`. The code doesn't show when the error shows or what the trigger does before the camera is ready. WZ's `<map.trigger>Recenter on me</map.trigger>` and `<mapview.trigger of={map}>Recenter on me</mapview.trigger>` give no hint of what pressing them does.
- WZ: `cityMap.moveTo(spot.at); await navigate('/map');` next to `<map.root handle={cityMap} center={spots[0].at} …>`. It is unclear which center wins.
- WZ: `<recorder.root handle={rec}>` and `<recorder.label /> s`. It is unclear whether `root` renders a wrapper and what `label` contains.
- All designs: scanning never states a format except KJ's `scan={['qr']}`, so ZK's `cam.scan(...)` and the boolean `scan` in WZ and DU may report non-QR barcodes too.

Tools used: none