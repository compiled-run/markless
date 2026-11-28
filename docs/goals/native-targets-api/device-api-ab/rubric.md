# Grading rubric (phase 2)

Graders score one answer against one signature sheet and that design's reference solutions. They see only the design's random label.

Per task, report:

- **offSheet**: the number of distinct names imported from or called on `@markless/device` (exports, members, props, events, part names, config keys) that the sheet does not declare. List them.
- **misuse**: the number of distinct wrong uses of names the sheet does declare: wrong argument or prop types, wrong return handling (for example treating a promise as a value, expecting a result the sheet says arrives elsewhere), a refusal detected in a way the sheet does not describe, a part used outside its root, a required config line missing (for a design whose sheet requires one). List them.
- **missing**: required behaviours absent or broken, from the list below. List them by short name.
- **deviceNames**: the number of distinct `@markless/device` names the answer uses for this task (types count only when used as values or components; type-only imports do not count).

General Markless mistakes (not about the device package) are not counted in these numbers; note them separately under `markless` if you see them.

## Required behaviours

1. `opens-camera-screen`: a button opens the phone's own camera screen. `shows-photo`: the photo taken is shown.
2. `live-preview`: a live camera preview in the page. `shutter`: a button takes a photo. `switch`: a button switches front/back. `shows-photo`: the last photo is shown below. `refused-message`: a message shows when camera access is refused.
3. `location-text`: the location is shown as text. `loading`: a loading state. `refused-message`: a message when access is refused. `open-settings`: an "Open Settings" button that opens the app's Settings. `try-again`: a "Try again" button that reads the location again.
4. `counts`: presses are counted and shown. `haptic`: a haptic tap on each press.
5. `offline-banner`: an "Offline" banner that appears and disappears as connectivity changes. `heading`: the compass heading shown and kept live.
6. `start`, `stop`: recording starts and stops. `elapsed`: elapsed seconds shown while recording. `playback`: the clip can be played back.
7. `schedules`: a local notification is scheduled for the order. `tap-opens-order`: tapping it opens that order's page.
8. `shares`: a share button shares the article's title and url.
