## Design KJ
Q1: The camera element is removed. In its place they see "Camera access is off." and an "Open Settings" button. The "Take photo" button stays on screen and stays disabled. "Flip camera" also stays.
Q2: Nothing happens. The button is `disabled={!ready}` until `onReady` fires, and the handler also checks `if (cam)`.
Q3: One element, `<device.camera>`. The buttons beside it are plain buttons that reach it through the `cam` element reference.
Q4: The `scan={['qr']}` prop turns scanning on, and the `onScan` callback receives each code. Repeats are skipped by `if (text !== code)`. That only blocks the same code twice in a row; an earlier code seen again after a different one is reported again.
Q5: The camera is released when `photo` is set. The `@if` then switches to the review branch and `<device.camera>` leaves the markup. The comment says leaving the markup releases the device; the code itself does not show this. "Close" sets `photo = null` and `ready = false`. That puts the camera back in the markup, which starts it again, and the shutter stays disabled until `onReady` fires.
Q6: A `recording` state is bound to `<device.recorder active={recording}>`. The Record/Stop button flips it. `onTick` updates the seconds and `onChange` delivers the clip. The code does not show whether `<device.recorder>` draws anything; it looks like an element with no visible output.
Q7: The search page navigates to `/map?lat=…&lng=…`. `MapPage` reads `url.search` through `placeFrom` once, as the starting `center`. This works only if the map page is created fresh on each navigation.
Q8: It awaits `device.location.current()` and assigns the result to `center`, which the map's `center` prop picks up. A `NotAllowedError` sets `denied`. A later successful recenter never clears `denied`.

## Design ZK
Q1: `@if (!cam.denied)` removes the camera view. `<camera.error of={cam}>` presumably shows its children ("Camera access is off." plus "Open Settings") only on an error, but the code does not show that. The trigger and "Flip camera" stay on screen.
Q2: The code does not show this. `<camera.trigger>` handles it internally, probably by being disabled until ready, but that is a guess.
Q3: Several pieces work together: the `camera()` object, the view `<camera el={cam}>`, `<camera.error of={cam}>` and `<camera.trigger of={cam}>`, all linked by the object.
Q4: `cam.scan(callback)` is called in the component body. Which code formats it scans (QR only or any) is not stated. Repeats are skipped by `text !== code`, consecutive only.
Q5: In the trigger's `onPhoto`, `cam.active = false` releases the camera. "Close" sets `cam.active = true` to restart it. The view element stays mounted; the panel covers it only by layout, which the code does not show.
Q6: `<recorder.trigger of={rec}>` presumably toggles start and stop; the code does not show that. `<recorder.label of={rec}>` presumably shows the elapsed seconds. There is no recorder element; state is read from `rec.recording`, `rec.denied` and `rec.clip`.
Q7: Same as KJ. The URL query becomes the starting center through `placeFrom` in `mapview({ center: … })`.
Q8: The code does not show this. `<mapview.trigger of={map}>` is a button whose action is hidden. Its label suggests it moves the map to the user's location, and a denial shows through `map.denied`.

## Design DU
Q1: `onError` sets `refused` when the error is a `NotAllowedError`. The camera is then replaced by "Camera access is off." and "Open Settings". Any other error sets `refused` back to false.
Q2: Nothing happens. The button is `disabled={!ready}`, and `camera?.capture()` is null-safe. The photo arrives through `onChange`, not as a return value.
Q3: One element, `<Camera>`.
Q4: The boolean `scan` prop plus the `onCode` callback. The code type is not specified, so it may not be QR only. Repeats are skipped by `text !== code`.
Q5: Same as KJ. When `photo` is set, the `@if` removes `<Camera>`, and the comment says the camera runs only while it is in the page. "Close" clears `photo` and resets `ready`, which remounts and restarts it.
Q6: `rec.start()` and `rec.stop()` are called directly in the button's click handler. A refusal is caught from the `start()` promise. There is no recorder element on screen; seconds come from `rec.elapsed`.
Q7: Through the URL query. The center is computed inline in the `center` prop from `placeFrom(url.search)`.
Q8: `view?.locate()`, a method on the map element. It presumably centers the map on the user, with refusal reported through `onError`. Pins are passed as an array and `onPin` receives an index.

## Design WZ
Q1: `<camera.error>` presumably shows "Camera access is off." and "Open Settings" when access is refused. The code does not show what `<camera.area />` or `<camera.trigger>` look like after a refusal.
Q2: The code does not show this; `<camera.trigger>` handles it internally.
Q3: Several parts nested together: `camera.root`, `camera.area` (the view), `camera.error` and `camera.trigger`.
Q4: The `scan` prop on the root plus `onCode`. Repeats are skipped by `text !== code`.
Q5: `active={photo === null}` on the root. Taking a photo sets `photo`, which makes `active` false and releases the camera. "Close" sets `photo = null`, which makes `active` true and restarts it.
Q6: `<recorder.trigger>` inside `<recorder.root handle={rec}>` presumably toggles recording, and `<recorder.label />` presumably shows the seconds. `recorder.root` may render a wrapper element; the code does not show whether it does.
Q7: A module-level shared handle. The search page calls `cityMap.moveTo(spot.at)` and then `navigate('/map')`. The URL does not carry the location. It is unclear whether `center={spots[0].at}` on `<map.root>` overrides that move when the map page mounts.
Q8: The code does not show this. `<map.trigger>` presumably recenters on the user, and `<map.error>` shows a refusal.

## Design JR
Q1: `cam.denied` swaps the camera view for "Camera access is off." and "Open Settings". The shutter and "Flip camera" stay on screen.
Q2: Nothing happens; the button is `disabled={!cam.ready}`.
Q3: One view element, `<camera el={cam} />`, driven by the object that `camera()` returns.
Q4: `cam.scan(callback)`, with repeats skipped by `text !== code`, consecutive only.
Q5: After `await cam.takePhoto()` resolves, `cam.active = false` releases the camera. "Close" sets `cam.active = true` to restart it. The view stays mounted.
Q6: The button calls `rec.start()` or `rec.stop()`. The `start()` promise is dropped with `void`, and a refusal shows through `rec.denied`. There is no recorder element; seconds come from `rec.seconds`.
Q7: Through the URL query, used as the starting center in `mapview({ center: placeFrom(url.search) ?? … })`.
Q8: `map.locate()` presumably moves the map to the user, and `map.denied` shows a refusal.

## Ranking
1. JR — One object per device with plain methods and fields (`takePhoto`, `active`, `locate`, `denied`). Every behavior is visible at the call site and needs no extra state.
2. DU — Explicit and single-element, with methods called directly. Maintainers have to repeat the `error.name === 'NotAllowedError'` checks, and pins addressed by index are fragile.
3. KJ — Explicit, but it needs many manual flags. `<device.recorder>` is an element that seems to show nothing yet controls recording, and stopping the camera depends on an unwritten rule that a removed element releases its device.
4. ZK — The object model is clear, but `*.trigger` and `*.error` hide what they actually do. In particular, what `<mapview.trigger>` does can't be read from the code.
5. WZ — The most behavior is hidden inside compound parts. The map uses a shared module-level handle mutated from another page, which conflicts with `center={spots[0].at}` and makes the map location disappear from the URL.

## Confusions
- KJ: `<device.recorder active={recording} … />` seems to render nothing yet controls recording. It is unclear what is on screen.
- ZK and JR: `const cam = camera(...)` followed by `<camera el={cam} />` uses the same name for a factory function and a tag. In `<map.pin at={spot.at} … />`, `map` is a local instance, while `camera.error` and `camera.trigger` hang off the imported factory. The naming is inconsistent.
- ZK: `<mapview.trigger of={map}>Recenter on me</mapview.trigger>`: nothing says the trigger means "locate"; only the label suggests it.
- ZK: `<recorder.label of={rec} /> s`: a "label" that is actually the elapsed-seconds counter.
- WZ: `<map.root handle={cityMap} center={spots[0].at} zoom={13}>` alongside `cityMap.moveTo(spot.at)` from another page. It is unclear which wins.
- WZ: having both `recorder.handle()` and `<recorder.root handle={rec}>` is unclear, since the handle could seemingly be the root.
- DU: `onError={(error) => (refused = error.name === 'NotAllowedError')}` resets `refused` to false on other errors, which may hide the message.
- DU: `onPin={(index) => (chosen = spots[index])}` relies on the order of the array.

Tools used: none