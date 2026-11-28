## Design JR
Q1: The camera view is replaced by "Camera access is off." and an "Open Settings" button. The "Take photo" and "Flip camera" buttons stay on screen. "Take photo" is presumably disabled, since the code never shows `cam.ready` becoming true after a refusal.
Q2: They can't press it. The button has `disabled={!cam.ready}`. The code doesn't show what `takePhoto()` would do if it were called early.
Q3: One element, `<camera el={cam} />`, bound to the `cam` object. The shutter and flip controls are ordinary buttons that read and write fields on `cam`.
Q4: The component body registers a callback once with `cam.scan((text) => …)`. Repeats are skipped by `if (text !== code)` before `code` is assigned. The code doesn't show how often `scan` fires.
Q5: Released right after `await cam.takePhoto()` resolves, in the same click handler, by `cam.active = false`. The Close button sets `cam.active = true` to start it again. The `<camera>` element stays in the page under the panel.
Q6: One button calls `rec.start()` or `rec.stop()`, depending on `rec.recording`. The recorder has no element of its own. Only the button, the `rec.seconds` text, the denied message and the `<audio>` player appear.
Q7: The search page calls `navigate('/map?lat=…&lng=…')`. The map page reads `url.search` through `placeFrom` and passes the result as the initial `center` to `mapview(...)`.
Q8: It calls `map.locate()`, presumably to center the map on the user's position. If location access is refused, `map.denied` shows "Location access is off." The code doesn't show whether it animates, zooms, or keeps following the user.

## Design DU
Q1: Once `onError` fires with `NotAllowedError`, `refused` becomes true, and they see "Camera access is off." with "Open Settings". The code doesn't show what appears for other errors (`refused` stays false, so `<Camera>` stays).
Q2: The button stays disabled until `onReady` sets `ready`. Even if the element were missing, `camera?.capture()` would do nothing. The photo doesn't come back from the click: it arrives later through `onChange`.
Q3: One component, `<Camera>`, with an element handle (`el={camera}`) used to call `capture()`.
Q4: The `scan` prop on `<Camera>` turns scanning on and `onCode` reports each code. Repeats are skipped by `if (text !== code)`.
Q5: When `onChange` delivers a photo, `photo` is set and the `@else if (photo)` branch removes `<Camera>` from the page. The comment says the camera only runs while `<Camera>` is in the page, so that is the release. Close sets `photo = null` (and `ready = false`), `<Camera>` comes back, and the camera starts again.
Q6: One button calls `rec.start()` or `rec.stop()`. A rejected `start()` is caught and sets `refused` if the error is `NotAllowedError`. The recorder has nothing on screen of its own. The elapsed time comes from `rec.elapsed`.
Q7: Same as JR: a URL query that `placeFrom` turns into the initial `center` prop.
Q8: It calls `view?.locate()` on the map's element handle, presumably to recenter on the user. A refusal comes back through the map's `onError` and shows "Location access is off."

## Design KJ
Q1: `onDenied` sets `denied`, and they see "Camera access is off." with "Open Settings". The "Take photo" button stays visible but disabled.
Q2: The button stays disabled until `onReady` sets `ready`. The handler also checks `if (cam)` before calling `cam.takePhoto()`.
Q3: One element, `<device.camera>`, with a handle used for `takePhoto()`.
Q4: The `scan={['qr']}` prop turns QR scanning on and `onScan` reports each code. Repeats are skipped by `if (text !== code)`.
Q5: When `takePhoto()` resolves and `photo` is set, the `@else if (photo)` branch removes `<device.camera>`. The comment says that removal releases the camera. Close sets `photo = null`, the element comes back, and the camera starts again.
Q6: The button flips the `recording` state, and that state drives the `active={recording}` prop on `<device.recorder>`. There is a recorder element in the markup, but the code doesn't show whether it draws anything. The visible parts are the button, the seconds (from `onTick`), the denied message and the player (the clip arrives through `onChange`).
Q7: Same URL query approach. The map page keeps `center` in state, starting from `placeFrom(url.search)`, and passes it to `<device.map>`.
Q8: It runs `center = await device.location.current()`, so the map follows the new `center` state. If the error is `NotAllowedError`, `denied` is set and "Location access is off." shows.

## Design WZ
Q1: Presumably the `<camera.error>` content: "Camera access is off." and "Open Settings". The code doesn't show when `camera.error` renders, whether `camera.area` hides, or what `camera.trigger` shows after a refusal.
Q2: The code doesn't show it. Any readiness handling would be inside `<camera.trigger>`.
Q3: Several parts working together inside `<camera.root>`: `camera.area`, `camera.error` and `camera.trigger`.
Q4: The `scan` prop on the root turns scanning on and `onCode` reports each code. Repeats are skipped by `if (text !== code)`.
Q5: `active={photo === null}` is declared on the root. The camera is released when `onCapture` sets `photo`, and Close (`photo = null`) makes it active again.
Q6: `<recorder.trigger>` presumably starts and stops recording itself; no handler is shown. There are on-screen recorder parts: `recorder.root`, `recorder.trigger`, `recorder.label` (presumably the elapsed seconds) and `recorder.error`.
Q7: Both pages share one map handle, `cityMap = map.handle()`, created at module level in `places.ts`. The search page calls `cityMap.moveTo(spot.at)` and then `navigate('/map')`. The code doesn't show whether a `moveTo` made before the map is mounted survives, or whether `center={spots[0].at}` on `map.root` overrides it on mount.
Q8: The code doesn't show it. `<map.trigger>Recenter on me</map.trigger>` presumably locates the user and recenters, and refusal content sits in `<map.error>`.

## Design ZK
Q1: `@if (!cam.denied)` hides the view, and `<camera.error of={cam}>` presumably shows "Camera access is off." and "Open Settings". The code doesn't show exactly when `camera.error` renders. "Take photo" and "Flip camera" stay on screen.
Q2: The code doesn't show it. Readiness is handled, if at all, inside `<camera.trigger of={cam}>`.
Q3: One view element, `<camera el={cam} />`, plus separate parts linked to it by `of={cam}`: `camera.error` and `camera.trigger`.
Q4: The component body registers a callback with `cam.scan(...)`. Repeats are skipped by `if (text !== code)`.
Q5: In the trigger's `onPhoto`, `cam.active = false` releases the camera right after the photo arrives. Close sets `cam.active = true`. The view element stays in the page.
Q6: `<recorder.trigger of={rec}>` presumably toggles start and stop; this is not shown. `<recorder.label of={rec} />` puts the elapsed time on screen, and `rec.denied` drives the message.
Q7: Same URL query approach as JR.
Q8: The code doesn't show it. `<mapview.trigger of={map}>` presumably calls locate. A refusal shows through `map.denied`.

## Ranking
1. JR — Every behavior is visible in plain code (`cam.ready`, `cam.active`, `rec.start()`, `map.locate()`) with one view element and ordinary buttons. There is very little state plumbing.
2. KJ — It is fully explicit, and the map with a stored `center` plus `device.location.current()` is very clear. It costs more state per screen, and `<device.recorder>` is an element whose screen presence is unclear.
3. DU — It is explicit, but the photo arrives through a callback named `onChange` rather than from `capture()`. Refusal means matching `error.name` strings, and pins are matched back to spots by array index.
4. ZK — It mixes an object (`cam`) with linked parts (`of={cam}`). Readiness handling and what the triggers do are hidden, and `camera.error` duplicates the `@if (!cam.denied)` check.
5. WZ — Most behavior is implicit inside the `.trigger`, `.error` and `.label` parts. A map handle shared across pages at module level, plus a fixed `center` prop, makes Task 6's data flow hard to follow.

## Confusions
JR and ZK: `<camera el={cam} />` uses a lowercase tag with the same name as the imported function `camera`. It isn't clear whether it is a built-in tag or the import.

JR and ZK: in `<map.pin at={spot.at} … />`, the tag comes from a local variable (`const map = mapview(...)`), not from an import.

ZK: in `<mapview.trigger of={map}>Recenter on me</mapview.trigger>`, the trigger tag comes from the factory name `mapview`, while the pin tag comes from the instance `map`. These are inconsistent.

KJ: `<device.recorder active={recording} … />` looks like an element that may show nothing on screen. `<device.map.pin>` is a tag nested two levels deep.

DU: in `onChange={(next) => (photo = next)}`, it is surprising that the photo comes through "change" rather than from `capture()`. `onPin={(index) => (chosen = spots[index])}` depends on the order of the `pins` array.

WZ: `<recorder.label /> s` does not say what the label contains. In `<map.root handle={cityMap} center={spots[0].at} …>`, it is unclear whether `center` or an earlier `cityMap.moveTo(...)` wins. `<camera.trigger>` and `<map.trigger>` are generic names, and the action they run isn't visible.

Tools used: none