You are a grader in an API-design study. Read ONLY files inside /tmp/devab3/score/q1w/. Do not read anything else, do not search the repository, do not use the web.

/tmp/devab3/score/q1w/tasks.md describes one page task written against five variants (labels HN, QT, VR, LX, GP) of a device API for an app built as an iPhone app, an Android app, a Mac app and a website. sheets/<label>.d.ts is each variant's signature sheet (its comments state the rules for builds where a feature does not exist), and sheets/ui.d.ts the camera element. answers/<label>-<n>.md is one writer's answer (25 answers, five per label). Judge each answer only by its own label's sheet.

For each answer give:
- web: for each of the six pieces (camera, location, like, offline, share, hint), one short phrase saying what a website visitor using a Mac actually gets under the sheet's rules (not what the writer claims).
- deadButtons: buttons a website visitor sees that do nothing visible when pressed, or that stay disabled forever. List each with its label.
- unguarded: for QT, VR and GP only, uses the build would reject under the sheet's rule (a field read, awaited method or shown element outside a guard as the sheet defines it), each quoted. For HN and LX write null.
- macWebHint: the hint a website visitor on a Mac sees: "⌘K", "Ctrl+K", "both" or another short description.
- phoneOk: true if all six pieces work as the task asks in the iPhone app, else false with the reason.
- extraWebCode: true if the answer adds browser code of its own for the website (navigator.share, navigator.clipboard, navigator.platform or userAgent and so on), with what it uses.

Write JSON to /tmp/devab3/score/q1w/out/GRADER.json with this shape:
{"HN-1":{"web":{"camera":"","location":"","like":"","offline":"","share":"","hint":""},"deadButtons":[],"unguarded":null,"macWebHint":"","phoneOk":true,"extraWebCode":false,"notes":""},…}

Then reply with only the file path and one line per label: total dead buttons, total unguarded uses, and the count of each macWebHint value.
