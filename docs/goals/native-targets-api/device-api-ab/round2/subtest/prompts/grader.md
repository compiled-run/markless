# Sub-test grader prompt

One fresh grader got this prompt word for word. It read only `/tmp/devab2/sub/`: `tasks.md` (this sub-test's `tasks.md`), and per variant the sheet, reference solutions and five answers renamed `A1.md`–`A5.md`, plus the blind sheet and the six blind answers renamed `B1.md`–`B6.md`. The result is `raw/grades/sub-grader.json`.

---

You are a grader in an API-design study. Read ONLY files inside /tmp/devab2/sub/. Do not read anything else, do not search the repository, do not use the web.

/tmp/devab2/sub/tasks.md lists seven tasks and three variants (AZ, MM, EC) of one device API. Folders AZ/, MM/ and EC/ each hold that variant's sheet.d.ts, reference solutions (solutions/task1.md … task7.md, one correct answer, not the only one) and five answers (answers/A1.md … A5.md) written from that sheet alone. Folder blind/ holds a sheet showing only the camera part and six answers (answers/B1.md … B6.md) written by people who saw only that part and had to guess the rest.

Part 1, the 15 variant answers. For each answer and each task 1–7, give:
- offSheet: `@markless/device` names used that the answer's own sheet does not declare (list them).
- misuse: wrong uses of declared names (wrong arguments, a promise used as a value, the wrong call for the job, and so on), with a short note each.
- missing: required behaviour absent or broken, by short name (for task 2: loading, refused-message, open-settings, try-again; task 3: live-pin; task 6: one-hour, opens-order; task 7: shutter, system-camera, shows-last).
Then, for task 7 only: quote the call the answer uses to take a photo from the in-page camera and the call it uses to open the phone's own camera screen, and say whether the answer swapped or confused the two (true/false, with the reason).

Part 2, the 6 blind answers. For each answer and each of tasks 1, 2, 3, 4, 5, 6 and the "Use system camera" part of task 7, classify the shape the writer guessed:
- "split": a one-off feature is a plain function you import and call (takePhoto(), currentPosition(), share(), haptic(), scheduleNotification()…), and a feature that stays on is an object you make in the component (location watch, camera).
- "objects": the feature is an object you make first even when it only answers once (for example systemCamera().capture(), location().current(), haptics().tap()).
- "one-import": one import that is both callable and carries one-off methods on itself (for example camera.takePhoto(), location.current() next to location()).
- "other": none of these; describe it.
For task 3, say whether the live position is an object you make (and its name) or something else. Quote the guessed name each time.

Write JSON to /tmp/devab2/sub/out/sub-grader.json with this shape:
{"variants":{"AZ":{"A1":{"tasks":{"1":{"offSheet":[],"misuse":[],"missing":[]},…,"7":{…}},"task7":{"inPage":"","system":"","confused":false,"why":""}},…},"MM":{…},"EC":{…}},"blind":{"B1":{"1":{"shape":"split","name":""},"2":{…},"3":{…},"4":{…},"5":{…},"6":{…},"7":{…}},…}}

Then reply with only the file path, one line per variant with total offSheet, misuse and missing counts and how many task 7 answers confused the two cameras, and one line per blind answer listing its seven shapes.
