# Sub-test: one-off features (object design variants)

The planner asked why `capture()` lives on the camera object while one-off things are free functions. This sub-test compares three spellings of the object design for features with no running device. It is written and reported separately from the main tables.

## Variants (random labels)

| Label | Variant |
| --- | --- |
| AZ | 1, split rule: a feature that stays on is an object you make; a feature that just answers is a free function (`takePhoto()`, `currentPosition()`, `share()`, `haptic()`, `notify()`) |
| MM | 2, objects for all: every feature is an object (`cameraScreen().open()`, `location().current()`, `haptics().tap()`, `sharing().share()`, `notifications().schedule()`) |
| EC | 3, one import per feature, same verbs: `camera.takePhoto()` opens the system camera screen, `const cam = camera()` is the in-page camera and `cam.takePhoto()` captures from it; `location.current()` answers once and `location()` is the live one; `notifications.schedule()`; `share()` and `haptic()` stay plain |

## Tasks (same for every writer)

1. A button that opens the phone's own camera screen, then shows the photo taken.
2. Show the current location as text, read once: a loading state, and when access is refused a message with an "Open Settings" button and a "Try again" button.
3. A map that shows the person's live position as a pin that moves as they move.
4. A share button for the current article (title and url).
5. A like button that counts presses and gives a haptic tap on each press.
6. Schedule a local notification for an order one hour from now; tapping it opens that order's page (`/orders/42`).
7. A live in-page camera with a shutter button, plus a separate "Use system camera" button that opens the phone's own camera screen instead; show whichever photo was taken last.

Task 7 was added to the planner's six so that `camera.takePhoto()` (system screen) and `cam.takePhoto()` (in-page camera) appear in the same code; without it no task would test whether the two get confused.
