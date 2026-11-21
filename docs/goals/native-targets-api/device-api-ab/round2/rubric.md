# Grading rubric, round 2

Graders score one design's five answers against that design's sheet and reference solutions. They see only the design's random label.

Per task, report the same counts as round 1:

- **offSheet**: distinct `@markless/device` names used that the sheet does not declare (exports, members, props, part names, options). List them.
- **misuse**: distinct wrong uses of declared names: wrong argument or prop types, a promise treated as a value, a result expected where the sheet says it arrives elsewhere, a part used outside its root without `for`, a field written that the sheet marks read-only. List them.
- **missing**: required behaviours absent or broken, by short name from the list below.
- **markless**: notes on general Markless or routing mistakes (not counted).

## Required behaviours

1. `live-picture`, `shutter`, `shutter-disabled-until-ready`, `flip`, `shows-photo`, `refused-message`, `open-settings`.
2. `header-shutter` (the shutter is in a header component away from the camera and takes a photo of that camera), `shows-photo`.
3. `live-picture`, `shutter`, `shows-code`, `ignores-repeats`.
4. `review-panel`, `camera-stops`, `camera-resumes`, `relies-comment`.
5. `one-button`, `label-switches`, `elapsed`, `playback`.
6. `pins`, `pin-card`, `recenter`, `search-page`, `returns-centred` (choosing a result returns to `/map` centred on it).
7. `play-pause-label`, `seek`, `time-text`.
8. `offline-banner`, `heading-live`.

## Bug-prone behaviours (answer yes or no per answer, from the code and the sheet's stated guarantees only)

- **B1 shutter-before-ready** (tasks 1–4): can a press fire a capture before the camera is ready? `yes` if any shutter in tasks 1–4 can call capture before ready and the sheet does not promise that capture waits.
- **B2 released-while-covered** (task 4): is the camera released while the review panel shows? `yes` only if the code does something the sheet says releases the camera.
- **B3 header-without-internals** (task 2): does the header take the photo without knowing camera internals? `yes` if the header uses only a handle, a name or a callback, and does not import or drive the camera's element, object methods or state by hand beyond one call.
- **B4 record-label-follows-state** (task 5): does the Record/Stop label follow the recorder's real state? `yes` if the label reads the recorder's own live state, `no` if it reads an app-kept flag that could drift (for example one that never resets when start fails) or is static.
- **B5 search-moves-map** (task 6): does choosing a search result really move the map? `yes` only if the sheet's guarantees plus ordinary navigation make the map open centred on the result. Facts to apply: Markless follows same-app links and `navigate()` in place, so module-level values and `shared()` survive them; `location.assign` or a reload starts the page fresh; component bodies run on the server, where `localStorage` is not available. Passing the place in the URL and reading it into the map's starting centre counts as `yes`. Say why in one line.

## Correction to B5, applied after the first grading

The B5 facts above left out how `storage()` from `@markless/core` works, and graders read "component bodies run on the server, where `localStorage` is not available" as covering it. That is wrong for `storage()`. Per `specs/framework/03-state-graph.md` ("Saved state"), `storage(key, fallback)` is string state backed by a cookie as well as `localStorage`: a write in the browser sets the cookie at once, and a server render reads the request's cookie, so a page loaded fresh after the write (including by `location.assign`) renders with the saved value. B5 was re-graded for all 25 answers by two fresh graders with this fact added (`prompts/grader-b5.md`, results in `raw/grades/b5-*.json`); those results replace the first graders' B5 values.
