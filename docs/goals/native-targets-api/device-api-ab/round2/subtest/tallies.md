# Sub-test tallies

I classified the reader and spelling answers myself from `raw/readers/` and `raw/spelling/`; no second scorer. Writer answers and blind guesses were scored by one fresh grader (`raw/grades/sub-grader.json`, prompt in `prompts/grader.md`).

## Readers (6)

X/Y order is in `prompts/reader-orders.txt`; below, "namespace" is the `device.camera` spelling and "bare tag" is `<camera el={cam} />`.

| Reader | Rank (1 → 3) | Task 7 calls named right (of 3 variants) | Flagged `cam.takePhoto()` vs `camera.takePhoto()` | Bare tag comes from | Prefers |
| --- | --- | --- | --- | --- | --- |
| 1 | AZ, MM, EC | 3 | yes | the import (but reads like HTML) | namespace |
| 2 | AZ, MM, EC | 3 | yes | the import (but reads like HTML) | namespace |
| 3 | AZ, EC, MM | 3 | yes | the import (but reads like HTML) | namespace |
| 4 | AZ, MM, EC | 3 | yes | the import | namespace |
| 5 | AZ, MM, EC | 3 | yes | the import (but reads like HTML) | namespace |
| 6 | AZ, MM, EC | 3 | yes | the import (but reads like HTML) | bare tag |

Rules inferred (question B), 6 of 6 each:

- AZ: "things that stay on or show something are objects; one-off actions are plain functions".
- MM: "every feature is an object you make first".
- EC: "the feature name is callable for the live one and carries one-off methods; features with one action stay plain".

Other notes readers raised:

- **MM, setup lines:** 6 of 6 called them ceremony (`const app = settings(); app.open()`). 5 of 6 asked whether `location()` made for a one-time read also starts live tracking.
- **AZ, naming:** 4 of 6 said `notify({ at })` sounds immediate rather than scheduled. 3 of 6 found `watchLocation()` and `currentPosition()` unrelated names.
- **Shadowed browser globals:** 2 of 6 noted names that shadow one: `screen` in MM and `location` in EC.

## Spelling-only blind writers (6)

| Writer | Expects to work | Bare tag comes from | Prefers |
| --- | --- | --- | --- |
| 1 | namespace more plausible; unsure of both | either the import or an unknown HTML element | namespace |
| 2 | namespace only | an unknown HTML element (the author means the import) | namespace |
| 3 | namespace; unsure of bare tag | the import, if the compiler matches it | namespace |
| 4 | namespace; bare tag probably not | the import, if the compiler matches it | namespace |
| 5 | namespace; unsure of bare tag | the import, if the compiler matches it | namespace |
| 6 | namespace; bare tag not | an unknown HTML element | namespace |

All 6 raised two more points:

- One name serves as both a function and a tag (`camera()` and `<camera>`).
- What `el={cam}` means is unclear, because `el` suggests an `element()` handle.

## Blind writers (6), shape of each guess

| Task | split rule | objects for all | one import per feature |
| --- | --- | --- | --- |
| 1 system camera | 5 (`takePhoto()`) | 1 (`systemCamera().capture()`) | 0 |
| 2 location once | 6 (`currentPosition()` 4, `getPosition()` 2) | 0 | 0 |
| 3 live location | 6, an object you make (`location()` 2, `geolocation()` 2, `position()` 2) | 0 | 0 |
| 4 share | 6 (`share()`) | 0 | 0 |
| 5 haptic | 6 (`haptic()`) | 0 | 0 |
| 6 notification | 6 (`scheduleNotification()`) | 0 | 0 |
| 7 "Use system camera" | 5 (`takePhoto()`) | 1 (`systemCamera().capture()`) | 0 |
