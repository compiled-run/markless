You are a grader in an API-naming study. Read ONLY files inside /tmp/nsname/score/writers/. Do not read anything else, do not search the repository, do not use the web.

Each writer got the same four tasks (tasks.md) and a type sheet that differs only in the name of the namespace for the platform's own UI (sheets/<candidate>.d.ts; "pair" is the ios/android pair, written side by side). In every version the namespace means the same thing: on a phone it is the platform's own sheet, camera preview and PDF view; in the website build it is the browser's own equivalent (a dialog, a camera preview through the browser's camera access, the browser's PDF viewer). `drawer` from `@markless/ui` is drawn by the author and looks the same everywhere. raw/<candidate>-<n>.md is one writer's answer.

For each writer, per task (orders, whatsnew, scan, invoice), record:

- used: the element that shows the sheet, panel, preview or PDF: "X" (the candidate namespace), "drawer", "html" (a hand-built element such as `<video>`, `<iframe>`, `<embed>`, `<dialog>`), or "other" (quote it). For a task with more than one branch, list every one, e.g. ["X","drawer"].
- wrongKind (true/false): orders not using X for the phone builds; whatsnew using X; scan or invoice using html instead of X for the phone builds.
- webGuard (true/false): the writer hides X from the website, or gives the website a separate element in place of X (for example `@if (platform !== 'web') { <X.sheet> } @else { <drawer.root> }`, or a `<video>` / `<iframe>` only for `platform === 'web'`), because they believe X does not exist or does not work there. Quote the line.
- styledFrame (true/false): the writer tries to set class, style or colour on X itself.
- inventedMembers: members or props of X used in code that the sheet does not declare (list them).
- webSays: from the writer's answer B for that file, what the website visitor sees, classified as "browser-own" (the browser's own equivalent through X), "author-fallback" (something the writer built for the website), "nothing", "unsure", or "other" (quote).

Also record wrongImport (true/false): X imported from a package other than the one the sheet declares, with the quote.

Write JSON to /tmp/nsname/score/writers/out/GRADER.json with this shape:
{"system-1":{"tasks":{"orders":{"used":["X"],"wrongKind":false,"webGuard":false,"styledFrame":false,"inventedMembers":[],"webSays":"browser-own","quotes":[]},"whatsnew":{…},"scan":{…},"invoice":{…}},"wrongImport":false,"notes":""},…}

Put a verbatim quote in "quotes" for every true flag and every webSays other than "browser-own". Then reply with only the file path and, per candidate, the count of wrongKind, webGuard, styledFrame and invented members.
