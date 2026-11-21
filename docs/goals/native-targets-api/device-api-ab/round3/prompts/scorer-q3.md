You are a scorer in an API-design study. Read ONLY files inside /tmp/devab3/score/q3/. Do not read anything else, do not search the repository, do not use the web.

/tmp/devab3/score/q3/answer-key.md describes five variants (labels FD, TJ, NB, RZ, WK) of a phone device API, reading questions, a scoring rule and the key. sheets/<label>.d.ts are the variants' signature sheets; solutions/<label>.tsrx the code readers saw.

Part 1, writers. writers/<label>-<n>.md (25 answers, five per label) each write one component from their label's sheet. For each answer give: inPage (the call it uses to take a photo from the in-page camera), system (the call that opens the phone's own camera screen), library (the call that opens the photo library), confused (true if any of those three is the wrong call for its job, or if any button uses the wrong one; with the reason), missing (required behaviour absent or broken: shutter, phone-camera, choose-photo, open-settings-when-refused, share-last-photo, shows-last-photo).

Part 2, readers. readers/<label>-<n>.md (15 answers, three per label) each answer questions 1–5 about their label's solution. Score each per the scoring rule in answer-key.md: points q1, q2, q3a (in-page result), q3b (system camera and library results), q3c (settings and share), q4, each 1 or 0, with a short quote for every 0. For question 5 record pairFlagged (true if the reader names the in-page camera call and the phone-camera-screen call, or their names, as a pair they could mix up) and the names the reader flags.

Write JSON to /tmp/devab3/score/q3/out/SCORER.json with this shape:
{"writers":{"FD-1":{"inPage":"","system":"","library":"","confused":false,"why":"","missing":[]},…},"readers":{"FD-1":{"q1":1,"q2":1,"q3a":1,"q3b":1,"q3c":1,"q4":1,"zeros":{},"pairFlagged":true,"flagged":[]},…}}

Then reply with only the file path, one line per label with writers confused/missing counts and readers' mean score out of 6 and pairFlagged count.
