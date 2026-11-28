You are a scorer in a package-naming study. Read ONLY files inside /tmp/pkgname/score/cold/. Do not read anything else, do not search the repository, do not use the web.

key.md is the answer key, written before any reader ran. pages/<id>.tsrx is the page each reader saw: the id is the package name, except "base-ui", which is the package `@markless/base` with its single-pieces namespace renamed to `ui`. raw/<id>-<framing>-<n>.md is one reader's cold answer to the seven questions about that page. There are 60 readers (10 pages x 2 framings x 3).

For each reader, mark against key.md:

- a (1 or 0): question 1, what is in the package.
- b (1 or 0): question 2, unstyled. The reading the reader leans to counts; "unstyled or nearly unstyled" / "unstyled or close to it" with a lean to unstyled is 1; "mostly unstyled, maybe a default theme" is 1 only if they lean unstyled; an even 50/50 with no lean is 0.
- c (1 or 0): question 3, works in the iPhone and Android apps. A yes that guesses it renders in a web view is still 1.
- q4 (1 or 0): question 4, looks in this package first.
- q5 (1 or 0): question 5, both halves present (native = platform-drawn / per platform; this package = drawn by the framework or author, the same everywhere).
- q6: a few words summarising what the reader expects the other package (`@markless/ui`, or for the ui page `@markless/components`) to be, e.g. "styled layer on top", "same thing, confused", "umbrella re-export".
- q7 (1 or 0): question 7, the inner namespace read as a group of simple single pieces inside this package.
- q7Clash (1 or 0): the reader remarks that the inner namespace and the package share a name or clash (for "base" and "base-ui" pages; 0 elsewhere unless they raise it).
- zeros: for every 0 among a, b, c, q4, q5, q7, a short verbatim quote from the reader that caused it, keyed by the mark name.
- wrongMeanings: every place the reader gives the PACKAGE NAME a meaning of its own that is not the intended one and that comes from the word itself, as {"question": "1".."7", "quote": "<verbatim>", "meaning": "<a few words>"}. key.md lists examples. Doubt about styling that the reader does not tie to the word is not a wrong meaning; "kit could mean a styled kit" said as a doubt while still leaning unstyled is not a wrong meaning; a firm reading such as "base means the default theme" is. Meanings given to the inner namespace go in q7, not here.

Write JSON to /tmp/pkgname/score/cold/out/s2.json with this shape:
{"ui-beginner-1":{"a":1,"b":1,"c":1,"q4":1,"q5":1,"q6":"styled layer on top","q7":1,"q7Clash":0,"zeros":{},"wrongMeanings":[]},…}

Then reply with only the file path and, per page id, how many of its 6 readers have a, b and c all 1, and how many have any wrong meaning.
