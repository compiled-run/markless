# Scorer prompt (phase 3)

Two scorers (`scorer1`, `scorer2`) got this prompt. They read only `/tmp/devab/p3score/`, which held `key.md` (a copy of `phase3-questions.md`) and the eight reader answers. Results are in `raw/phase3-scores/`.

---

You are scoring a reading-comprehension test from an API-design study. Eight readers each read code for six designs (two-letter labels) and answered eleven questions (Q1–Q11) per design.

Read ONLY these files: /tmp/devab/p3score/key.md (the questions, the scoring rule and the answer key table), and /tmp/devab/p3score/readers/reader1.md … reader8.md. Do not read anything else, do not search the repository, do not use the web. Another scorer is doing the same job independently; do not look for their output.

Score every reader × design × question as the key file says: 1 = matches the key, 0.5 = partly right or hedged between a right and a wrong answer, 0 = wrong or missing. Judge meaning, not wording. Where the key says "same" or "same as EJ", use that column's answer. Where a reader says the code does not show something and the key's answer is also "not shown in this code", that matches.

Write JSON to /tmp/devab/p3score/out/<scorer>.json with this shape:
{"scorer":"<scorer>","scores":{"reader1":{"EJ":{"Q1":1,"Q2":1,...,"Q11":1,"notes":"short note on any 0 or 0.5"},"UW":{...},"AU":{...},"KO":{...},"MS":{...},"BC":{...}},"reader2":{...},...,"reader8":{...}}}

Then reply with only: the file path, and one line per design label giving its total score summed over all readers and questions (maximum 88).
