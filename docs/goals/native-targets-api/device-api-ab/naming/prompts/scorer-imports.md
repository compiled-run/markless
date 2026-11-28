You are a scorer in an API-naming study. Read ONLY files inside /tmp/nsname/score/imports/. Do not read anything else, do not search the repository, do not use the web.

Each reader saw one import line and five usage lines, then answered four questions (prompts/<name>-<package>.md shows what each saw; <package> is "own" for `@markless/<name>`, "ui" for `@markless/ui`, "device" for `@markless/device`). raw/<name>-<package>-<framing>-<n>.md is one reader's answer.

What the package is meant to hold: elements that show the platform's own UI (the phone's own sheet, camera preview, PDF view, tab bar, menu; in the website build the browser's own equivalent). `@markless/ui` otherwise holds headless families that the author draws and that look the same everywhere; `@markless/device` otherwise holds device calls such as `camera()` and `sharesheet.open()`.

For each reader record:
- contains: "platform-ui" if answer 1 says the package holds elements for the platform's own UI; "headless-ui" if it says author-drawn or framework-drawn components that look the same everywhere; "device-apis" if it says device calls or hardware access, with no mention of the platform's own UI elements; "mixed" if it says both platform UI elements and device calls or headless parts; "other" (quote).
- expects: up to five short items from answer 2, verbatim or near-verbatim.
- surprised: up to five short items from answer 3.
- whoDraws: "platform" (the OS, platform or browser), "author", "framework", or "unsure", from answer 4.
- misfit: true if the reader says the import line and the usage do not fit together (for example "odd that a UI component comes from a device package"), with the quote.

Write JSON to /tmp/nsname/score/imports/out/SCORER.json with this shape:
{"system-own-web-1":{"contains":"platform-ui","expects":[],"surprised":[],"whoDraws":"platform","misfit":false,"quote":""},…}

Then reply with only the file path and, per name and package, the counts of each "contains" value and of misfit.
