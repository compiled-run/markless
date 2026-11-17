## Design KJ
Q1: The `onDenied` callback sets `denied`, so the camera view is replaced by "Camera access is off." and an "Open Settings" button. The "Take photo" button (disabled) and "Flip camera" stay on screen.
Q2: Nothing happens. The button is `disabled={!ready}` until `onReady` fires, and the handler also checks `if (cam)`.
Q3: One element, `<device.camera>`. The photo is taken through its element handle (`cam.takePhoto()`), and the other buttons are ordinary buttons.
Q4: The `scan={['qr']}` prop turns detection on and the `onScan(text)` callback reports each code. Repeats are ignored with `if (text !== code)`, which only skips a code equal to the last one; a sequence A, B, A updates again.
Q5: As soon as `photo` is set, the `@if` switches to the review panel and `<device.camera>` leaves the markup. The comment says leaving the markup releases the camera. "Close" sets `photo = null`, which puts the camera back, and resets `ready = false`.
Q6: The `active={recording}` prop on `<device.recorder>` starts and stops it, and the button toggles `recording`. The code does not show whether `<device.recorder>` draws anything itself; it looks like an element that renders nothing. The seconds and audio player are ordinary markup.
Q7: The search page navigates to `/map?lat=…&lng=…`. `MapPage` reads `url.search` through `placeFrom` to set the starting `center`.
Q8: It awaits `device.location.current()` and assigns the result to `center`, which the map's `center` prop follows. A `NotAllowedError` sets `denied` and shows "Location access is off."; any other error sets `denied` back to false.

## Design JR
Q1: When `cam.denied` is true, `<camera>` is replaced by "Camera access is off." and "Open Settings". "Take photo" (disabled) and "Flip camera" stay.
Q2: Nothing happens, because the button is `disabled={!cam.ready}`.
Q3: One element, `<camera el={cam}>`, bound to the object that `camera({ facing: 'back' })` returns. Facing, ready and photo-taking all live on that object.
Q4: `cam.scan(callback)` is registered in the component body. QR is never named, so the code does not show which code types are detected. Repeats are ignored with `text !== code`, which only skips a code equal to the last one.
Q5: After `takePhoto()` resolves, the handler sets `cam.active = false`. "Close" sets `cam.active = true`. The `<camera>` element stays in the markup the whole time, and so does the "Take photo" button. Whether that button is disabled while the camera is off is not shown.
Q6: `rec.start()` and `rec.stop()` are called from an ordinary button. No recorder element is on screen. The reactive fields `rec.recording`, `rec.seconds`, `rec.denied` and `rec.clip` drive the markup.
Q7: Through URL parameters, as in KJ. `mapview({ center: placeFrom(url.search) ?? … })` sets the starting center.
Q8: It calls `map.locate()`. The code does not show what that does internally; presumably it moves the map to the person's position. A refusal shows up as `map.denied`.

## Design DU
Q1: `onError` sets `refused` when the error is a `NotAllowedError`, and the screen shows the message plus "Open Settings". Any other error sets `refused` to false and shows nothing.
Q2: Nothing happens. The button is disabled until `onReady`, and `camera?.capture()` guards against a missing handle.
Q3: One component, `<Camera>`. `capture()` is called through its element handle, and the photo arrives through `onChange`, not as a return value.
Q4: The boolean `scan` prop plus the `onCode` callback. QR is not named. Repeats are ignored with `text !== code`, only against the last code.
Q5: When `onChange` sets `photo`, the `@if` removes `<Camera>`; the comment says the camera runs only while it is in the page. "Close" sets `photo = null`, which mounts it again, and resets `ready`.
Q6: `rec.start()` and `rec.stop()` from a button; a refusal is caught from the `start()` promise and stored in `refused`. No recorder element is on screen, and the elapsed time comes from `rec.elapsed`.
Q7: Through URL parameters. The map's `center` prop is `placeFrom(url.search) ?? spots[0].at`.
Q8: It calls `view?.locate()` on the map's element handle. Internals are not shown, and errors arrive through `onError`.

## Design WZ
Q1: Presumably the children of `<camera.error>`: the message and "Open Settings". The code does not show when that part appears (only on refusal, or on any error), nor whether `<camera.area>` hides. The trigger and "Flip camera" stay.
Q2: Not shown. `<camera.trigger>` presumably handles readiness itself, but nothing in the code says so.
Q3: Several parts working together: `camera.root` holds the settings and callbacks, `camera.area` is the picture, and `camera.error` and `camera.trigger` sit beside it, linked by nesting.
Q4: The root's `scan` and `onCode` props. QR is not named. Repeats are ignored with `text !== code`.
Q5: `active={photo === null}`. When `onCapture` sets `photo`, the camera is released; "Close" sets `photo = null`, which turns it back on. The trigger stays visible during review.
Q6: `<recorder.trigger>` presumably toggles start and stop, which is not shown. `<recorder.label />` presumably shows the seconds. The trigger and label are on screen. `<recorder.root>` with `handle={rec}` is a wrapper, and whether it renders anything is not shown.
Q7: Through shared module state. `places.ts` exports `cityMap = map.handle()`; the search page calls `cityMap.moveTo(spot.at)` and then `navigate('/map')`. The code does not show whether `MapPage`'s `center={spots[0].at}` overrides that move when the map mounts. The location is not in the URL, so a reload or a shared link loses it.
Q8: Not shown. `<map.trigger>` is presumably "locate me", but the tag does not say what it triggers. A refusal shows `<map.error>`.

## Design ZK
Q1: `@if (!cam.denied)` removes the camera, and `<camera.error of={cam}>` presumably shows the message and "Open Settings". When that part appears is not stated. The trigger and "Flip camera" stay.
Q2: Not shown. `<camera.trigger of={cam}>` presumably waits for readiness.
Q3: One camera element, `<camera el={cam}>`, plus separate parts (`camera.error`, `camera.trigger`) tied to it by `of={cam}`.
Q4: `cam.scan(callback)`. QR is not named. Repeats are ignored with `text !== code`.
Q5: In the trigger's `onPhoto`, the code sets `cam.active = false`; "Close" sets `cam.active = true`. The element stays mounted.
Q6: `<recorder.trigger of={rec}>` presumably toggles recording, which is not shown. `<recorder.label of={rec}>` presumably shows the seconds. Those two parts are on screen; there is no recorder element of its own.
Q7: Through URL parameters. `mapview({ center: placeFrom(url.search) ?? … })`.
Q8: Not shown. `<mapview.trigger of={map}>` presumably locates and recenters, and a refusal shows through `map.denied`.

## Ranking
1. JR — Plain objects with explicitly named calls (`takePhoto`, `start`, `stop`, `locate`, `active`) and reactive fields. Every behavior is visible at the call site.
2. KJ — Explicit state and callbacks, and stopping by unmounting is easy to follow. The cost is a lot of state to wire by hand, plus `<device.recorder>`, which appears to show nothing.
3. DU — A familiar component style, but it mixes paradigms: the camera is a component while the recorder is an object. The photo arrives in `onChange` rather than from `capture()`, and pins map back to spots by array index.
4. ZK — The `of={cam}` links are explicit, but triggers hide what they do. The refusal is handled twice (`!cam.denied` and `<camera.error>`), and `mapview.trigger` does not say "locate".
5. WZ — Most behavior is implicit in generic parts (trigger, error, label). The map position travels through a module-level handle that may conflict with `center={spots[0].at}`, and it is lost on reload.

## Confusions
KJ: `<device.recorder active={recording} … />` sits in the markup but appears to show nothing. It is unclear whether it renders anything.

JR and ZK: `const cam = camera(...)` and then `<camera el={cam} />`. The same identifier is a function and a tag, and the lowercase tag reads like an HTML element.

JR and ZK: `<map.pin …>`, where `map` is a local variable (`const map = mapview(...)`), yet it supplies a tag. It is unclear where that tag comes from.

ZK: `<mapview.trigger of={map}>Recenter on me</mapview.trigger>`. A trigger for what? Nothing says it locates.

WZ: `<map.trigger>Recenter on me</map.trigger>` and `<camera.trigger>Take photo</camera.trigger>`. The same generic name means different actions in different places.

WZ: `<recorder.label /> s`. It is not obvious that the label shows seconds.

WZ: `export const cityMap = map.handle();` used with `<map.root handle={cityMap} center={spots[0].at}>`. It is unclear which wins, `moveTo` or `center`.

DU and KJ: `onError={(error) => (refused = error.name === 'NotAllowedError')}` and the matching KJ `catch`. Errors other than a refusal quietly leave nothing on screen.

Tools used: none