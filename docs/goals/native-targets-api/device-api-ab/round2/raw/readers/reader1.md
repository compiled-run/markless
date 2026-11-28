## Design KJ
Q1: The `@else` branch drops `<device.camera>` and shows "Camera access is off." with an "Open Settings" button. The "Take photo" button stays on screen, disabled, and so does "Flip camera".
Q2: Nothing happens. The button is `disabled={!ready}` until `onReady` fires, and the handler also checks `if (cam)`.
Q3: One element, `<device.camera>`. Plain buttons outside it reach it through the `el={cam}` handle.
Q4: The camera gets the prop `scan={['qr']}` and reports each code through the `onScan(text)` callback. The handler ignores repeats by comparing `text` with the last stored `code`. The code does not show whether the device also filters out duplicates.
Q5: The camera is released when `photo` is set: the `@if` switches to the review branch, which removes `<device.camera>` from the page. The comment says removal releases the device. Pressing Close sets `photo = null`, which puts the camera back. `ready` is reset to false until `onReady` fires again.
Q6: The Record/Stop button toggles `recording`, which drives the `active` prop on `<device.recorder>`. `onTick` updates the seconds and `onChange` delivers the clip. The code does not show whether `<device.recorder>` draws anything; it looks like an element with nothing visible.
Q7: The search page navigates to `/map?lat=…&lng=…`. MapPage reads the query with `placeFrom(url.search)` once, when it is created, and uses it as the starting `center`.
Q8: It awaits `device.location.current()` and assigns the result to `center`, which the map is bound to. If the error is a `NotAllowedError`, it sets `denied`.

## Design DU
Q1: When `onError` reports `NotAllowedError`, `refused` becomes true and the page shows "Camera access is off." with "Open Settings". The disabled shutter and the flip button stay. Other errors leave `refused` false, so nothing is shown for them.
Q2: Nothing happens. The button is disabled until `onReady`, and `camera?.capture()` is optional-chained. The photo itself arrives later through `onChange`.
Q3: One `<Camera>` element plus an element handle.
Q4: A boolean `scan` prop plus an `onCode(text)` callback. The format is not stated, so QR is presumably the default. The handler ignores repeats by comparing with the last code.
Q5: Same as KJ. When `onChange` sets `photo`, the `@if` removes `<Camera>`, and the comment says that releases the camera. Close sets `photo = null`, which puts it back.
Q6: `rec.start()` and `rec.stop()` are called from a plain button. There is no recorder element on screen. `rec.recording`, `rec.elapsed` and `rec.clip` are read directly in the markup. Refusal comes from the rejected `start()` promise.
Q7: Through the URL query. `placeFrom(url.search)` is passed as `center` to `<MapView>` when the page loads.
Q8: It calls `view?.locate()` on the map handle. Presumably that recenters on the user, but the code does not show it. A refusal arrives through `MapView`'s `onError`.

## Design WZ
Q1: Presumably the content of `<camera.error>`, which is "Camera access is off." plus "Open Settings". The code does not show which errors trigger it, or whether `camera.area` and `camera.trigger` hide when it shows. The flip button is always present.
Q2: The code does not show this. `<camera.trigger>` presumably ignores presses or is disabled until the camera is ready, but nothing visible says so.
Q3: Several parts working together: `camera.root`, `camera.area` (the picture), `camera.error` and `camera.trigger`. The root also wraps unrelated content, such as the flip button and the `<img>`.
Q4: A `scan` prop on the root plus an `onCode` callback. The handler ignores repeats by comparing with the last code.
Q5: `active={photo === null}` on the root. When `onCapture` sets `photo`, `active` becomes false and the camera is released. Close sets `photo = null`, so `active` becomes true and the camera restarts. Whether the panel actually covers `camera.area`, which stays in the page, is not shown and is left to styling.
Q6: `<recorder.trigger>` presumably toggles start and stop; only its label suggests that. `<recorder.label />` presumably shows the elapsed seconds. `<recorder.error>` shows the refusal. The trigger is the only on-screen recorder control, and the code does not show whether `recorder.root` draws anything.
Q7: A shared handle at module level, `cityMap = map.handle()` in places.ts. The search page calls `cityMap.moveTo(spot.at)` and then `navigate('/map')`. The code does not show whether the root's `center={spots[0].at}` overrides that move when the map mounts, or whether a move made while no map is mounted is kept.
Q8: The code does not show this. `<map.trigger>` presumably locates the user and recenters, and `<map.error>` shows a location refusal.

## Design ZK
Q1: `@if (!cam.denied)` removes the camera view, and `<camera.error of={cam}>` presumably shows its children: the message and "Open Settings". The trigger and the flip button stay.
Q2: The code does not show this. `<camera.trigger of={cam}>` presumably does nothing until the camera is ready.
Q3: A camera object created in the script with `camera({facing})`, plus several elements tied to it: the view `<camera el={cam}/>`, `camera.error` and `camera.trigger` (both linked through `of={cam}`).
Q4: `cam.scan(callback)` is called in the component body. The callback ignores repeats by comparing with the last code.
Q5: In the trigger's `onPhoto`, after the photo arrives, `cam.active = false` releases the camera. Close sets `cam.active = true`, which starts it again. The view element stays in the page the whole time.
Q6: `<recorder.trigger of={rec}>` presumably toggles start and stop. `<recorder.label of={rec}/>` presumably shows the seconds, and `rec.denied` drives the refusal message. The trigger is the recorder's on-screen control; there is no other recorder view.
Q7: Through the URL query. `mapview({center: placeFrom(url.search) ?? …})` is created once, when the page loads.
Q8: The code does not show this. `<mapview.trigger of={map}>` presumably recenters on the user, and `map.denied` shows the refusal.

## Design JR
Q1: When `cam.denied` is true, the page shows the message and "Open Settings" instead of the view. The shutter stays, disabled because `cam.ready` is false, and the flip button stays.
Q2: Nothing happens. The button is `disabled={!cam.ready}`.
Q3: One element, `<camera el={cam}/>`, bound to a camera object. The buttons are ordinary buttons that call methods on that object.
Q4: `cam.scan(callback)` in the component body. The callback ignores repeats by comparing with the last code.
Q5: After `await cam.takePhoto()` resolves, `cam.active = false` releases the camera. Close sets `cam.active = true`, which starts it again. The view stays in the page, so covering it is left to styling.
Q6: A plain button calls `rec.start()` and `rec.stop()`. There is no recorder element on screen. `rec.seconds`, `rec.denied` and `rec.clip` are read directly. `void rec.start()` hides failures, which presumably surface through `rec.denied`.
Q7: Through the URL query. The `mapview` object is created with the center from `placeFrom(url.search)` when the page loads.
Q8: It calls `map.locate()`, which presumably recenters on the user. `map.denied` shows a refusal.

## Ranking
1. JR — Every action is an explicit call on an object (`takePhoto`, `locate`, `active = false`) and every state is a readable field (`ready`, `denied`). Nothing is hidden inside a part element.
2. KJ — Explicit and fully controlled, with every state visible in the component. It costs more boilerplate, and `<device.recorder>` is an element that seems to draw nothing.
3. DU — Familiar component plus handle, and the recorder is a clean object. But `onChange` meaning "a photo was taken", pins passed as an array with an index callback, and boolean `refused` set through `onError` are less obvious.
4. ZK — The object model is clear, but trigger and error parts hide what they actually do (ready gating, locate). The same name is both a function and a tag, and `map.pin` hangs off a local variable.
5. WZ — Most behaviour is implicit inside parts (trigger, error, label). Unrelated content is nested inside `camera.root`. The map uses a singleton handle at module level, and the code does not settle whether it conflicts with the `center` prop.

## Confusions
KJ: In `<device.recorder active={recording} onTick=… />`, it is unclear whether this element draws anything on screen.

KJ, task 6: `denied = (error as Error).name === 'NotAllowedError';` resets `denied` to false on any other error.

DU: `onChange={(next) => (photo = next)}` on `<Camera>`. "Change" is a surprising name for "a photo was captured".

DU: `scan` with no value does not say which code formats are scanned.

DU: `onError={(error) => (refused = error.name === 'NotAllowedError')}` turns any other error into `refused = false`, which shows nothing.

WZ: In `<p><recorder.label /> s</p>`, I cannot tell what the label renders.

WZ: `<camera.trigger>Take photo</camera.trigger>` does not show whether it is disabled before the camera is ready.

WZ: `export const cityMap = map.handle();` is a singleton at module level, and it is unclear how `center={spots[0].at}` interacts with `cityMap.moveTo(...)` made before the map mounts.

WZ, task 4: The panel `@if (photo) {...}` sits inside `<camera.root>` while `<camera.area />` stays in the page.

ZK: In `<map.pin at={spot.at} ... />`, the tag comes from the local variable `const map = mapview(...)`, not from an import. The same pattern appears in JR.

ZK: `camera` is called as a function (`camera({ facing: 'back' })`) and also used as a tag (`<camera el={cam} />`).

ZK: `<mapview.trigger of={map}>Recenter on me</mapview.trigger>` does not say what the trigger does.

JR: `else void rec.start();` gives no visible sign of how a failure is handled.

Tools used: none