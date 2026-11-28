You are a grader in an API-design study. Read ONLY files inside /tmp/navab4/score/q3w/. Do not read anything else, do not search the repository, do not use the web.

/tmp/navab4/score/q3w/tasks.md is one page task written against eight variants (labels RQ, MZ, FJ, LT, WY, KC, HV, GN) of where two elements come from: a camera element and a PDF element. sheets/<label>.md is each variant's signature sheet, which is everything its writers saw. answers/<label>-<n>.md is one writer's answer (40 answers, five per label). Judge each answer only by its own label's sheet.

For each answer give:
- tags: the camera tag and the PDF tag exactly as written, and the import line(s) they come from (or "no import").
- tagRight: true if both tags and their imports match the sheet, else false with the reason.
- mistakes: every use that breaks the sheet, each quoted with the rule broken. Examples: a prop a part does not take (for example `onClick` or `class` on `base.button`, whose props are disabled, pressed, onChange and children only), a wrong part name, a missing required `value`, a wrong import, styling the inside of the camera or PDF element. Do not count the Markless template rules unless the answer clearly breaks them.
- tasks: true or false for each of the three tasks working as asked under the sheet (tabs with Camera first; preview, shutter that shows the last photo, flip with base.button; PDF page with "Page N of M", Previous and Next).
- website: true if the answer's "## Website" lines match the sheet (the browser's camera picture; the browser's PDF viewer), else false with a quote.
- confidence: the writer's N from "Confidence: N/5".

Write JSON to /tmp/navab4/score/q3w/out/GRADER.json with this shape:
{"RQ-1":{"tags":"","tagRight":true,"mistakes":[],"tasks":{"tabs":true,"camera":true,"pdf":true},"website":true,"confidence":3,"notes":""},…}

Then reply with only the file path and one line per label: answers with the right tags, total mistakes, and mean confidence.
