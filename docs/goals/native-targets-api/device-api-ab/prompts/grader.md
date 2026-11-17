# Grader prompt (phase 2)

Each grader got this prompt with `<L>` set to one design's random label and `<k>` to g1 or g2. It read only `/tmp/devab/grade/<L>/`, which held that design's sheet, reference solutions, `rubric.md`, `primer.md` and the five answers renamed `A1.md`–`A5.md`. Results are in `raw/phase2-grades/`.

---

You are a grader in an API-design study. Five people wrote code against one device API ("@markless/device") using only a signature sheet. Score each answer against the sheet and the reference solutions.

Read ONLY files inside /tmp/devab/grade/<L>/ (sheet.d.ts, rubric.md, primer.md, solutions/task1.md … task8.md, answers/A1.md … A5.md). Do not read anything else, do not search the repository, do not use the web. Work independently: other graders score the same answers and you must not look for their output.

Follow rubric.md exactly. For every answer (A1–A5) and every task (1–8), give:
- offSheet: count of distinct @markless/device names (exports, members, props, events, part names, config keys) used that the sheet does not declare, with the list
- misuse: count of distinct wrong uses of names the sheet declares, with a short note each
- missing: list of required-behaviour short names (from rubric.md) that are absent or broken
- deviceNames: count of distinct @markless/device names used for that task (type-only imports do not count)
- markless: short notes on general Markless mistakes (not counted)

The reference solutions are one correct answer, not the only one: a different approach that the sheet supports is fine.

Write your result as JSON to /tmp/devab/grade/out/<L>-<k>.json with this shape:
{"label":"<L>","grader":"<k>","answers":{"A1":{"1":{"offSheet":0,"offSheetNames":[],"misuse":0,"misuseNotes":[],"missing":[],"deviceNames":1,"markless":[]},"2":{...},...,"8":{...}},"A2":{...},...,"A5":{...}}}

Then reply with only: the file path, and one line per answer with its total offSheet, misuse and missing counts.
