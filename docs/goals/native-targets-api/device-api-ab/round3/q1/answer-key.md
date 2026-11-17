# Q1 reading questions and answer key

Written before any reader ran. Readers get one variant's reference solution (`solutions/<label>.tsrx`) with no sheet,
plus one paragraph of context: the four builds, that `@markless/device` is a package of device features and that
`base.camera` shows a camera. The key follows each variant's sheet.

## Questions (message 1, one variant)

1. A visitor opens the website in a browser on a Mac laptop. For each piece, what do they see, and what happens when
   they use it? (a) camera and Take photo, (b) location, (c) Like, (d) offline banner if their connection drops,
   (e) Share, (f) the search hint.
2. Someone uses the iPhone app. Same six pieces.
3. Does any button do nothing when pressed? Which, and for whom?
4. Which lines exist or run only in some builds? Quote them and name the builds.
5. How sure are you of your answer to question 1 (1–5)? What would you need to know to be sure?

## Scoring

Ten points per reader: 1a–1f one each; 2a–2e together one (everything works on the iPhone); 2f one; 3 one; 4 one.
Question 5 is recorded, not scored. A point needs the substance below; wording does not matter. A hedge that names the
right answer as the more likely one counts; "cannot tell" does not.

## Key

### HN, silent

- 1a: no camera picture; the Take photo button is shown but stays disabled (or does nothing); no photo ever appears.
- 1b: "Finding you…" forever.
- 1c: the count goes up; no haptic tap.
- 1d: no banner, even offline.
- 1e: Share is shown; pressing it does nothing.
- 1f: "Press ⌘K to search".
- 2a–e: everything works (preview, photo, location, haptic, banner when offline, share panel).
- 2f: "Press ⌘K to search" (an iPhone is an Apple system).
- 3: yes, on the website: Share does nothing (Take photo never enables). Naming either on the website scores.
- 4: the device lines (camera, geolocation, network, haptics, sharesheet) are absent from the website, though nothing in
  the code marks them. Scores if the reader says the device-feature lines do not work or do not exist on the website;
  "no line is platform-specific" does not score.

### QT, `supported`

- 1a: "The camera works in the app."; no picture, no button.
- 1b: "Location works in the app."
- 1c: the count goes up; no haptic tap.
- 1d: no banner.
- 1e: no Share button.
- 1f: "Press ⌘K to search".
- 2a–e: everything works. 2f: "Press ⌘K to search".
- 3: no.
- 4: the blocks under `@if (network.supported && …)`, `@if (camera.supported)`, `@if (geolocation.supported)` and
  `@if (sharesheet.supported)` exist only in the phone builds; their `@else` messages only on the website and Mac app.
  Scores if the reader ties the `supported` blocks to the phone apps and the `@else` arms to the website.

### VR, `platform`

- 1a–1e: as QT.
- 1f: "Press Ctrl+K to search" (`platform.macos` is false in the website build).
- 2a–e: everything works. 2f: "Press Ctrl+K to search".
- 3: no.
- 4: the `platform.ios || platform.android` blocks exist only in the phone builds, their `@else` arms on the website and
  Mac app, and the hint differs in the Mac app. Scores if the reader ties the guarded blocks to the phone apps and the
  `@else` arms to the website.

### LX, errors

- 1a: "The camera works in the app." (making the camera fails and the `@catch` shows the message).
- 1b: "Location works in the app."
- 1c: the count goes up; no haptic tap (the error is swallowed).
- 1d: no banner.
- 1e: Share is shown; pressing it shows "Sharing works in the app."
- 1f: "Press ⌘K to search".
- 2a–e: everything works. 2f: "Press ⌘K to search".
- 3: no (Share answers with a note on the website).
- 4: no line is removed; the `@catch` arms and the `catch` blocks are what the website and Mac app run. Scores if the
  reader ties the `@catch`/`catch` paths to the website.

### GP, `supported` plus `platform`

- 1a–1e, 2a–e, 3, 4: as QT.
- 1f: "Press Ctrl+K to search". 2f: "Press Ctrl+K to search".
