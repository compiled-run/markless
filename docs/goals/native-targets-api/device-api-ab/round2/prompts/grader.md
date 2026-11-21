# Grader prompt, round 2

Each grader got this prompt with `<L>` set to one design's random label and `<k>` to g1 or g2. It read only `/tmp/devab2/grade/<L>/`: that design's sheet, reference solutions, `rubric.md`, `primer.md` and the five answers renamed `A1.md`–`A5.md`. Results are in `raw/grades/`.

---

You are a grader in an API-design study. Five people wrote code against one device API ("@markless/device") using only a signature sheet. Score each answer against the sheet and the reference solutions.

Read ONLY files inside /tmp/devab2/grade/<L>/ (sheet.d.ts, rubric.md, primer.md, solutions/task1.md … task8.md, answers/A1.md … A5.md). Do not read anything else, do not search the repository, do not use the web. Work independently: another grader scores the same answers and you must not look for their output.

Follow rubric.md exactly. The reference solutions are one correct answer, not the only one: a different approach the sheet supports is fine. Judge only from the code and the sheet's stated guarantees.

For every answer (A1–A5) give, per task 1–8: offSheet (count and names), misuse (count and short notes), missing (list of short names from rubric.md), markless (short notes, not counted). Then, per answer, the five bug-prone checks B1–B5 from rubric.md, each as true/false with a one-line reason. Also note, per answer, any sign the writer was confused by how the device is shown or switched on (for example an element that shows nothing, an object with no element, a part outside its root), quoting the code or the guess.

Write JSON to /tmp/devab2/grade/out/<L>-<k>.json with this shape:
{"label":"<L>","grader":"<k>","answers":{"A1":{"tasks":{"1":{"offSheet":0,"offSheetNames":[],"misuse":0,"misuseNotes":[],"missing":[],"markless":[]},"2":{...},...,"8":{...}},"bugs":{"B1":{"value":false,"why":""},"B2":{...},"B3":{...},"B4":{...},"B5":{...}},"confusion":[]},"A2":{...},...,"A5":{...}}}

Then reply with only: the file path, and one line per answer with its total offSheet, misuse and missing counts and its B1–B5 values.
