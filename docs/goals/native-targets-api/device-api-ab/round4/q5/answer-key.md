# Name-reading question (q5): what the key says (written before any reader ran)

Three versions of one page differ only in the namespace name: `system` (SY), `native` (NT) and `os` (OS),
each from `@markless/ui`, holding `camera`, `sheet` and `pdf`. The intended meaning, the same for all three, is (c):
whatever the platform the app runs on draws itself, the phone's own UI in the apps and the browser's on the website.
All three elements exist in the website build (the browser's camera picture, the browser's `<dialog>`, the browser's
PDF viewer). The system decides how the sheet looks; the author styles the drawer.

This phase is not scored for right and wrong: it reports the split of readings per name (question 2's letter,
question 3's yes/no/somewhat, question 1's exists-on-the-website answers, question 5's confidence) and the comparison
turn's ranking and per-name answers. These are tallied directly from the raw answers by `check/tally-q5.py`.
