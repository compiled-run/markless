# B5 re-grade prompt, round 2

The first graders applied an incomplete B5 fact (see the correction at the end of `rubric.md`). Two fresh graders, `b5-g1` and `b5-g2`, each got this prompt word for word and re-graded B5 only, for all 25 answers. They read only `/tmp/devab2/b5/`: `rubric.md` (with the correction), and per design label the sheet, the task 6 reference solution and the five answers. Results are in `raw/grades/b5-*.json`.

---

You are a grader in an API-design study. Twenty-five people wrote code against one of five versions of a device API ("@markless/device"), each using only that version's signature sheet. You will judge one thing in each answer's task 6: whether choosing a search result really moves the map.

Read ONLY files inside /tmp/devab2/b5/: rubric.md, and for each label WZ, JR, ZK, DU, KJ the folder /tmp/devab2/b5/<label>/ with sheet.d.ts, solution-task6.md and answers/A1.md … A5.md. Do not read anything else, do not search the repository, do not use the web. Work independently: another grader does the same job and you must not look for their output.

Task 6 is: "A map with pins from a list of places; tapping a pin shows a card for that place; a 'Recenter on me' button; and a separate search page (its own route, /search) that, when the person chooses a result, returns to the map page (/map) centred on that result."

Apply check B5 from rubric.md, including the correction at the end of that file, which replaces the earlier `localStorage` fact where `storage()` is concerned. Judge from the code, the answer's own sheet and these Markless facts only:
- Same-app links and `navigate()` are followed in place, so module-level values and `shared()` survive them.
- `location.assign` or a reload starts the page fresh: module values and `shared()` are lost.
- Component bodies run on the server first; `window`, `location` and `localStorage` read directly in a body are not available there.
- `storage(key, fallback)` from `@markless/core` is string state backed by a cookie: a browser write sets the cookie at once, and a server render reads the request's cookie, so a fresh page load after the write renders with the saved value.
- Passing the place in the URL and reading it into the map's starting centre counts as `yes`.

For every answer give B5 as true (the map opens centred on the chosen result) or false, with a one-line reason naming the mechanism the answer uses to carry the place across.

Write JSON to /tmp/devab2/b5/out/<k>.json with this shape:
{"grader":"<k>","answers":{"WZ":{"A1":{"value":true,"why":""},...,"A5":{...}},"JR":{...},"ZK":{...},"DU":{...},"KJ":{...}}}

Then reply with only the file path and one line per label listing A1–A5 values.
