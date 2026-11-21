# Device API test, round 2: the eight tasks

Every writer in every design gets these eight tasks word for word.

1. Camera screen: a live picture, a shutter button that is disabled until the camera is ready, a button to flip between front and back camera, the last photo shown below, and when camera access is refused a message with an "Open Settings" button.
2. The same camera screen, but the shutter button lives in a header component that is not near the camera in the component tree (the page renders the header and, further down, a body section that contains the camera).
3. One camera does two things at once: it shows the live picture with a shutter button, and it reports QR codes it sees. Show the last code seen, and ignore repeats of the same code.
4. A camera screen where, after a photo is taken, a "Review photo" panel covers the camera. The camera must stop while the panel is shown and resume after the panel is closed. Say in a code comment what your code relies on for that.
5. Voice memo: one button whose label switches between "Record" and "Stop", the elapsed seconds while recording, and playback of the clip after.
6. A map with pins from a list of places; tapping a pin shows a card for that place; a "Recenter on me" button; and a separate search page (its own route, `/search`) that, when the person chooses a result, returns to the map page (`/map`) centred on that result.
7. A video with custom controls: a play/pause button whose label is right for the current state, a seek bar, and the current time as text.
8. An "Offline" banner that appears and disappears as connectivity changes, plus the compass heading shown live.

## Labels

Drawn at random (Python `random`, two uppercase letters, excluding round 1's labels) before any writer ran. No writer, grader or reader saw this key.

| Label | Design |
| --- | --- |
| WZ | P, parts with visible state, under a root that owns the device |
| JR | O, component-owned device objects, shown with `<camera el={cam} />` (planner update; the first five writers used `<cam.area />` and are kept as superseded) |
| ZK | H, hybrid: the objects plus optional parts that take them, shown the same way as O |
| DU | E, one element plus functions (round 1's view-element design, extended to the new devices) |
| KJ | S, state-driven elements under one `device` namespace (added by the planner after the first writers ran) |
