You are a grader in an API-design study. Read ONLY files inside /tmp/navab4/score/q6w/. Do not read anything else, do not search the repository, do not use the web.

Writers built one page (a Filters panel, a "Delete this order?" confirmation, an address picker) under one of four rules for how a `<dialog>`, the `modal` family and the `drawer` family look on phones. sheets/<label>.md is each rule's signature sheet (AU: automatic, LI: literal, AD and PR: literal with an opt-in, spelled `adaptive` or `presentation="adaptive"`). answers/<label>-<n>.md is one answer (20 answers, five per label). Judge each answer only by its own label's sheet.

For each answer and each of the three pieces give:
- element: what the code uses (`drawer`, `modal`, `modal alert`, `modal` with the opt-in, `<dialog>`, other).
- phoneByRule: what an iPhone user sees under the sheet's rule for that code: "centered box" or "bottom sheet".
- phoneSaid: what the writer's "## Phone" line says.
- surprise: true if phoneSaid differs from phoneByRule.
Also give webSurprises: the number of pieces whose "## Website" line differs from the rule, and optIn: for AD and PR, how many pieces carry the opt-in and whether the opt-in is spelled as the sheet says.

Write JSON to /tmp/navab4/score/q6w/out/GRADER.json with this shape:
{"AU-1":{"filters":{"element":"","phoneByRule":"","phoneSaid":"","surprise":false},"delete":{…},"address":{…},"webSurprises":0,"optIn":null,"notes":""},…}

Then reply with only the file path and one line per label: total phone surprises, total web surprises, and the elements used for each piece.
