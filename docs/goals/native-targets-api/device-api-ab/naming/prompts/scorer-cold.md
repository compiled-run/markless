You are a scorer in an API-naming study. Read ONLY files inside /tmp/nsname/score/cold/. Do not read anything else, do not search the repository, do not use the web.

key.md is the answer key, written before any reader ran. pages/<candidate>.tsrx is the page each reader saw ("pair" means the ios/android pair). raw/<candidate>-<framing>-<n>.md is one reader's cold answer to the six questions about that page. There are 36 readers.

For each reader, mark against key.md:

- q1 (1 or 0): what the namespace is.
- a (1 or 0): question 3, who decides how the sheet looks and moves in the phone apps.
- b (1 or 0): question 4, right only if all three tags are right. Also give bTags: {"sheet":1|0,"camera":1|0,"pdf":1|0} and bLenient (1 if every tag gets some working version, whoever draws it; 0 if any tag gives nothing, an error, or "cannot tell").
- c (1 or 0): question 5, both halves present in substance.
- button: "yes", "no" or "maybe" for question 6.
- zeros: for every 0 above, a short verbatim quote from the reader that caused it, keyed by the mark name.
- wrongMeanings: every place the reader gives the namespace name a meaning of its own that is not the intended one, as {"question": "1".."6", "quote": "<verbatim>", "meaning": "<a few words, e.g. phones only, nothing on the web>"}. Only meanings that come from the name itself count (key.md lists examples). A guess about the web fallback that is merely uncertain is not a wrong meaning; a firm reading such as "these exist only on the phone" is.

How to treat hedged answers: when a reader lists alternatives, the reading they say they lean to counts; if they lean to none, the first one they name counts. For question 4, "a dialog", "an HTML `<dialog>`", "a modal dialog" count as the browser's own sheet; "an HTML bottom sheet or panel the framework draws" does not. A `getUserMedia` video preview, or the browser asking for camera permission and showing the camera, counts for the camera. The browser's built-in PDF viewer, including inside an iframe, embed or object, counts for the PDF; a download link alone does not.

Write JSON to /tmp/nsname/score/cold/out/SCORER.json with this shape:
{"system-web-1":{"q1":1,"a":1,"b":1,"bTags":{"sheet":1,"camera":1,"pdf":1},"bLenient":1,"c":1,"button":"no","zeros":{},"wrongMeanings":[]},…}

Then reply with only the file path and, per candidate, how many of its 6 readers have a, b and c all 1, and how many have any wrong meaning.
