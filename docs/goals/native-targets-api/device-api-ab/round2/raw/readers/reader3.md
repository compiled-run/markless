## Design JR
Q1: The camera view is replaced by "Camera access is off." and an "Open Settings" button, because `@if (cam.denied)` swaps them in. The "Take photo" and "Flip camera" buttons stay on screen. "Take photo" stays disabled, assuming `cam.ready` never becomes true.

Q2: Nothing happens. The button has `disabled={!cam.ready}`, so it cannot be pressed until the camera is ready.

Q3: One element, `<camera el={cam} />`. The buttons are ordinary buttons that read and write the `cam` object.

Q4: It registers a callback with `cam.scan((text) => ...)` in the component body. Repeats are ignored by comparing with the last code: `if (text !== code) code = text;`.

Q5: The camera is released when `cam.active = false` runs, which is right after `await cam.takePhoto()` resolves in the shutter handler. The "Close" button turns it back on with `cam.active = true`. The `<camera>` element stays in the page the whole time, under the panel.

Q6: A plain button calls `rec.start()` or `rec.stop()`, depending on `rec.recording`. The recorder has no element on screen. The UI is the button, the seconds counter (`rec.seconds`), the denied message (`rec.denied`) and the `<audio>` element for `rec.clip`.

Q7: The search page calls `navigate('/map?lat=…&lng=…')`. The map page reads `url.search` through `placeFrom` and uses that place as the initial `center` of `mapview(...)`, falling back to the first spot.

Q8: It calls `map.locate()`. The name suggests it centres the map on the user's position, but the code does not show that. If location is refused, `map.denied` shows "Location access is off."

## Design WZ
Q1: Presumably the contents of `<camera.error>`: "Camera access is off." and "Open Settings". The code does not show whether `<camera.area>` hides itself, or whether `<camera.trigger>` is disabled or hidden.

Q2: The code does not show this. `<camera.trigger>` handles the press internally, so whether it is disabled before the camera is ready is unknown.

Q3: Several elements working together: `camera.root`, `camera.area`, `camera.error` and `camera.trigger`. Settings such as `facing` live on the root.

Q4: The `scan` prop on the root turns scanning on, and the `onCode` callback delivers each code. Repeats are ignored with `if (text !== code)`.

Q5: `active={photo === null}` means the camera is released when `onCapture` sets `photo`. "Close" sets `photo = null`, which makes `active` true again and restarts the camera.

Q6: `<recorder.trigger>` presumably toggles start and stop. Its label switches between "Record" and "Stop", but the toggling is not visible in the code. `<recorder.label />` presumably renders the seconds. Whether `<recorder.root>` renders anything itself is not shown.

Q7: The search page calls `cityMap.moveTo(spot.at)` on a handle shared at module level, then `navigate('/map')`. The map page binds the same handle. The code does not settle whether the root's `center={spots[0].at}` overrides that move when the page mounts.

Q8: Presumably `<map.trigger>` recentres on the user's location, but only its label says so. The code does not show what it does.

## Design ZK
Q1: The `@if (!cam.denied)` hides the view. `<camera.error of={cam}>` presumably shows its children: the message and "Open Settings". "Flip camera" still shows, and so does the trigger, possibly in some disabled state that is not shown.

Q2: The code does not show this. `<camera.trigger>` handles readiness internally, if it does at all.

Q3: Mixed. One view element, `<camera el={cam}>`, plus separate `camera.error` and `camera.trigger` parts linked to it with `of={cam}`.

Q4: Same as JR: `cam.scan(callback)`, with repeats skipped by `text !== code`.

Q5: `cam.active = false` runs in `onPhoto`, when the trigger delivers the photo. "Close" sets `cam.active = true`.

Q6: `<recorder.trigger of={rec}>` presumably toggles start and stop, though the code does not show it. `<recorder.label of={rec} />` presumably shows the seconds. Denial uses `@if (rec.denied)`, not an error part. Whether the trigger or label render as anything special is not shown.

Q7: Same as JR: the search page navigates with lat/lng in the query string, and the map page reads it into the initial `center`.

Q8: `<mapview.trigger of={map}>` presumably recentres on the user, but the code does not show what it does. Denial shows through `map.denied`.

## Design KJ
Q1: `onDenied` sets `denied`, which removes `<device.camera>` and shows "Camera access is off." with "Open Settings". "Take photo" stays disabled, because `ready` is false, and "Flip camera" remains.

Q2: Nothing happens. The button is disabled until `onReady` sets `ready`, and there is also an `if (cam)` guard.

Q3: One element, `<device.camera>`, driven through props, callbacks and an `element()` reference.

Q4: The prop `scan={['qr']}` turns scanning on, and the `onScan` callback delivers each code. Repeats are skipped by `text !== code`.

Q5: Once `photo` is set, the `@else if (photo)` branch removes `<device.camera>` from the page, and per the comment, leaving the page releases the camera. "Close" sets `photo = null`, which puts the camera back and starts it again. It also resets `ready = false`. The "Take photo" button is hidden while the panel shows.

Q6: The `active={recording}` prop on `<device.recorder>` starts and stops recording, and a plain button toggles `recording`. `<device.recorder>` is an element in the markup, but the code does not show whether it renders anything visible.

Q7: Same as JR: query string, then `placeFrom` sets the initial `center` state.

Q8: It awaits `device.location.current()` and assigns the result to `center`, which the map is bound to. A `NotAllowedError` sets `denied`. This is the only design where the full behaviour is visible.

## Design DU
Q1: `onError` with `NotAllowedError` sets `refused`, which replaces `<Camera>` with the message and "Open Settings". The buttons remain, and "Take photo" stays disabled.

Q2: Nothing happens. The button is disabled until `onReady`. Even if it were pressed, `camera?.capture()` with no element would do nothing.

Q3: One element, the `<Camera>` component.

Q4: The `scan` flag plus the `onCode` callback, with repeats skipped by `text !== code`.

Q5: Same mechanism as KJ. `onChange` sets `photo`, the `@else if (photo)` branch removes `<Camera>`, and the camera is released. "Close" clears `photo`, the camera mounts again and restarts.

Q6: A plain button calls `rec.start()` or `rec.stop()` on a `recorder()` object. A rejected start with `NotAllowedError` sets `refused`. The recorder has no element on screen. The UI shows `rec.elapsed` and `rec.clip`.

Q7: Same as JR: the query string sets the initial `center` prop of `<MapView>`.

Q8: It calls `view?.locate()` on the map element. The name suggests it centres the map on the user, but the code does not show that. Errors arrive through `onError`.

## Ranking
1. JR — Short and consistent: one object per device carries state (`ready`, `denied`, `active`, `recording`) and actions, and every behaviour is in plain buttons you can read. Only `locate()` is opaque.

2. KJ — The most explicit: every state and transition is visible, and "Recenter on me" is fully spelled out. The cost is heavy boilerplate (`ready` and `denied` in every file) and a `<device.recorder>` element whose on-screen role is unclear.

3. DU — Explicit and familiar component style. But a captured photo arrives as `onChange` after `capture()`, which is indirect, and pins are matched by array index (`spots[index]`), which is fragile.

4. ZK — Mixes two models: object fields (`cam.denied`, `cam.active`) and parts linked with `of={...}`. It is also inconsistent about using them: `camera.error` sits beside a manual `@if (!cam.denied)`, and the recorder has no error part. Trigger behaviour is hidden.

5. WZ — The key behaviours are hidden inside parts: what the trigger does, readiness, what "Recenter on me" does. The map handle is shared at module level, and it is unclear whether it fights with the `center` prop.

## Confusions
Where tags come from: in JR and ZK, `<camera el={cam} />` and `<mapview el={map}>` use lowercase tags that match the imported functions `camera` and `mapview`. It is unclear whether these are the imports or built-in elements. Also, `<map.pin at={spot.at} … />` takes its tag from the local variable `map` (the `mapview(...)` instance), not from an import.

ZK has two mechanisms for the same thing: `@if (!cam.denied) { <camera el={cam} /> }` sits right beside `<camera.error of={cam}>`. The task 6 import style is also inconsistent: the tag is `<mapview.trigger of={map}>`, but the pin is `<map.pin>`.

KJ: `<device.recorder active={recording} … />` is an element with no visible role. I can't tell whether it renders anything. Its `onChange={(next) => (clip = next)}` also does not say what "change" means.

WZ: `<recorder.label /> s` gives no sign that the label renders the elapsed seconds. `<map.trigger>Recenter on me</map.trigger>` only implies recentring through its text. `cityMap.moveTo(spot.at); await navigate('/map');` and `<map.root handle={cityMap} center={spots[0].at}>` look like they conflict, and the code does not say which wins.

DU: `onChange={(next) => (photo = next)}` on `<Camera>` is how the shutter result arrives, which is not obvious from `camera?.capture()`.

Tools used: none