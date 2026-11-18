Thank you. Here are rules Markless could use for how these look on phones. Answer from this message and the earlier one alone; do not use any tools.

Rule 1 (automatic): On iPhone and Android, a `<dialog>` and the `modal` family are drawn as a bottom sheet by default: the panel slides up from the bottom edge, the grab handle and swipe-to-close included. The author's CSS on the dialog or on `modal.content` (for example `margin: auto` or `inset`) overrides that placement. An alert dialog (`<modal.root alert>` or `<dialog role="alertdialog">`) stays a centered box. The `drawer` family is a bottom sheet on every platform. On the website, `<dialog>` and `modal` are centered boxes.

Rule 2 (literal): `<dialog>` and the `modal` family are centered boxes on every platform, iPhone and Android included. The `drawer` family is a panel that slides in from the bottom edge (a bottom sheet) on every platform. Choose the one you want.

Rule 3 (literal, with an opt-in): `<dialog>` and the `modal` family are centered boxes on every platform, iPhone and Android included. The `drawer` family is a panel that slides in from the bottom edge (a bottom sheet) on every platform. To make one dialog or modal become a bottom sheet on iPhone and Android only (it stays a centered box on the website), add the boolean `adaptive` to it: `<modal.root adaptive>` or `<dialog adaptive>`.

Questions:
A. Which rule matches what you predicted for the iPhone in question 1? Name it, or say none.
B. Which rule would you want Markless to have, and why?
C. Under each rule, what would surprise you most on a phone?

Output format: lines `A:`, `B:` (start with the rule number), `C:`; end with `Tools used: none`.
