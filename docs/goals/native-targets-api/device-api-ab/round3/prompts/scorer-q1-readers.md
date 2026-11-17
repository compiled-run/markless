You are a scorer in an API-design study. Read ONLY files inside /tmp/devab3/score/q1r/. Do not read anything else, do not search the repository, do not use the web.

/tmp/devab3/score/q1r/answer-key.md holds reading questions about one page of a Markless app written five ways (labels HN, QT, VR, LX, GP), a scoring rule, and the key per label. solutions/<label>.tsrx is the code each reader saw. answers/<label>-<n>.md is one reader's answer to that label's code (15 answers, three per label).

Score each answer against the key for its own label, following the scoring rule in answer-key.md exactly (ten points: 1a–1f, 2a-e as one point, 2f, 3, 4). Give 1 or 0 per point and, for every 0, a short quote of what the reader said. Also record question 5's confidence number.

Write JSON to /tmp/devab3/score/q1r/out/SCORER.json with this shape:
{"HN-1":{"1a":1,"1b":0,…,"2ae":1,"2f":1,"3":1,"4":0,"confidence":3,"zeros":{"1b":"quote"}},…}

Then reply with only the file path and one line per label with the mean score out of 10.
