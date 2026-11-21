# Device API reader test, round 3: what reads most clearly

## Summary

**Q1, a feature missing on the website.** Readers predicted what a website visitor gets best when the code says "only in the iPhone and Android apps" outright (`platform.ios || platform.android`): 10 of 10 points for each of 3 readers. With nothing in the code, they did worst (3.7 of 10): each of 3 readers expected a working webcam, location and share in the browser. Writers in that silent design shipped 2 dead buttons per page; the others shipped none.

**Q2, spelling of `platform`.** With no docs, 8 of 8 writers guessed `platform === 'ios'`, and 10 of 12 readers ranked it the clearest. 8 of 8 writers and 10 of 12 readers read `platform.macos` in a website build as false: it names the build, not the visitor's computer. None of the 20 read it as "the browser is on a Mac".

**Q3, system screens.** Readers answered every question right in every version, so the versions differ only in how readers ranked them and what they flagged. `cameraApp.open()` was ranked clearest by 13 of 15 readers. Round 2's `camera.takePhoto()` beside `cam.takePhoto()` was ranked last by 12 of 15.

**Q4, names that look like other names.** No reader misread any name. 8 of 8 readers said `sharesheet` reads clearer next to `shared`. 8 of 8 paused on `location` because it looks like the browser's `window.location`.

### Q1: what a website visitor gets when a feature does not exist there

| How the code handles the website | Reader score, cold (3 readers each) | Reader rank (1 = clearest, 15 readers) | Dead buttons per writer page (5 writers) | Mac website visitor gets the right hint (writers) | Lines (writers) |
| --- | --- | --- | --- | --- | --- |
| Says nothing; the build removes features silently | 3.7 of 10 | 5.0, last for 15 of 15 | 2 (Take photo stuck disabled, Share does nothing) | 5 of 5 | 60 |
| `@if (camera.supported)` per feature | 6.7 of 10 | 2.5 | 0 | 5 of 5 | 86 |
| `@if (platform.ios \|\| platform.android)` | 10 of 10 | 1.1, first for 14 of 15 | 0 | 4 of 5, only by reading the browser themselves | 88 |
| Features throw on the website; `@catch` shows a fallback | 7.0 of 10 | 4.0 | 0 | 5 of 5 | 133 |
| `supported` per feature, plus `platform.macos` for the ⌘/Ctrl hint | 6.7 of 10 | 2.5 | 0 | 2 of 5 (2 show Ctrl+K, 1 shows both keys) | 122 |

How to read it:

- **Reader score:** ten questions about one page, answered cold from the code alone: what a website visitor on a Mac sees for six pieces, what an iPhone user sees, whether any button does nothing, and which lines exist only in some builds. The key is in `q1/answer-key.md`. Two scorers agreed on 165 of 165 marks.
- **Dead buttons:** two graders agreed exactly.
- **Right hint:** a website visitor on a Mac sees ⌘K.

### Q2: how `platform` is spelled

| Spelling | Blind writers who guessed it (8) | Reader rank (12) | Readers sure the website build is not the Mac (cold, 3 each) | Reader confidence (of 5) |
| --- | --- | --- | --- | --- |
| `platform === 'ios'` (added: the blind writers' guess) | 8 | 1.25, first for 10 | 3 of 3 | 4.0 |
| `platform.ios`, `platform.macos` | 0 | 2.4 | 3 of 3 | 3.0 |
| `platform.iOS`, `platform.macOS` | 0 | 3.0 | 1 of 3 (2 "cannot tell") | 2.3 |
| `platform.os === 'ios'` | 0 (named as an alternative by 5) | 3.3, last for 7 | 3 of 3 | 3.7 |

What `platform.macos` means in a website build opened in Safari on a Mac:

- **"False, this is the website build":** 8 of 8 blind writers and 10 of 12 readers.
- **"True, the browser is on a Mac":** 0 of 20.
- **"Can't tell":** 2 readers, both given the `platform.iOS` spelling.

### Q3: opening the phone's own screens

| Spelling of the phone's camera screen | Reader score, cold (3 each) | Reader rank (15) | Writers who mixed up the two cameras (5 each) | Pair readers flagged as easy to mix up |
| --- | --- | --- | --- | --- |
| `cameraApp.open()`, with `photoLibrary.open()`, `settings.open()`, `sharesheet.open()` | 6 of 6 | 1.1, first for 13 | 0 | `camera()` and `cameraApp` (3 of 3, "only the App suffix") |
| `systemCamera.open()`, same nouns | 6 of 6 | 1.9 | 0 | `camera()` and `systemCamera` (3 of 3) |
| `cameraScreen.open()`, same nouns | 6 of 6 | 2.9 | 0 | `camera()` and `cameraScreen` (3 of 3; "screen" could be the page's own preview) |
| `takePhoto()`, `choosePhoto()`, `openSettings()`, `openShareSheet()` | 6 of 6 | 4.2 | 0 | `takePhoto()` and `cam.takePhoto()` (3 of 3) |
| `camera.takePhoto()` beside `cam.takePhoto()` (round 2) | 6 of 6 | 4.8, last for 12 | 0 | `camera.takePhoto()` and `cam.takePhoto()` (3 of 3) |

Asked which name for the camera screen reads best, 13 of 15 readers said `cameraApp` and 2 said `systemCamera`. The 8 blind writers who first named the screen chose `systemCamera` 3 times, `cameraScreen` 3 times and `cameraApp` twice. Two scorers agreed on 155 of 155 marks.

### Q4: names that look like Markless or browser names

| Name | Readers who misread it (8) | Readers who paused on it (8) | What they paused over |
| --- | --- | --- | --- |
| `location` | 0 | 8 | the browser's `window.location`, the page URL |
| `settings` | 0 | 5 | an in-app settings page |
| `storage` (Markless) | 0 | 4 | `localStorage`: where is it kept? |
| `share` (4 readers had it) | 0 | 1, then 8 of 8 when shown both names | `shared` from `@markless/core` |
| `sharesheet` (4 readers had it) | 0 | 0 | none |
| `network`, `notifications` | 0 | 0 | readers likened them to `navigator.onLine` and the `Notification` API, which means the same thing |

All 8 readers scored 8 of 8 on what each name does and 5 of 5 on what each button does. Shown both versions, 8 of 8 said `sharesheet` reads clearer and that `share` is the one that could be taken for `shared`.

## Recommendations

**Q1: guard each device feature with a test that names the builds, and let the build reject an unguarded use.** The explicit build test was the only design every reader read right, and the one 14 of 15 ranked clearest. The silent design ships dead buttons and was misread by 3 of 3 readers. Two caveats change the shape:

- **`supported` reads as a run-time question about the browser.** Readers of the `supported` and error designs lost their points on the offline banner, Share and location. Their reasoning was "browsers do have a location API, so `supported` is probably true on the web". A test named for the build avoids that.
- **`platform` is the build, so it cannot carry ⌘ versus Ctrl for website visitors.** Across the two designs that used `platform.macos`, no writer of 10 reached Mac visitors on the website with `platform` alone. 6 read the browser's `navigator` themselves, 2 showed Ctrl+K to Mac visitors, and 2 showed both keys. The variant "B plus `platform` only where the UI differs" fails for exactly its own example. Keep a separate value that reads the visitor's system, such as `modifierKey`.

**Q2: `platform === 'ios'`, one value that names the build.** 8 of 8 blind writers guessed it and 10 of 12 readers ranked it first. Their reason, quoted: "it can't be both `'web'` and `'macos'`". Brand casing (`platform.iOS`) left 2 of 3 readers unable to say what it meant. `platform.os` was ranked last because "the web is not an operating system".

**Q3: `cameraApp.open()` beside `photoLibrary.open()`, `settings.open()` and `sharesheet.open()`.** First for 13 of 15 readers and named best by 13 of 15. Every reader still flagged `camera()` beside `cameraApp` as a near pair, though nobody misread it. Same-verb designs (`camera.takePhoto()`, bare `takePhoto()`) ranked last for 15 of 15 readers. Leave `photopicker` out: the one blind writer who used `photoPicker` used it to choose an existing photo, not to take one.

**Q4: keep `sharesheet`, and consider renaming `location`.** `sharesheet` was preferred 8 to 0. `location` made 8 of 8 readers pause and also hides the browser global of the same name inside the module. `geolocation`, used in Q1, drew no such remark. `settings` made 5 of 8 pause, but its usage cleared it up for each of them.

## What confused readers, quoted

- **Silent design, a reader predicting the website:** "You see a live camera preview once the browser has asked for camera permission". The website build has no camera.
- **`supported` design:** "If `geolocation.supported` is false on the web … If it is true (browsers do have a location API), they see 'Finding you…'" (no lean either way).
- **`platform` design, after seeing the other designs:** "`platform.macos` most likely means the Mac app build … so a Mac browser visitor sees 'Ctrl+K'. That looks like a real bug in VR."
- **Writer, `supported` plus `platform`:** "The website build cannot tell whether a visitor is on a Mac, so the website shows both keyboard shortcuts."
- **Q2, `platform.os`:** "`platform.os === 'web'` is a category error, because the web is not an operating system."
- **Q3, round 2's design:** "`cam.takePhoto()` and `camera.takePhoto()` … differ by three letters and do different things."
- **Q3, `cameraScreen`:** "'Screen' could mean the camera view on this page, which is the very thing it must be told apart from."
- **Q4:** "`location` looks like the browser's `window.location` … at first glance it could mean navigation, and only `.access` and `.position` show it is geolocation."

## Writer results not shown in the tables

- **Type checking:** 50 of 50 writer answers (Q1 and Q3) type-check clean against their sheets as `.d.ts` files with the repo's Markless-aware checker. A planted bad name was rejected.
- **Unguarded uses:** both graders found 7, all in one answer (Q1, `platform` design). That writer put the guard in the parent (`@if (…) { <CameraPanel /> }`) and used the camera without a guard inside the child. My sheet does not say whether a guard in a parent counts. A rule that rejects this would surprise writers; a rule that accepts it needs the build to follow guards across components. The owner should decide.
- **Website fallbacks writers added (not asked for):**
  - **`supported` designs:** 10 of 10 writers gave website visitors something in place of Share: a copy-link button, a plain link, or the browser's own share panel.
  - **`platform` design:** 3 of 5 used the browser's `navigator.share` and 2 showed a link.
  - **Error design:** 5 of 5 caught the error.

## Limits

- **One model family.** Every writer, reader and scorer was a fresh Opus subagent. They inherit the repo's `CLAUDE.md`, which I could not remove.
- **Small samples.**
  - **Q1 and Q3:** 3 cold readers per design and 5 writers per design.
  - **Q2:** 3 cold readers per spelling and 8 blind writers.
  - **Q4:** 4 readers per name.
  - **How large a gap is real:** a difference of one reader in three is within the spread between readers of the same design. The Q1 gaps between `supported`, errors, and `supported` plus `platform` (6.7, 7.0, 6.7) are within that spread. The gap from silent (3.7) to `platform` (10) is not: 3 of 3 against 3 of 3.
- **Rankings come after a cold read.** Readers ranked only after answering cold, and they saw the versions in one fixed order, so order effects are not controlled.
- **Nothing was built or run.** The sheets describe packages that do not exist. "What a visitor gets" is judged against each sheet's written rules.
- **I wrote the designs, the sheets and the answer keys.** Two choices shape Q1:
  - **`platform` means the build.** I made it mean the build because the `platform.ios || platform.android` guard is only sound that way. That is also why `platform.macos` gives Ctrl+K on the website.
  - **The non-`platform` designs got `modifierKey`.** Their hint used `modifierKey`, which reads the visitor's system.
- **Unsettled facts the brief assumes:**
  - **Where `base` comes from:** the brief names `<base.camera el={cam} />` as settled but not its import. I used `@markless/ui`.
  - **Mac app:** features are absent in the Mac app too, since I limited device features to the phone builds.
- **Scorer agreement:**
  - **Q1 readers:** the two scorers agreed on 165 of 165 marks.
  - **Q3:** 155 of 155.
  - **Q1 writers:** 99 of 100. The one disagreement was whether one answer's page works in the iPhone app. A third scorer said yes, which is the value used.
  - **Q4:** the scorers agreed on every score. Their confusion tallies differ by one remark, "`shared` read as sharing between users". A third scorer said it was not a confusion, so it is not counted.
  - **Q2 rankings:** I tallied these myself from the raw answers with `check/rankings.py`, because I left those files out of the scorers' folder.

## How it ran (changes from round 2)

- **Prompts were delivered as files.** Participants read their prompt from a scratch file instead of receiving it inline, to save my own output. The text was word for word the saved prompt. `check/extract.py` confirms, from each transcript, that the participant made exactly one read of its own file per turn (two for readers with a second turn) and no other tool call.
- **Readers answered cold first.** Each reader answered about one design, then in a second turn saw every design and ranked them. Their cold answers are the ones scored.
- **Concurrency went over the limit once.** At one point 9 agents ran at once, one more than the brief allows.
- **An agent map slip, caught and fixed.** Four Q1 reader rows had their agent IDs swapped. The prompt check caught it, and the follow-up messages had gone to the right agents.

## Files

All paths are relative to `round3/`.

- **Sheets, solutions and keys:** `q1/` … `q4/` hold `tasks.md` (Q1), `answer-key.md` (written before any reader ran), `sheets/`, `solutions/`, `prompts/` and `raw/`.
- **Raw answers:** under `raw/`. A `-2.md` file is a reader's second turn.
- **Scoring:**
  - `scores/`: the scorers' JSON.
  - `prompts/`: the scorer prompts.
  - `check/rankings.json`: the ranking tallies.
- **Scripts in `check/`:**
  - `make-q1-sheets.mjs`, `make-q3.mjs`, `make-prompts.mjs`: build the sheets, solutions and prompts.
  - `tc.mjs`: the type check.
  - `extract.py`, `map.tsv`, `followups.tsv`: transcript extraction and prompt checks.
  - `rankings.py`, `compare.py`: tallies and scorer comparison.
