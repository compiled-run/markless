I found eight parity findings. Five need a fix; the other three are lower-priority nits or things to check. Tasks 1, 3, 4 and 7 have no parity problems: messages, guards, time format and handling match across WZ, JR, ZK and DU. I did not search the repo, so findings 3 and 5 depend on Markless rules I could not confirm.

## Findings that need a fix

**1. DU, task 5: no message when microphone access is refused.**
- WZ shows "Microphone access is off." (`recorder.error`), and so do JR and ZK (`@if (rec.denied)`). DU shows nothing.
- `void rec.start()` also silently drops the refusal, even though the DU sheet says a refusal is an Error named `'NotAllowedError'`.
- **Fix:** add `let refused = state(false)`, call `rec.start().catch((error) => (refused = error.name === 'NotAllowedError'))`, and render `@if (refused) { <p>Microphone access is off.</p> }`. Alternatively, remove the message from all four, since the task doesn't ask for it. Making DU match is the fairer choice, because the extra lines are a real cost of that design.

**2. WZ, task 8: shows "Heading: °" before the first compass reading.**
- `compass.label` is empty until the first reading, so the text reads "Heading: °". JR, ZK and DU show "Finding heading…" instead.
- WZ has no compass handle, so it cannot match exactly in script.
- **Fix, either:**
  - WZ hides or replaces the line using the root's ready attribute in CSS. The sheet only implies the compass root sets `ui-ready` ("its family's other states"), so this depends on that reading.
  - Or, simpler and neutral: remove the "Finding heading…" placeholder from JR, ZK and DU (render nothing until the heading is non-null), because the task doesn't ask for it. Either way, the placeholder should not exist in only three designs.

**3. DU, task 8: `const online = isOnline()` and `const north = heading()` look like one-time snapshots.**
- In a body that runs once, a `const` holding a primitive reads as frozen. JR and ZK keep an object and read `.online` / `.heading`, which looks live.
- If Markless doesn't make these bindings live, DU is incorrect. If it does, readers may still misjudge DU.
- **Fix:** call the functions inline (`@if (!isOnline())`), or confirm these bindings are live and use the same form DU uses elsewhere.

**4. ZK, task 2: the header's shutter button is missing until the camera exists.**
- ZK wraps it in `@if (cam) { <camera.trigger …> }`, so there is no button while `named('main')` is null. Header renders before Body, so this can be visible at first.
- JR always shows a button (`disabled={!cam?.ready}`), and so do WZ and DU.
- **Fix:** add `@else { <button disabled>Take photo</button> }` to ZK. The extra lines are a real cost of `of: Camera` requiring a non-null camera. The other option is to make JR hide its button too, but that worsens JR's behaviour.

**5. DU, task 2: correctness risk in passing the `element()` handle as a prop.**
- Page creates `element<CameraElement>()` and passes it to Body as `camera: CameraElement | undefined`, and Body binds it with `el={camera}`.
- The type says Body receives the element's current value, which is `undefined` when the page first renders, not the handle. If so, the bind never reaches Page's handle and the header shutter does nothing.
- **Fix:** confirm that Markless allows binding a handle passed through props and type it as a handle. Otherwise, have Body own the handle and pass a `capture` callback up, or have Body report readiness and capture through callbacks.

## Lower priority

**6. WZ and ZK, tasks 1–4: callback parameters typed by hand when the sheet would infer them.**
- Examples are `onCapture={(next: Photo) => …}` and `onCode={(text: string) => …}`. JR's `cam.scan((text) => …)` and DU's `onChange={(next) => …}` leave them inferred.
- In ZK task 2, Header imports `type Photo` only for this annotation.
- **Fix:** drop the annotations in WZ and ZK so they don't look wordier than they are.

**7. JR and ZK, task 2: the shared store takes three lines where one would do.**
- `shared(() => { const box = state<…>({ last: null }); return box; })` could be `shared(() => state<{ last: Photo | null }>({ last: null }))`, if Markless allows `state()` outside a binding.
- **Fix:** simplify in both designs if that is legal. The two match each other, but this makes them look longer than WZ and DU.

**8. Task 4, all designs: "covers the camera" is met differently.**
- WZ, JR and ZK show a `class="review"` panel after the camera and rely on CSS that isn't included to cover it.
- DU replaces the camera with the panel, so it literally covers it.
- This isn't a gap in care, but a reader might credit DU with doing more. **Fix:** add one shared line of overlay CSS to WZ, JR and ZK, or note that styling is out of scope.

## Tasks with no parity problems

- **Task 1:** all four match: "Camera access is off.", an Open Settings button, a disabled-until-ready shutter, a flip button, and the last photo below.
- **Task 3:** all four use the same refusal text without Open Settings and the same `text !== code` repeat check.
- **Task 4:** apart from finding 8, all four have one accurate comment about what the code relies on. DU even resets `ready` when the panel closes.
- **Task 6:** apart from the shared absence of Open Settings, which is consistent, the content matches: the same denial text, card, Close button, link and search page. WZ uses `moveTo` on a module-level map handle; JR, ZK and DU use a `?lat&lng` query. Both are correct for their sheets.
- **Task 7:** the m:ss format matches: WZ and ZK use the label part, and JR and DU use the same `clock()` helper. JR and DU have identical range inputs.

No solution uses a capability its sheet does not declare. The non-device imports (`navigate`, `PageProps`, `computed`) are used the same way in every design.