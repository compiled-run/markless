You are a grader in an API-design study. Read ONLY files inside /tmp/navab4/score/q4w/. Do not read anything else, do not search the repository, do not use the web.

/tmp/navab4/score/q4w/tasks.md is one page task written against six variants (labels NT, PF, IA, SY, BC, BT) of where a system-drawn camera element and a system-drawn sheet element come from. sheets/<label>.md is each variant's signature sheet, which is everything its writers saw. answers/<label>-<n>.md is one writer's answer (30 answers, five per label). Judge each answer only by its own label's sheet.

For each answer give:
- tags: the camera tag and the sheet tag exactly as written, and the import line(s) they come from (or "no import").
- importRight: true if the tags are imported from the module the sheet puts them in (NT, SY: `@markless/ui`; PF: `platform` from `@markless/device`; IA: `ios`/`android`/`web` from `@markless/ui`; BC: `base` from `@markless/ui`; BT: no import), else false with the import quoted. Also false if `base` or `drawer` are imported from the wrong module.
- mistakes: every other use that breaks the sheet, each quoted with the rule broken. Examples: a prop a part does not take (`onClick` or `class` on `base.button`, `class` on the sheet element), a wrong part name, an IA element outside its matching `@if (platform.…)`.
- tasks: true or false for each of the four tasks working as asked under the sheet (camera with shutter, last photo and base.button flip; Filters sheet with heading, three choices, closes and shows the choice; Comments drawer from the drawer family with title, three comments and Close; the note only in the iPhone app).
- duplicateLines: the number of lines in the answer's markup that exist only because the same element is written once per platform (for IA: each extra copy of a camera tag, a sheet open tag, its close tag and any repeated sheet content; count the second and third copies only). Write 0 for other labels unless they repeat markup per platform.
- sheetContentCopies: how many times the sheet's content (heading plus choices) is written out in full (1 if it is in one shared component or written once).
- places: the writer's own "## Places" answers A and B as numbers, and whether each is right for their code (true/false).
- website: true if all four "## Website" lines match the sheet (browser camera picture; browser <dialog> at the bottom; the same drawer; note not shown), else false with a quote.
- confidence: the writer's N from "Confidence: N/5".

Write JSON to /tmp/navab4/score/q4w/out/GRADER.json with this shape:
{"NT-1":{"tags":"","importRight":true,"mistakes":[],"tasks":{"camera":true,"sheet":true,"drawer":true,"note":true},"duplicateLines":0,"sheetContentCopies":1,"places":{"A":1,"Aright":true,"B":1,"Bright":true},"website":true,"confidence":3,"notes":""},…}

Then reply with only the file path and one line per label: answers with importRight, total mistakes, total duplicateLines, and mean confidence.
